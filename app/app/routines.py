"""Routines (T2.7) — the Week Plan's time blocks as tickable planned structure.

07 §18/§19: routines are the daily backbone, distinct from habits (habits
are *changed behaviors*, routines are *planned structure* — they never
merge). A tick says the planned slot happened, nothing more. There is NO
routine table in v0.2: the tick is an app-write event and the spine's
UNIQUE(source_id, kind, external_ref) is the whole storage model, with

    external_ref = "{routine_key}:{date}"

so a double-tap on the same day is ONE row (the replay returns
duplicate:true), and the same block ticked on another day is a different
event, not a correction. ``routine_key`` is a stable slug of the Week Plan
line derived by T1.3's plan-line extraction (adapters.parse_week_plan's
``plan_keys``) — never typed at the tick site and never re-derived from a
line's text here, so a renamed plan line cannot orphan its history.

Tick integrity (07 §18, from the wellness seat):

- ``routine_done`` carries ``method: 'tap' | 'recall'``. Recall renders ~
  in every window ("GRE: ~5 of 7") forever (law 11), and a drift claim
  needs tap-majority before rendering bare — enforced at the source here
  so P4's plan-vs-actual section inherits it.
- ``routine_skip`` is a decision, not an estimate: it carries no method
  (a method on a skip would let a decision masquerade as recall evidence
  in P4's windows). It renders covered-but-not-done in the muted tier —
  information, never failure (01 §1; 02 §6 muted-never-red).
- Ticks are optional evidence, never duty. No streak logic exists: the
  denominator is the planned set of the day, never consecutive days —
  this module never computes one.
"""

from __future__ import annotations

import json
import re
import sqlite3
from datetime import date as _date
from typing import Any

ROUTINE_KINDS: frozenset[str] = frozenset({"routine_done", "routine_skip"})
"""The tick kinds (EXECUTION §7 registry rows) — app-write, like habit_tap."""

KEY_MAX = 80
"""Same ceiling tasks.py uses for subjects; a slug longer than this is a
derivation bug, not a plan line."""

KEY_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
"""A slug, and nothing else: lowercase alnum runs joined by single dashes.
No ':' — external_ref is "{routine_key}:{date}" and a colon in the key
would make two distinct (key, date) pairs collide inside the UNIQUE."""

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
METHODS = ("tap", "recall")


class RoutineError(ValueError):
    """The payload violates the routine contract — routes map this to a 422."""


def validate(kind: str, payload: dict[str, Any]) -> None:
    """Contract checks for one routine tick payload (raises RoutineError)."""
    if kind not in ROUTINE_KINDS:
        msg = f"not a routine kind: {kind!r}"
        raise RoutineError(msg)
    key = payload.get("routine_key")
    if not isinstance(key, str) or not 1 <= len(key) <= KEY_MAX or KEY_RE.match(key) is None:
        msg = (
            "routine_key must be a 1-80 char lowercase slug "
            "(lowercase alnum runs joined by single dashes, no ':')"
        )
        raise RoutineError(msg)
    raw_date = payload.get("date")
    if not isinstance(raw_date, str) or DATE_RE.match(raw_date) is None:
        msg = "date must be an ISO YYYY-MM-DD string — the plan day of the tick"
        raise RoutineError(msg)
    try:
        _date.fromisoformat(raw_date)
    except ValueError as exc:
        msg = f"date {raw_date!r} is not a real calendar day"
        raise RoutineError(msg) from exc
    if kind == "routine_done":
        method = payload.get("method")
        if method not in METHODS:
            msg = (
                "routine_done payload must carry method 'tap' or 'recall' "
                f"(07 §18 tick integrity), got {method!r}"
            )
            raise RoutineError(msg)
    else:
        method = payload.get("method")
        if method is not None:
            msg = (
                "routine_skip carries no method — a skip is a decision, not "
                "an estimate (07 §18)"
            )
            raise RoutineError(msg)


def day(conn: sqlite3.Connection, raw_date: str) -> dict[str, object]:
    """One plan day's ticks, read straight off the spine.

    The external_ref suffix IS the day (ISO dates are fixed-width, so
    substr(-10) cannot bite into the key). One row per (key, day) exists
    by construction, so the list is the state — latest-wins logic would
    imply corrections, and corrections are T4's compensating events.
    """
    if DATE_RE.match(raw_date) is None:
        msg = "date must be an ISO YYYY-MM-DD string"
        raise RoutineError(msg)
    rows = conn.execute(
        "SELECT kind, external_ref, ts, payload FROM event"
        " WHERE kind IN (?, ?) AND substr(external_ref, -10) = ?"
        " ORDER BY id",
        (*sorted(ROUTINE_KINDS), raw_date),
    ).fetchall()
    ticks: list[dict[str, object]] = []
    for row in rows:
        raw = row["payload"]
        payload = json.loads(raw) if isinstance(raw, str) else raw
        ticks.append(
            {
                "routine_key": str(row["external_ref"])[: -len(raw_date) - 1],
                "kind": str(row["kind"]),
                "method": payload.get("method") if isinstance(payload, dict) else None,
                "ts": str(row["ts"]),
            }
        )
    return {"date": raw_date, "ticks": ticks}
