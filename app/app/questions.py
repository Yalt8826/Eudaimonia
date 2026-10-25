"""The question lifecycle (T2.5) — open -> picked_up -> answered, with the
reversal edge back to open.

The ``question`` table is frozen v0.1: no columns are added, and
``question.status`` is a **materialized cache** with exactly ONE writer —
this module, driven by ``agent_invoke`` outcomes (02 §6; 08 §20's writer
contract). There is no status editor and no admin endpoint: "ask again"
opens a NEW invocation through the chokepoint; even reversals arrive only
via invocation outcomes.

- **picked_up** = the ask flow accepted the question and dispatched the
  invocation (renders plum with the profile, 04).
- **answered** = the success predicate PASSED — the answer text is
  recorded in a ``question_answered`` agent-write event (actor = the
  profile) with a provenance edge (question -> answer event). An
  invocation whose output lacks the answer can never write ``answered``
  (freshness != success, applied to the question queue).
- **Reversal to open** = any terminal failure outcome (timeout, error,
  predicate miss). A process that dies mid-run cannot emit its own
  terminal event — the chokepoint detects the dead run and emits
  the failure itself; and the ask flow reverts the row if anything fails
  BEFORE the chokepoint takes over. A question stuck at ``picked_up`` is
  a defect by construction.

The ``question_answered`` kind is coined by this task — the EXECUTION §7
registry row is added in the same commit, per §7's own rule.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from app import agent_invoke as ai
from app import db
from app.ingest import get_or_create_app_source

TRIAGE_PROFILE = "clio"
ASK_TIMEOUT_S = 180.0
"""Same headroom logic as capture triage: single attempt, the queue and
model latency live inside the phase's 5-minute expectation."""


class QuestionError(ValueError):
    """The ask violates the question contract — the route maps this to 422."""


def _answer_predicate(stdout: str, exit_code: int | None) -> bool:
    """The answer predicate: the invocation exited clean AND said something.
    A question's answer is prose, not a single word — the marker is a
    non-empty stdout on a zero exit (freshness != success: an empty reply
    can never be an answer)."""
    return exit_code == 0 and bool(stdout.strip())


def open_questions(conn: sqlite3.Connection) -> dict[str, object]:
    """The queue the /questions screen renders: open and picked_up rows
    (the lifecycle's live states), oldest first. Answered questions leave
    the list — they are history, provenance-edged, not pending work."""
    rows = conn.execute(
        "SELECT id, text, status, ts FROM question"
        " WHERE status IN ('open', 'picked_up')"
        " ORDER BY ts ASC"
    ).fetchall()
    return {
        "questions": [
            {"id": r["id"], "text": r["text"], "status": r["status"], "ts": r["ts"]}
            for r in rows
        ],
        "count": len(rows),
    }


def _question_text(conn: sqlite3.Connection, question_id: int) -> str:
    row = conn.execute(
        "SELECT text FROM question WHERE id = ?", (question_id,)
    ).fetchone()
    if row is None:
        raise QuestionError(f"no question row {question_id}")
    return str(row["text"])


def ask(
    conn: sqlite3.Connection, question_id: int, profile: str = TRIAGE_PROFILE
) -> dict[str, Any]:
    """Accept a question for answering: pick it up, then dispatch the
    invocation. Returns the picked-up receipt — the OUTCOME arrives via
    the background ask (the route runs it as a background task), which is
    the single writer that settles answered/open."""
    text = _question_text(conn, question_id)
    status_row = conn.execute(
        "SELECT status FROM question WHERE id = ?", (question_id,)
    ).fetchone()
    if status_row is None:
        raise QuestionError(f"no question row {question_id}")
    conn.execute(
        "UPDATE question SET status = 'picked_up' WHERE id = ?", (question_id,)
    )
    conn.commit()
    receipt: dict[str, Any] = {
        "question_id": question_id,
        "status": "picked_up",
        "profile": profile,
        "text": text,
    }
    return receipt


def run_ask(
    question_id: int,
    text: str,
    profile: str,
    conn: sqlite3.Connection | None = None,
) -> dict[str, object]:
    """The background half: the invocation, then the ONE writer settles the
    row — answered on a passing predicate, open on any terminal failure.
    Opens its own connection when dispatched as a background task; the
    connection closes after the settle, never mid-flow."""
    owns_conn = conn is None
    if conn is None:
        conn = db.connect(db.db_path())
    try:
        result = ai.agent_invoke(
            profile,
            f"Answer this question directly and completely.\n\nQuestion: {text}",
            ASK_TIMEOUT_S,
            _answer_predicate,
            conn,
        )

        if result.outcome == "ok":
            answer = result.stdout.strip()
            answer_ref = f"question:{question_id}:answered"
            db.insert_event(
                conn,
                kind="question_answered",
                origin="agent-write",
                source_id=get_or_create_app_source(conn),
                external_ref=answer_ref,
                actor=profile,
                payload={
                    "question_id": question_id,
                    "answer": answer,
                    "invocation_ref": result.external_ref,
                },
            )
            conn.execute(
                "INSERT INTO provenance_edge (from_ref, to_ref, type, ts)"
                " VALUES (?, ?, ?, ?)",
                (f"question:{question_id}", answer_ref, "answered", db.utc_now_iso()),
            )
            conn.execute(
                "UPDATE question SET status = 'answered' WHERE id = ?",
                (question_id,),
            )
            conn.commit()
            return {
                "question_id": question_id,
                "status": "answered",
                "answer": answer,
            }

        # terminal failure: the reversal edge — back to open, visibly. The
        # chokepoint already emitted its own terminal outcome event; the row
        # follows it.
        conn.execute(
            "UPDATE question SET status = 'open' WHERE id = ?", (question_id,)
        )
        conn.commit()
        return {
            "question_id": question_id,
            "status": "open",
            "reason": result.outcome,
        }
    finally:
        if owns_conn:
            conn.close()
