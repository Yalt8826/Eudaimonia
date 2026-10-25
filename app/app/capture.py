"""T2.3 — the capture door and its agent triage.

One raw-text dump, many doors (fuzzel on athena, the mobile capture
sheet, later the PWA FAB), one inbox, one triage path. Everything lands
as ``capture_raw`` app-write events; triage goes through
``agent_invoke`` ONLY (02 §2 law 12 — the chokepoint's first real
consumer; grep-able, no raw agent transport anywhere else).

The triage contract (PHASE-P2 T2.3):

- **Timeout 180 s, single attempt** — ~3 min headroom inside the 5-min
  exit budget. Manual re-triage is the retry path, never auto-retry.
- **Failure can never read as success** (02 §6): the chokepoint always
  emits a terminal outcome; a capture is ``triaged`` only when the
  success predicate passes — the response parses to EXACTLY ONE legal
  target word. Anything else (timeout, crash, junk output) emits
  ``capture_triaged_failure`` and the capture stays untriaged. Nothing
  silently lands as a note.
- **Append-only**: a human re-triage override is a NEW event; the
  original triage event is never edited.

Target words — the spec's five nouns are task / question / loop / note /
meal. The ``loop`` row carries a NOT NULL direction (owed-by-me /
owed-to-me), so the legal response set refines loop into
``loop-by-me`` / ``loop-to-me``: still exactly one word, and the
direction arrives with the noun instead of being defaulted (defaulting
a direction would fabricate data — 02 §2 law 7's spirit).

Landings (each target mints exactly its domain landing + ONE provenance
edge ``capture_raw -> capture_triaged``, 03 §15):

- ``task``       -> ``task_seen`` app-write event (tasks ride payloads —
                    07 §19 amendment (a); no task table exists)
- ``question``   -> ``question`` row (status defaults open; T2.5 wires
                    the lifecycle)
- ``loop-*``     -> ``loop`` row with the triaged direction
- ``note``       -> capture_triaged only (T2.4's write path consumes)
- ``meal``       -> capture_triaged only (T2.6's path consumes)

Domain landings carry ``actor='system'``: the CONTENT is the human's,
but the filing was decided by triage — attribution stays honest because
the ``capture_triaged`` event right beside it carries the profile as
actor (plum), with a provenance edge back to the raw capture.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from typing import Any

from app import agent_invoke as ai
from app import db

__all__ = [
    "CaptureError",
    "land_capture",
    "parse_target",
    "pending_captures",
    "triage_capture",
    "triage_pending",
    "triage_prompt",
]

TARGETS: frozenset[str] = frozenset(
    {"task", "question", "loop-by-me", "loop-to-me", "note", "meal"}
)
"""Exactly-one legal response words (see module docstring for the loop
refinement). The prompt and the success predicate share this set."""

ORIGINS: frozenset[str] = frozenset({"fuzzel", "pwa", "mobile"})
"""Doors that may land a capture. The mobile OFFLINE queue drains through
the generic /api/events/capture_raw door instead (T2.1 armor) — this set
is for the direct door's origin field."""

MAX_TEXT_LEN = 4096
"""A capture is a quick dump, not a document. The cap keeps a runaway
paste from becoming a 2 MB spine event; longer thoughts belong in notes."""

TRIAGE_PROFILE = "clio"
TRIAGE_TIMEOUT_S = 180.0
"""Single attempt, ~3 min headroom inside the 5-min exit budget. The
budget is the exit test, not a knob (PHASE-P2 T2.3 If-it-fails)."""

PROMPT_TEMPLATE = """You are triaging a raw capture for a personal life-OS.
Classify it into EXACTLY ONE of these six words:
task, question, loop-by-me, loop-to-me, note, meal

Meanings:
- task: an action for me to do
- question: something to find out
- loop-by-me: a waiting-on where I owe someone
- loop-to-me: a waiting-on where someone owes me
- note: a thought worth keeping, no action
- meal: food I ate or will eat

Reply with the single word only. Nothing else.

Capture: {text}"""


class CaptureError(ValueError):
    """The body violates the capture contract — the route maps this to a 422."""


def parse_target(stdout: str) -> str | None:
    """Strict: the output must BE exactly one legal word, nothing else."""
    word = stdout.strip().lower()
    return word if word in TARGETS else None


def land_capture(
    conn: sqlite3.Connection, *, text: str | None, photo_ref: str | None, origin: str
) -> dict[str, object]:
    """Validate the body, land the capture_raw event, return its identity."""
    if origin not in ORIGINS:
        raise CaptureError(
            f"origin must be one of {sorted(ORIGINS)}, got {origin!r}"
        )
    if (text is None) == (photo_ref is None):
        raise CaptureError("exactly one of text | photo_ref is required")
    if text is not None:
        text = text.strip()
        if not text:
            raise CaptureError("text cannot be empty")
        if len(text) > MAX_TEXT_LEN:
            raise CaptureError(f"text exceeds {MAX_TEXT_LEN} characters")
    if photo_ref is not None and not photo_ref.strip():
        raise CaptureError("photo_ref cannot be empty")

    now = db.utc_now_iso()
    external_ref = f"{origin}:{now}"
    capture_id = db.insert_event(
        conn,
        kind="capture_raw",
        origin="app-write",
        source_id=db_get_app_source(conn),
        external_ref=external_ref,
        actor="human",
        payload={"text": text, "photo_ref": photo_ref, "origin": origin},
        ts=now,
    )
    conn.commit()
    return {
        "capture_id": capture_id,
        "external_ref": external_ref,
        "status": "captured",
    }


def db_get_app_source(conn: sqlite3.Connection) -> int:
    """The app source row (shared with ingest — one source, one definition)."""
    from app.ingest import get_or_create_app_source

    return get_or_create_app_source(conn)


def triage_prompt(text: str) -> str:
    return PROMPT_TEMPLATE.format(text=text)


def _success_predicate(stdout: str, exit_code: int | None) -> bool:
    """Triage passed iff the output parses to exactly one legal target."""
    return exit_code == 0 and parse_target(stdout) is not None


def _load_capture(conn: sqlite3.Connection, external_ref: str) -> dict[str, Any]:
    row = conn.execute(
        "SELECT payload, ts FROM event"
        " WHERE kind = 'capture_raw' AND external_ref = ?"
        " ORDER BY id DESC LIMIT 1",
        (external_ref,),
    ).fetchone()
    if row is None:
        raise CaptureError(f"no capture_raw event with ref {external_ref!r}")
    payload = json.loads(row["payload"])
    return {
        "text": payload.get("text") or "",
        "photo_ref": payload.get("photo_ref"),
        "ts": row["ts"],
    }


def _triaged_ref(capture_ref: str, attempt: int = 1) -> str:
    return f"{capture_ref}:triaged" if attempt == 1 else f"{capture_ref}:triaged:{attempt}"


def _failure_ref(capture_ref: str, attempt: int = 1) -> str:
    return f"{capture_ref}:failure" if attempt == 1 else f"{capture_ref}:failure:{attempt}"


def triage_capture(
    conn: sqlite3.Connection, capture_ref: str, attempt: int = 1
) -> dict[str, object]:
    """Run ONE capture through the chokepoint and land the result.

    Success: capture_triaged (actor = the profile, plum) + provenance edge
    + the domain landing. Any terminal failure: capture_triaged_failure
    and NOTHING lands — the capture stays untriaged, visibly. A manual
    re-triage passes attempt >= 2 so its events append beside the originals
    (append-only: the first triage event is never edited or replaced).
    """
    capture = _load_capture(conn, capture_ref)
    text = capture["text"]
    if not text:
        # photo captures have no text to triage; T2.6 owns them. A failure
        # event would lie (nothing was attempted) — report skipped instead.
        return {"capture_ref": capture_ref, "state": "skipped", "reason": "no text"}

    result = ai.agent_invoke(
        TRIAGE_PROFILE,
        triage_prompt(text),
        TRIAGE_TIMEOUT_S,
        _success_predicate,
        conn,
    )

    if result.outcome != "ok":
        db.insert_event(
            conn,
            kind="capture_triaged_failure",
            origin="agent-write",
            source_id=None,
            external_ref=_failure_ref(capture_ref, attempt),
            actor=TRIAGE_PROFILE,
            payload={
                "capture_ref": capture_ref,
                "reason": result.outcome,
                "invocation_ref": result.external_ref,
            },
        )
        conn.commit()
        return {
            "capture_ref": capture_ref,
            "state": "untriaged",
            "reason": result.outcome,
        }

    target = parse_target(result.stdout)
    if target is None:
        # the chokepoint said ok but the parse disagrees — never happens
        # (the predicate IS the parse), guarded for the type system.
        raise RuntimeError("ok outcome without a parseable target")

    triaged_ref = _triaged_ref(capture_ref, attempt)
    db.insert_event(
        conn,
        kind="capture_triaged",
        origin="agent-write",
        source_id=None,
        external_ref=triaged_ref,
        actor=TRIAGE_PROFILE,
        payload={
            "capture_ref": capture_ref,
            "target": target,
            "invocation_ref": result.external_ref,
        },
    )
    conn.execute(
        "INSERT INTO provenance_edge (from_ref, to_ref, type, ts) VALUES (?, ?, ?, ?)",
        (capture_ref, triaged_ref, "triage", db.utc_now_iso()),
    )

    source_id = db_get_app_source(conn)
    landing: dict[str, object]
    if target == "task":
        landing_ref = f"{capture_ref}:task"
        db.insert_event(
            conn,
            kind="task_seen",
            origin="app-write",
            source_id=source_id,
            external_ref=landing_ref,
            actor="system",
            payload={"text": text, "capture_ref": capture_ref},
        )
        landing = {"target": "task", "ref": landing_ref}
    elif target == "question":
        now = db.utc_now_iso()
        cursor = conn.execute(
            "INSERT INTO question (text, ts) VALUES (?, ?)", (text, now)
        )
        landing = {"target": "question", "question_id": cursor.lastrowid}
    elif target in ("loop-by-me", "loop-to-me"):
        direction = "owed-by-me" if target == "loop-by-me" else "owed-to-me"
        now = db.utc_now_iso()
        cursor = conn.execute(
            "INSERT INTO loop (text, direction, ts) VALUES (?, ?, ?)",
            (text, direction, now),
        )
        landing = {"target": "loop", "direction": direction, "loop_id": cursor.lastrowid}
    else:  # note | meal — T2.4 / T2.6 consume these; triaged is the record
        landing = {"target": target, "ref": triaged_ref}

    conn.commit()
    return {"capture_ref": capture_ref, "state": "triaged", **landing}


def pending_captures(conn: sqlite3.Connection) -> list[str]:
    """capture_raw refs with no terminal triage outcome — the retry sweep's
    work list (offline mobile captures land here when the queue drains)."""
    rows = conn.execute(
        "SELECT e.external_ref FROM event e"
        " WHERE e.kind = 'capture_raw'"
        " AND NOT EXISTS (SELECT 1 FROM event t WHERE t.kind IN"
        "   ('capture_triaged', 'capture_triaged_failure')"
        "   AND t.external_ref LIKE e.external_ref || ':triaged%')"
        " AND NOT EXISTS (SELECT 1 FROM event t WHERE t.kind ="
        "   'capture_triaged_failure'"
        "   AND t.external_ref LIKE e.external_ref || ':failure%')"
        " ORDER BY e.id"
    ).fetchall()
    return [r["external_ref"] for r in rows]


_triage_sweep_lock = threading.Lock()
"""Serializes sweeps. Measured live (T2.3 exit test, 2026-10-24): a
four-capture burst schedules FOUR concurrent sweeps, each racing the same
pending list — duplicate invocations of the same capture (the profile
lock serialized the agents, not the sweeps) and colliding writes. One
sweep at a time; a later sweep re-reads pending inside the lock and finds
only genuinely new work."""


def triage_pending(conn: sqlite3.Connection | None = None) -> list[dict[str, object]]:
    """Triage everything pending, oldest first. Called after any capture
    lands (direct door or the offline queue's drain) as a background task:
    opens its own connection when called without one."""
    with _triage_sweep_lock:
        owns_conn = conn is None
        if conn is None:
            conn = db.connect(db.db_path())
        try:
            results: list[dict[str, object]] = []
            for ref in pending_captures(conn):
                results.append(triage_capture(conn, ref))
            return results
        finally:
            if owns_conn:
                conn.close()


def recent_captures(conn: sqlite3.Connection, limit: int = 20) -> list[dict[str, object]]:
    """Recent captures, newest first, each with its honest triage state:
    triaged (with the target), failed (with the reason), or untriaged
    (nothing terminal yet — the retry affordance's work list)."""
    rows = conn.execute(
        "SELECT id, ts, external_ref, payload FROM event"
        " WHERE kind = 'capture_raw' ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    out: list[dict[str, object]] = []
    for r in rows:
        ref = r["external_ref"]
        text: str | None = None
        photo_ref: str | None = None
        try:
            payload = json.loads(r["payload"])
            text = payload.get("text")
            photo_ref = payload.get("photo_ref")
        except json.JSONDecodeError:
            pass
        latest = conn.execute(
            "SELECT kind, payload, ts FROM event"
            " WHERE (external_ref LIKE ? OR external_ref LIKE ?)"
            " AND kind IN ('capture_triaged', 'capture_triaged_failure')"
            " ORDER BY id DESC LIMIT 1",
            (ref + ":triaged%", ref + ":failure%"),
        ).fetchone()
        state: dict[str, object] = {"state": "untriaged"}
        if latest is not None:
            p = json.loads(latest["payload"])
            if latest["kind"] == "capture_triaged":
                state = {"state": "triaged", "target": p.get("target")}
            else:
                state = {"state": "failed", "reason": p.get("reason")}
        out.append(
            {
                "capture_id": r["id"],
                "external_ref": ref,
                "ts": r["ts"],
                "text": text,
                "photo_ref": photo_ref,
                **state,
            }
        )
    return out


def retriage(conn: sqlite3.Connection, capture_ref: str) -> dict[str, object]:
    """The MANUAL retry path (PHASE-P2 T2.3: manual re-triage is the retry
    path, never auto-retry). Runs a fresh triage attempt beside whatever
    came before — append-only, original events intact."""
    attempt_row = conn.execute(
        "SELECT COUNT(*) FROM event"
        " WHERE (external_ref LIKE ? OR external_ref LIKE ?)"
        " AND kind IN ('capture_triaged', 'capture_triaged_failure')",
        (capture_ref + ":triaged%", capture_ref + ":failure%"),
    ).fetchone()
    attempt = attempt_row[0] + 1
    return triage_capture(conn, capture_ref, attempt=attempt)
