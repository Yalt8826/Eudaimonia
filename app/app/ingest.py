"""The app-write ingest path (P2 T2.1) — the one server door clients POST through.

Thin clients — the phone's outbox (mobile/src/data/queue.ts), the PWA
service-worker queue (client/src/sw/queue.ts), and later the fuzzel
capture door — POST one event as JSON to ``/api/events/{kind}``. The
wire shape is the queue's ReplayBody, fixed since M3:

    {"idempotency_key": <device UUID, same on every event>,
     "kind": "habit_tap",
     "ts": <epoch ms — the tap time, client clock>,
     "ingested_at": <epoch ms — the retry time, client clock>,
     "payload": {"method": "tap" | "recall"}}

Laws this module answers to (02 §2, 02 §6):

- **One write path.** The event goes through ``db.insert_event`` into the
  spine and nowhere else; no entity table is touched. Adapters (P1) are
  the readers of what lands here.
- **Idempotency is the spine's UNIQUE(source_id, kind, external_ref),
  and external_ref is built from idempotency_key AND ts** — "{key}:{ts}".
  The idempotency_key is NOT unique per event: it is the device UUID,
  one value per install for the install's whole life (the T2.1 [impl]
  note, and the M3 warning parked at mobile/src/data/queue.ts).
  Deduping on the key alone would make a device's first wake tap the
  last event it ever stores — silently, forever.
- **source_id is never NULL here.** SQLite treats NULLs as distinct
  inside a UNIQUE constraint (migration 001 header), so a NULL source_id
  would silently break dedupe. Every client POST attaches the one
  behavioral source row this module owns ("app"), get-or-created on
  first use. The phone IS a behavioral source (02 §2 law 4 names
  wake-taps); the Plaza's P1 read model will see it through `coverage`.
- **ts is the tap time** — content-derived (law 3): the client clock at
  the tap, converted to ISO8601 and stored as event.ts. ``ingested_at``
  is stamped by the SERVER at successful receipt and rides the payload
  (the event table is frozen v0.1 — no new columns, 02 §6). The client's
  own ingested_at is preserved alongside it as ``client_ingested_at`` so
  client→server latency stays measurable.
- **Failure can never read as success** (02 §6). A body that violates
  the contract — unknown kind, bad method, a clock from next year — is a
  4xx, which the outbox is built to surface, never a quiet 200.
"""

from __future__ import annotations

import sqlite3
import time
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field

from app import db, loops

INGEST_KINDS: frozenset[str] = frozenset(
    {"habit_tap", "capture_raw", "loop_done", "loop_rolled", "loop_dropped"}
)
"""Kinds this endpoint accepts — the app-write rows of the EXECUTION §7
kind registry. Grows one task at a time (capture_raw is T2.3's — the
mobile capture sheet queues through THIS door offline, while fuzzel and
the online FAB use POST /capture; both land the same event kind).
An unregistered kind is a 422: a kind the spine accepts but no consumer
reads is exactly the drift §7 exists to prevent."""

MAX_CLOCK_SKEW_S = 300
"""A ts further than this in the future is a device clock fault, not a
tap. Content dates ARE the data (law 3) — a phone set to 2027 would
poison every derived view for years. Far-past timestamps are accepted:
an honest old clock is still the tap's truth, and replay is deduped."""

APP_SOURCE_NAME = "app"
"""The one source row every client POST attaches to. Named for the
surface, not the kind: routine ticks (T2.7) and capture (T2.3) ride the
same door and the same source."""

_SUCCESS_PREDICATE = (
    "the event row itself is the artifact — receipt under "
    "UNIQUE(source_id, kind, external_ref)"
)


class IngestError(ValueError):
    """The body violates the ingest contract — the route maps this to a 422."""


class ReplayBody(BaseModel):
    """The queue's wire shape (mobile/src/data/queue.ts ReplayBody).

    ts and ingested_at are strict ints: JS numbers are floats, and a
    1e12-scale float survives a JSON round-trip only when integral —
    anything else is a client bug worth a 422, not a silent floor().
    """

    idempotency_key: str = Field(min_length=8, max_length=128)
    kind: str
    ts: int = Field(strict=True)
    ingested_at: int | None = Field(default=None, strict=True)
    payload: dict[str, Any]


class CaptureBody(BaseModel):
    """The direct capture door's body (T2.3): {text | photo_ref, origin}."""

    text: str | None = None
    photo_ref: str | None = None
    origin: str = "pwa"


class RetriageBody(BaseModel):
    """The manual re-triage request (T2.3): WHICH capture, nothing else."""

    capture_ref: str = Field(min_length=8, max_length=256)


def epoch_ms_to_iso(ts_ms: int) -> str:
    """Epoch milliseconds → ISO8601 UTC, exact to the millisecond.

    Integer math, not fromtimestamp(ms/1000): a float like 1.379 is
    1.3789999… in binary, and the exit test asserts ts to the millisecond.
    """
    sec, ms = divmod(ts_ms, 1000)
    return datetime.fromtimestamp(sec, tz=UTC).replace(microsecond=ms * 1000).isoformat()


def _validate(url_kind: str, body: ReplayBody) -> tuple[str, int, str]:
    """Contract checks that pydantic cannot express. Returns (kind, ts_ms, external_ref)."""
    if url_kind != body.kind:
        msg = f"kind mismatch: URL says {url_kind!r}, body says {body.kind!r}"
        raise IngestError(msg)
    if body.kind not in INGEST_KINDS:
        registered = ", ".join(sorted(INGEST_KINDS))
        msg = (
            f"unknown kind {body.kind!r} — the ingest registry (EXECUTION §7) "
            f"currently accepts: {registered}"
        )
        raise IngestError(msg)
    if ":" in body.idempotency_key:
        # external_ref is "{key}:{ts}" — a colon in the key could make two
        # distinct (key, ts) pairs produce the same ref. Device UUIDs never
        # carry one; anything that does is not a device key.
        msg = "idempotency_key must not contain ':'"
        raise IngestError(msg)
    now_ms = int(time.time() * 1000)
    if body.ts <= 0:
        msg = f"ts must be a positive epoch-ms value, got {body.ts}"
        raise IngestError(msg)
    if body.ts > now_ms + MAX_CLOCK_SKEW_S * 1000:
        msg = (
            f"ts {body.ts} is more than {MAX_CLOCK_SKEW_S}s in the future — "
            "a device clock fault, not a tap time"
        )
        raise IngestError(msg)
    if body.kind == "habit_tap":
        method = body.payload.get("method")
        if method not in ("tap", "recall"):
            msg = (
                f"habit_tap payload must carry method 'tap' or 'recall' (02 §3), "
                f"got {method!r}"
            )
            raise IngestError(msg)
    if body.kind in loops.RESOLUTION_KINDS:
        loop_id = body.payload.get("loop_id")
        if not isinstance(loop_id, int):
            msg = "loop resolution payload must carry an integer loop_id"
            raise IngestError(msg)
        reason = body.payload.get("reason")
        if reason is not None and (not str(reason).strip() or len(str(reason)) > 500):
            msg = "drop reason must be 1-500 characters when present"
            raise IngestError(msg)
    if body.kind == "capture_raw":
        # the offline mobile capture sheet queues through this door (T2.1
        # armor); the direct door is POST /capture. Same minimum: one of
        # text | photo_ref, and text non-empty when present.
        text = body.payload.get("text")
        photo_ref = body.payload.get("photo_ref")
        if (text is None) == (photo_ref is None):
            msg = "capture_raw payload must carry exactly one of text | photo_ref"
            raise IngestError(msg)
        if text is not None and (not str(text).strip() or len(str(text)) > 4096):
            msg = "capture_raw text cannot be empty or exceed 4096 characters"
            raise IngestError(msg)
    if body.kind in loops.RESOLUTION_KINDS:
        # T2.2: loop resolutions are {loop_id}:{UTC day of the resolution} —
        # a roll on many days is many events, a double-tap on one day is
        # one. The day derives from the CLIENT ts (the moment the user
        # resolved), never the receipt.
        from datetime import UTC, datetime

        day = (
            datetime.fromtimestamp(body.ts / 1000, tz=UTC).date().isoformat()
        )
        loop_id = body.payload.get("loop_id")
        return body.kind, body.ts, f"{loop_id}:{day}"
    return body.kind, body.ts, f"{body.idempotency_key}:{body.ts}"


def get_or_create_app_source(conn: sqlite3.Connection) -> int:
    """The one behavioral source row client writes attach to (see module doc)."""
    row = conn.execute(
        "SELECT id FROM source WHERE name = ?", (APP_SOURCE_NAME,)
    ).fetchone()
    if row is not None:
        return int(row["id"])
    conn.execute(
        "INSERT OR IGNORE INTO source"
        " (name, globs, class, success_predicate, status, ts)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (
            APP_SOURCE_NAME,
            "[]",
            "behavioral",
            _SUCCESS_PREDICATE,
            "alive",
            db.utc_now_iso(),
        ),
    )
    conn.commit()
    row = conn.execute(
        "SELECT id FROM source WHERE name = ?", (APP_SOURCE_NAME,)
    ).fetchone()
    if row is None:
        msg = "the app source row vanished between INSERT and SELECT"
        raise RuntimeError(msg)
    return int(row["id"])


def ingest_event(
    conn: sqlite3.Connection, url_kind: str, body: ReplayBody
) -> dict[str, object]:
    """Validate, append to the spine, and report — the route's whole job.

    A fresh write returns {"status": "ok", "duplicate": false, "event_id": N};
    a replay of an already-stored (source, kind, external_ref) returns 200
    with duplicate: true and the FIRST copy's id — one replay storm, one
    row (02 §1: the unique constraint is the one idempotency gate).
    """
    kind, ts_ms, external_ref = _validate(url_kind, body)
    source_id = get_or_create_app_source(conn)

    payload: dict[str, Any] = dict(body.payload)
    if body.ingested_at is not None:
        payload["client_ingested_at"] = body.ingested_at
    payload["ingested_at"] = db.utc_now_iso()

    try:
        event_id = db.insert_event(
            conn,
            kind=kind,
            origin="app-write",
            source_id=source_id,
            external_ref=external_ref,
            actor="human",
            payload=payload,
            ts=epoch_ms_to_iso(ts_ms),
        )
    except sqlite3.IntegrityError:
        conn.rollback()
        row = conn.execute(
            "SELECT id FROM event WHERE source_id = ? AND kind = ? AND external_ref = ?",
            (source_id, kind, external_ref),
        ).fetchone()
        if row is None:
            raise
        conn.commit()
        return {"status": "ok", "duplicate": True, "event_id": int(row["id"])}
    conn.commit()
    return {"status": "ok", "duplicate": False, "event_id": event_id}
