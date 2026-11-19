"""The five render states, derived from coverage-view facts (T0.2).

The coverage view (migration 001, section 3) exposes the facts; the render
state is a fixed mapping over them. Every consumer — T1.6 Plaza, T3.4
dormancy engine, T4.1 review coverage block, T6.3 /widgets.json — calls this
function and adds nothing to the set (law 7; 09 §2 row 1; the fifth state is
the W37 dry-run amendment, implemented from P0 so no consumer invents a
sixth).
"""

from __future__ import annotations

import sqlite3
from datetime import date, datetime
from typing import Any, Final, Literal

RenderState = Literal[
    "alive",
    "dead",
    "paused",
    "behavioral-dormant",
    "uninstrumented",
    "demoted",
]

RENDER_STATES: Final[frozenset[str]] = frozenset(
    {"alive", "dead", "paused", "behavioral-dormant", "uninstrumented", "demoted"}
)

BEHAVIORAL_SILENCE_DAYS: Final[int] = 14
"""A behavioral source demotes after 14 days without a logged day —
the threshold is the demotion, the re-earn is data (below)."""

BEHAVIORAL_RE_EARN_FRESH_7: Final[int] = 3
"""Re-earn: three fresh content days in the trailing 7 flip a demoted
behavioral strip back to alive — automatic, no human actor needed."""

PIPELINE_SILENCE_DAYS: Final[int] = 1
"""A pipeline source demotes when its (cron-driven) read has been silent
for a day; ONE passing predicate re-earns it on the same read — instant."""


def derive_render_state(row: sqlite3.Row) -> RenderState:
    """Map one row of the shared coverage view to its render state.

    Precedence is fixed (T0.2):

    1. dead               — source.status = dead is SYSTEM FAILURE ONLY (a
                            human must fix); it is never derived from
                            silence, so behavioral-dormant can never resolve
                            to the dead tier.
    2. paused             — paused evidence present: a job_paused event with
                            actor = human (law 5 — only a human pauses; the
                            app never pauses or un-pauses anything).
    3. uninstrumented     — zero artifacts ever: awaiting first data,
                            neutral, never alarms. Beats behavioral-dormant
                            for a registered source with no artifacts.
    4. behavioral-dormant — behavioral-class silence: zero fresh days in the
                            trailing 7 (law 4). Muted tier, never a state hue.
    5. alive              — otherwise.
    """
    if str(row["status"]) == "dead":
        return "dead"
    if bool(row["paused_evidence"]):
        return "paused"
    if int(row["artifact_count"]) == 0:
        return "uninstrumented"
    if str(row["class"]) == "behavioral" and int(row["days_fresh_7"]) == 0:
        return "behavioral-dormant"
    return "alive"

# ---- the tenancy engine (T3.4) -------------------------------------------
#
# The ONE module that decides how alive a source is (law 7's other half):
# the shared coverage view supplies the facts, this evaluator adds the
# class-keyed tenancy — thresholds, re-earn rules, hints, and the render
# tier. Strips and the review render its output and add nothing: a strip
# that computes its own liveness is the drift this module exists to
# prevent (the structural gate, PHASE-P3 T3.4).

DEMOTION_HINTS: Final[dict[str, str]] = {
    "behavioral": "log a day to re-earn",
    "pipeline": "repair the chain — one pass re-earns",
}


def _days_since(date_iso: str | None, today: date) -> int | None:
    if not date_iso:
        return None
    try:
        return max(0, (today - datetime.fromisoformat(str(date_iso)[:10]).date()).days)
    except ValueError:
        return None


def _last_content_date(conn: sqlite3.Connection, source_id: int) -> str | None:
    """The newest content-dated OK read — the behavioral class's silence
    is CONTENT silence (when the owner last logged), not read silence."""
    row = conn.execute(
        "SELECT MAX(json_extract(payload, '$.content_date')) AS d FROM event"
        " WHERE source_id = ? AND origin = 'source-read'"
        " AND json_extract(payload, '$.ok') = 1",
        (source_id,),
    ).fetchone()
    value = row["d"] if row is not None else None
    return str(value) if value is not None else None


def evaluate(
    conn: sqlite3.Connection,
    row: sqlite3.Row,
    today: date | None = None,
) -> dict[str, Any]:
    """The tenancy evaluation for ONE coverage row: state, render tier,
    hint, and the numbers behind them.

    States and tiers:
    - dead              → tier red (SYSTEM FAILURE ONLY — a human must fix;
                          never derived from silence, so a skipped meal or a
                          lapsed digest can never land here, 02 §6)
    - paused            → tier amber (human-declared evidence, law 5);
                          tenancy never fires on a paused source (law 4)
    - uninstrumented    → tier muted, hint 'not yet instrumented' (zero
                          artifacts ever — the fifth state, W37 finding 2)
    - behavioral-dormant→ tier muted + remediation hint after 14 silent
                          days; re-earn is ≥3 fresh days in trailing 7,
                          automatic (law 4: demote without shaming)
    - pipeline silent   → tier muted + repair hint after a silent day; ONE
                          passing predicate re-earns it on the same read
    - alive             → tier normal
    """
    today = today or date.today()
    name = str(row["source_name"])
    klass = str(row["class"])
    fresh_7 = int(row["days_fresh_7"])
    artifact_count = int(row["artifact_count"])
    paused = bool(row["paused_evidence"])

    base: dict[str, Any] = {
        "source": name,
        "class": klass,
        "days_fresh_7": fresh_7,
        "artifact_count": artifact_count,
    }

    if str(row["status"]) == "dead":
        return {**base, "state": "dead", "tier": "red", "hint": "system failure — human must fix"}

    if paused:
        return {**base, "state": "paused", "tier": "amber", "hint": "paused by the owner — the archive stays visible"}

    if artifact_count == 0:
        return {**base, "state": "uninstrumented", "tier": "muted", "hint": "not yet instrumented"}

    if klass == "behavioral":
        source_id = int(row["source_id"])
        last_content = _last_content_date(conn, source_id)
        silent_days = _days_since(last_content, today)
        days_silent = silent_days if silent_days is not None else BEHAVIORAL_SILENCE_DAYS
        base["last_content_date"] = last_content
        base["days_silent"] = days_silent
        if fresh_7 < BEHAVIORAL_RE_EARN_FRESH_7 and days_silent >= BEHAVIORAL_SILENCE_DAYS:
            return {
                **base,
                "state": "behavioral-dormant",
                "tier": "muted",
                "hint": DEMOTION_HINTS["behavioral"],
            }
        return {**base, "state": "alive", "tier": "normal", "hint": None}

    # pipeline: read silence is the demotion; one pass re-earns instantly
    last_ok = row["last_ok_read_ts"]
    silent_days = _days_since(last_ok, today)
    base["days_silent"] = silent_days
    if silent_days is not None and silent_days >= PIPELINE_SILENCE_DAYS:
        # demoted, NEVER dead: dead is source.status, a human's verdict on
        # system failure — a silent cron is muted information with a
        # repair hint, and one passing predicate re-earns it instantly
        return {**base, "state": "demoted", "tier": "muted", "hint": DEMOTION_HINTS["pipeline"]}
    return {**base, "state": "alive", "tier": "normal", "hint": None}


def tenancy_all(conn: sqlite3.Connection, today: date | None = None) -> list[dict[str, Any]]:
    """Every registered source's evaluation — the strips' whole diet."""
    rows = conn.execute(
        "SELECT source_id, source_name, class, status, last_ok_read_ts,"
        " days_fresh_7, artifact_count, paused_evidence FROM coverage"
        " ORDER BY source_name"
    ).fetchall()
    return [evaluate(conn, row, today) for row in rows]
