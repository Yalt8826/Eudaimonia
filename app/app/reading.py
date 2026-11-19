"""The reading queue (T3.1) — status, ratings, and the banner.

The queue's rows are reading_seeded events (the arXiv ID is the stable
key, the external_ref makes them idempotent); the reading_item rows are
the cache the fold updates. Single-writer with the app's usual shape:
the phone posts reading_status / rating_staged through the ingest door,
the event lands FIRST, and the row changes after (03 #5) — an event
without its row is recoverable, a row without its event is drift.

The banner reads the zetesis-digest source's job_paused event (actor
human — the app never pauses, law 5): paused is human-declared evidence,
never a hardcoded date and never inferred from staleness.
"""

from __future__ import annotations

import json
import re
import sqlite3
from typing import Any

from app import db

READING_STATUSES: tuple[str, ...] = ("new", "skimmed", "digested", "dismissed")
"""The queue's status flow (02 §3). Every transition is a reading_status
app-write event; the row follows."""

EVENT_KINDS: frozenset[str] = frozenset({"reading_status", "rating_staged"})
"""The client-postable reading kinds (EXECUTION §7 registry rows). The
seed (reading_seeded) is agent/system-side and never rides this door."""

ARXIV_ID_RE = re.compile(r"^[a-z0-9.\-/]{4,64}$")
"""A normalized arXiv ID: lowercase, version stripped, no whitespace and
no ':' (it rides inside external_ref zetesis:{arxiv_id})."""

MAX_TITLE = 300


class ReadingError(ValueError):
    """The payload violates the reading contract — routes map this to a 422."""


def validate_event(kind: str, payload: dict[str, Any]) -> None:
    """Contract checks for one client reading event (raises ReadingError)."""
    if kind == "reading_status":
        validate_status(payload)
    elif kind == "rating_staged":
        validate_rating(payload)
    else:
        msg = f"not a reading kind: {kind!r}"
        raise ReadingError(msg)


def validate_status(payload: dict[str, Any]) -> tuple[str, str]:
    arxiv_id = payload.get("arxiv_id")
    status = payload.get("status")
    if not isinstance(arxiv_id, str) or ARXIV_ID_RE.match(arxiv_id) is None:
        msg = "arxiv_id must be a normalized id (4-64 chars, lowercase, no ':')"
        raise ReadingError(msg)
    if status not in READING_STATUSES:
        msg = f"status must be one of {READING_STATUSES}, got {status!r}"
        raise ReadingError(msg)
    return arxiv_id, status


def validate_rating(payload: dict[str, Any]) -> tuple[str, int]:
    arxiv_id = payload.get("arxiv_id")
    rating = payload.get("rating")
    if not isinstance(arxiv_id, str) or ARXIV_ID_RE.match(arxiv_id) is None:
        msg = "arxiv_id must be a normalized id (4-64 chars, lowercase, no ':')"
        raise ReadingError(msg)
    if isinstance(rating, bool) or not isinstance(rating, int) or not 1 <= rating <= 5:
        msg = "rating must be an integer 1-5"
        raise ReadingError(msg)
    return arxiv_id, rating


def _row_id(conn: sqlite3.Connection, arxiv_id: str) -> int | None:
    row = conn.execute(
        "SELECT payload FROM event WHERE kind = 'reading_seeded' AND external_ref = ?",
        (f"zetesis:{arxiv_id}",),
    ).fetchone()
    if row is None:
        return None
    payload = json.loads(row["payload"])
    row_id = payload.get("row_id")
    return int(row_id) if isinstance(row_id, int) else None


def apply_status(conn: sqlite3.Connection, arxiv_id: str, status: str) -> None:
    """The event already landed (the ingest door) — the row follows it.
    An unknown id updates nothing: the queue fold is the truth, the row
    is its cache."""
    row_id = _row_id(conn, arxiv_id)
    if row_id is None:
        return
    conn.execute("UPDATE reading_item SET status = ? WHERE id = ?", (status, row_id))
    conn.commit()


def apply_rating(conn: sqlite3.Connection, arxiv_id: str, rating: int) -> None:
    row_id = _row_id(conn, arxiv_id)
    if row_id is None:
        return
    conn.execute(
        "UPDATE reading_item SET rating = ?, staged_ts = ? WHERE id = ?",
        (rating, db.utc_now_iso(), row_id),
    )
    conn.commit()


def apply_event(conn: sqlite3.Connection, kind: str, payload: dict[str, Any]) -> None:
    """The ingest door's background fold (mirrors loops.apply_resolution_
    event): route a landed reading event to its row update."""
    if kind == "reading_status":
        arxiv_id, status = validate_status(payload)
        apply_status(conn, arxiv_id, status)
    elif kind == "rating_staged":
        arxiv_id, rating = validate_rating(payload)
        apply_rating(conn, arxiv_id, rating)


def banner(conn: sqlite3.Connection) -> dict[str, object]:
    """The digest's paused evidence: a human-authored job_paused event for
    the zetesis-digest source (law 5). Absent → not paused — staleness is
    never promoted into a pause."""
    row = conn.execute(
        "SELECT p.ts, p.actor FROM event p"
        " JOIN source s ON s.id = p.source_id"
        " WHERE s.name = 'zetesis-digest' AND p.kind = 'job_paused'"
        " AND p.actor = 'human'"
        " ORDER BY p.id DESC LIMIT 1",
    ).fetchone()
    if row is None:
        return {"paused": False}
    return {"paused": True, "since": str(row["ts"]), "actor": str(row["actor"])}


def queue(conn: sqlite3.Connection) -> dict[str, object]:
    """The reading queue, newest-seeded first. One row per unique arXiv
    paper: title/status/rating from the reading_item cache, the edition
    it came from from the seeded event. Rows are canonical."""
    items: list[dict[str, object]] = []
    rows = conn.execute(
        "SELECT e.external_ref, e.ts, e.payload, r.status, r.rating, r.staged_ts"
        " FROM event e JOIN reading_item r ON r.id ="
        "   CAST(json_extract(e.payload, '$.row_id') AS INTEGER)"
        " WHERE e.kind = 'reading_seeded'"
        " ORDER BY e.id DESC",
    ).fetchall()
    for row in rows:
        payload = json.loads(row["payload"])
        items.append(
            {
                "arxiv_id": payload.get("arxiv_id"),
                "title": payload.get("title"),
                "edition_date": payload.get("edition_date"),
                "edition_ref": payload.get("edition_ref"),
                "status": row["status"],
                "rating": row["rating"],
                "staged_ts": row["staged_ts"],
                "ts": str(row["ts"]),
            }
        )
    return {"banner": banner(conn), "items": items}
