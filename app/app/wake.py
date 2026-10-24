"""The wake read model — the ONE definition of the WAKE row's numbers.

The coverage view (law 7) deliberately counts only ``source-read`` events:
adapter strips measure freshness of ingested artifacts. The wake habit is
different — its truth is the owner's own ``habit_tap`` events (app-write),
so this module aggregates the spine directly. Every consumer of the wake
numbers (the Plaza's WAKE row now, M6's widget later) reads through THIS
module and adds nothing — the same one-definition rule law 7 pins for
``coverage``.

Honesty contract (02 §2, 02 §6):

- **Days, not taps.** ``days_of_7`` counts DISTINCT UTC days in the
  trailing 7 (today inclusive, mirroring the coverage view's
  ``date('now', '-6 days')`` window) that carry at least one REAL tap
  (``method = 'tap'``). Five taps on one morning are one day. A ``recall``
  never counts toward the measure — law 11: estimated never renders as
  measured.
- **Trailing 7 by content date.** The window rides each event's own ``ts``
  (the tap time captured on the client clock at the tap), never
  ``ingested_at`` — a tap queued offline for a day still counts for the
  morning it happened.
- **Empty is honest.** No events: ``days_of_7 = 0``, ``last_tap = null``.
  A zero is data here, same as in ``coverage`` — the CLIENT decides
  whether zero means uninstrumented (never tapped) or a real dry spell,
  via ``total_taps``.
- **age_minutes** is computed at request time from the last tap — the
  number every widget surface must show (02 §4).
"""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime


def wake_stats(conn: sqlite3.Connection) -> dict[str, object]:
    """Aggregate the wake habit's numbers from the spine. Read-only."""
    days_of_7 = conn.execute(
        "SELECT COUNT(DISTINCT substr(ts, 1, 10)) FROM event"
        " WHERE kind = 'habit_tap'"
        " AND json_extract(payload, '$.method') = 'tap'"
        " AND substr(ts, 1, 10) BETWEEN date('now', '-6 days') AND date('now')"
    ).fetchone()[0]

    total_taps = conn.execute(
        "SELECT COUNT(*) FROM event WHERE kind = 'habit_tap'"
    ).fetchone()[0]

    last = conn.execute(
        "SELECT ts, json_extract(payload, '$.method') AS method FROM event"
        " WHERE kind = 'habit_tap' ORDER BY id DESC LIMIT 1"
    ).fetchone()

    last_tap: dict[str, object] | None = None
    if last is not None:
        age_minutes = int(
            (datetime.now(UTC) - datetime.fromisoformat(last["ts"])).total_seconds() // 60
        )
        last_tap = {
            "ts": last["ts"],
            "method": last["method"],
            "age_minutes": max(0, age_minutes),
        }

    return {
        "days_of_7": int(days_of_7),
        "total_taps": int(total_taps),
        "last_tap": last_tap,
    }
