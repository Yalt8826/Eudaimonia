"""Per-habit rolling-window stats (T3.3) — the review-side numbers.

Separate from ``wake.py`` on purpose: the plaza's WAKE row renders the
MEASURED figure (tap days only, recalls excluded — law 11: estimated
never renders as measured), while the review-side stats count recall
taps too and MARK the window instead (09 §2#4):

- ``met``  = distinct days in the trailing ``window`` with a qualifying
  tap. The denominator is ALWAYS the trailing window — a number that
  behaves like a run-of-days (surviving a missed day, growing since the
  first tap) is a defect, not a feature. Nothing cumulative exists here.
- ``recall_share`` / ``recall_majority`` come from the taps' ``method``
  payloads: recalls count toward ``met`` and mark the window; a
  recall-majority window renders with ``~`` (estimates law, 09 gate 2),
  a tap-majority one renders bare.
- Window matching is config-driven (``HABIT_WINDOWS``): v0 ships
  taps-only for wake (any tap that day qualifies) — adding a target time
  is a config flip, not a new code path. When a target minute IS set, a
  tap qualifies only within ``tolerance`` minutes of it (±30 for wake).
- The banned-vocabulary gate (09 gate 4) starts here: this module and
  its payloads carry no run-of-days vocabulary anywhere — there is no
  such concept in the code to accidentally render.
"""

from __future__ import annotations

import sqlite3
from datetime import timedelta
from typing import Any

HABIT_WINDOWS: dict[str, dict[str, int | None]] = {
    "wake": {"target_minute": None, "tolerance_min": 30},
}
"""Per-habit window config. ``target_minute: None`` = the v0 taps-only
descope: any tap inside the day qualifies. A target minute (minutes of
the tap's local day) flips the ±tolerance matching on without new code."""

DEFAULT_HABIT = "wake"
DEFAULT_WINDOW = 7


def within_window(minute_of_day: int, target_minute: int | None, tolerance_min: int) -> bool:
    """A tap's local minute-of-day against the habit's target ± tolerance.
    29 minutes off counts, 31 does not (the boundary is inclusive)."""
    if target_minute is None:
        return True
    return abs(minute_of_day - target_minute) <= tolerance_min


def habit_stats(
    conn: sqlite3.Connection,
    habit: str = DEFAULT_HABIT,
    window: int = DEFAULT_WINDOW,
    tz_offset_min: int = 0,
) -> dict[str, Any]:
    """Rolling-window stats for one habit, computed from the spine's
    habit_tap events (never stored counters — the window slides, the
    denominator never shrinks). ``tz_offset_min`` is the viewer's offset
    so "trailing 7 days" and any target-minute match land on THEIR local
    days; the spine stores UTC."""
    config = HABIT_WINDOWS.get(habit)
    if config is None:
        from app.db import utc_now_iso  # noqa: F401 — keep import shape stable

        msg = f"unknown habit {habit!r}"
        raise ValueError(msg)
    target = config.get("target_minute")
    tolerance = int(config.get("tolerance_min") or 0)

    rows = conn.execute(
        "SELECT ts, json_extract(payload, '$.method') AS method FROM event"
        " WHERE kind = 'habit_tap'"
        " AND substr(ts, 1, 10) >= date('now', ?)"
        " ORDER BY ts ASC",
        (f"-{window - 1} days",),
    ).fetchall()

    days: dict[str, dict[str, Any]] = {}
    tap_count = 0
    recall_count = 0
    for row in rows:
        ts = row["ts"]
        # the viewer's local day + minute-of-day (the spine stores UTC)
        from datetime import UTC, datetime

        moment = datetime.fromisoformat(ts)
        local = moment + timedelta(minutes=tz_offset_min)
        key = local.date().isoformat()
        method = row["method"] or "tap"
        minute_of_day = local.hour * 60 + local.minute
        if not within_window(minute_of_day, target, tolerance):
            continue
        slot = days.setdefault(key, {"taps": 0, "recalls": 0})
        slot["taps"] += 1
        if method == "recall":
            slot["recalls"] += 1
            recall_count += 1
        else:
            tap_count += 1

    met = len(days)
    total = tap_count + recall_count
    recall_share = (recall_count / total) if total > 0 else 0.0
    return {
        "habit": habit,
        "window": window,
        "met": met,
        "of": window,
        "recall_share": round(recall_share, 4),
        "recall_majority": total > 0 and recall_count * 2 >= total,
        "recall_taps": recall_count,
        "tap_taps": tap_count,
        "days": sorted(days),
    }
