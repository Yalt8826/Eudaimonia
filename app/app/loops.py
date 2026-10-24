"""The waiting-on read model + resolution landings (T2.2).

ONE definition of the waiting-on numbers and ONE landing path for loop
resolutions — the Plaza badge, the /inbox screen and M6's widget all read
through this module (the wake model's one-definition rule, applied).

The spine is the truth; the ``loop`` row is a denormalized cache
(EXECUTION §1):

- **Resolutions are events first.** ``loop_done`` / ``loop_dropped`` /
  ``loop_rolled`` app-write events, ``external_ref = "{loop_id}:{date}"``
  (UTC day): a loop rolled on many days is many events, and a double-tap
  on one day is ONE event — the spine's UNIQUE constraint is the
  idempotency gate, exactly as T2.1 pinned for taps.
- **The row updates when the event lands.** Online or drained-offline,
  every resolution landing applies the cache update here — there is no
  second write path and no status editor anywhere (PHASE-P2 T2.2: "a
  hand-edited loop status exists nowhere").
- **Rolls advance the row's ts** — the owed date moves to the roll, and
  the inbox's age sort re-ranks. Done/dropped leave the open list; their
  ts keeps the resolution time.
- **Drop carries a reason** the first time per source (04 inbox spec);
  the reason rides the event payload, optional on the wire.
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from typing import Any

from app import db

RESOLUTION_KINDS: frozenset[str] = frozenset(
    {"loop_done", "loop_rolled", "loop_dropped"}
)
"""The app-write resolution kinds (EXECUTION §7 registry, T2.2 rows)."""


class LoopError(ValueError):
    """The resolution violates the loop contract — the route maps this to 422."""


def open_loops(conn: sqlite3.Connection) -> dict[str, object]:
    """Open loops, oldest first, with the counts the Plaza badge needs."""
    rows = conn.execute(
        "SELECT id, text, direction, ts FROM loop"
        " WHERE status = 'open'"
        " ORDER BY ts ASC"
    ).fetchall()
    now = datetime.now(UTC)
    loops: list[dict[str, object]] = []
    for r in rows:
        age_days = max(
            0, (now - datetime.fromisoformat(r["ts"])).total_seconds() // 86400
        )
        loops.append(
            {
                "id": r["id"],
                "text": r["text"],
                "direction": r["direction"],
                "ts": r["ts"],
                "age_days": int(age_days),
            }
        )
    return {
        "loops": loops,
        "count": len(loops),
        "owed_by_me": sum(1 for lp in loops if lp["direction"] == "owed-by-me"),
        "owed_to_me": sum(1 for lp in loops if lp["direction"] == "owed-to-me"),
    }


def resolve(
    conn: sqlite3.Connection,
    *,
    kind: str,
    loop_id: int,
    reason: str | None = None,
    day: str | None = None,
) -> dict[str, object]:
    """Land ONE resolution: event first, then the cache row.

    ``day`` defaults to today (UTC) — the external_ref's date half. A
    duplicate (same loop, same day, same resolution) raises
    sqlite3.IntegrityError from insert_event; callers treat that as
    already-done (idempotent double-tap), never as an error.
    """
    if kind not in RESOLUTION_KINDS:
        raise LoopError(f"unknown resolution kind {kind!r}")
    resolution = kind.removeprefix("loop_")  # done | rolled | dropped
    row = conn.execute(
        "SELECT id, status FROM loop WHERE id = ?", (loop_id,)
    ).fetchone()
    if row is None:
        raise LoopError(f"no loop row {loop_id}")

    day = day or datetime.now(UTC).date().isoformat()
    now = db.utc_now_iso()
    payload: dict[str, Any] = {"loop_id": loop_id}
    if reason is not None:
        if not str(reason).strip():
            raise LoopError("drop reason cannot be empty when present")
        payload["reason"] = str(reason).strip()

    # lazy import: ingest imports this module for the kind registry, so a
    # module-level import here would cycle
    from app.ingest import get_or_create_app_source

    try:
        db.insert_event(
            conn,
            kind=kind,
            origin="app-write",
            # the app source, NOT NULL: SQLite treats NULLs as distinct
            # inside a UNIQUE constraint — a NULL source_id would silently
            # break the double-tap idempotency (the T2.1 trap, again)
            source_id=get_or_create_app_source(conn),
            external_ref=f"{loop_id}:{day}",
            actor="human",
            payload=payload,
            ts=now,
        )
    except sqlite3.IntegrityError:
        conn.rollback()
        # same loop + same day + same resolution: the double-tap. The row
        # is already in the settled state — idempotent, not an error.
        return {"loop_id": loop_id, "resolution": resolution, "duplicate": True}

    # the cache row follows its event
    ts_update = ", ts = ?" if resolution == "rolled" else ""
    conn.execute(
        f"UPDATE loop SET status = ?{ts_update} WHERE id = ?",
        (resolution, now, loop_id) if resolution == "rolled" else (resolution, loop_id),
    )
    conn.commit()
    return {"loop_id": loop_id, "resolution": resolution, "duplicate": False}


def apply_resolution_event(
    kind: str, payload: dict[str, Any], conn: sqlite3.Connection | None = None
) -> None:
    """The generic door's landing: update the cache row for a resolution
    event that just drained OFFLINE (online resolutions land through
    resolve()). Duplicate replays are the spine's job — the row update is
    idempotent by status value. Opens its own connection when called as a
    background task."""
    if conn is None:
        conn = db.connect(db.db_path())
    loop_id = payload.get("loop_id")
    if not isinstance(loop_id, int):
        raise LoopError("loop resolution payload must carry an integer loop_id")
    resolution = kind.removeprefix("loop_")
    ts_update = ", ts = ?" if resolution == "rolled" else ""
    conn.execute(
        f"UPDATE loop SET status = ?{ts_update} WHERE id = ?",
        (resolution, db.utc_now_iso(), loop_id)
        if resolution == "rolled"
        else (resolution, loop_id),
    )
    conn.commit()
