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
from typing import Final, Literal

RenderState = Literal["alive", "dead", "paused", "behavioral-dormant", "uninstrumented"]

RENDER_STATES: Final[frozenset[str]] = frozenset(
    {"alive", "dead", "paused", "behavioral-dormant", "uninstrumented"}
)


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
