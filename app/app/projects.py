"""Projects (T3.6, 07 §17) — the board, derived health, human-only parked.

The `project` table (migration 001) is the registry; status transitions
are `project_status` events FIRST, the row follows (the app's usual
event-before-row shape). Law 5 extended by 07 §17: **parked is
human-only** — the ingest door's client posts carry actor=human by
construction, and the fold refuses a parked transition from any other
actor, so the app can never park or un-park anything.

Progress is derived, never entered (07 §17): no percentage field exists
in this module or the schema — a project shows last spine activity and
open-vs-resolved linked work, derived by PAYLOAD QUERY (07 §19
amendment (a): `project_id` rides event payloads, never a frozen
column). A project with no board renders no health line: absence is
data (law 7), and the kanban chain is descoped until a board root
exists on olympus (verified 2026-10-25). When one does, its health
demotes through coverage's tenancy engine — never a local branch.

Parked renders its parked-since date in the muted tier — never red,
never amber (07 §17: lapsed plans are information, not warnings).
"""

from __future__ import annotations

import json
import re
import sqlite3
from typing import Any

from app import db

PROJECT_STATUSES: tuple[str, ...] = ("active", "parked", "done")
"""The board's three columns (04 /projects)."""

MAX_NAME = 120

# the event kinds whose payloads may carry project_id (07 §19 (a)) —
# linked work derives by querying THESE, never by joining columns
LINKED_KINDS: tuple[str, ...] = ("task_seen", "loop_done", "loop_rolled", "loop_dropped", "task_session_ended")


EVENT_KINDS: frozenset[str] = frozenset({"project_status"})
"""The client-postable project kind (EXECUTION §7 registry row) — the
door's client posts carry actor=human by construction, which is what
makes the parked gate hold for every app write."""


class ProjectError(ValueError):
    """The payload violates the project contract — routes map this to a 422."""


def validate_status(payload: dict[str, Any]) -> tuple[int, str]:
    """Shape checks for a project_status payload: the row must exist and
    the status must be a legal column. The ACTOR gate (parked is
    human-only) is enforced at the fold, which sees the landed event."""
    project_id = payload.get("project_id")
    status = payload.get("status")
    if isinstance(project_id, bool) or not isinstance(project_id, int) or project_id <= 0:
        msg = "project_id must be a positive integer row id"
        raise ProjectError(msg)
    if status not in PROJECT_STATUSES:
        msg = f"status must be one of {PROJECT_STATUSES}, got {status!r}"
        raise ProjectError(msg)
    return project_id, status


def apply_status_event(kind: str, payload: dict[str, Any], actor: str) -> None:
    """The ingest route's background task: opens its own connection (the
    request's is closed by the time the fold runs)."""
    conn = db.connect(db.db_path())
    try:
        apply_status(conn, kind, payload, actor)
    finally:
        conn.close()


def apply_status(conn: sqlite3.Connection, kind: str, payload: dict[str, Any], actor: str) -> None:
    """The ingest door's background fold: the project_status event has
    landed; the row follows — but ONLY when the actor may make the
    transition. Parked is human-only in BOTH directions (law 5, 07 §17):
    an agent's park or un-park is refused here, leaving the event as a
    recorded-but-not-applied attempt (the row stays the owner's)."""
    project_id, status = validate_status(payload)
    row = conn.execute("SELECT status FROM project WHERE id = ?", (project_id,)).fetchone()
    if row is None:
        return  # unknown project: the event stays, the fold skips
    current = str(row["status"])
    human = actor == "human"
    enters_parked = status == "parked" and current != "parked"
    leaves_parked = current == "parked" and status != "parked"
    if (enters_parked or leaves_parked) and not human:
        return  # recorded, not applied — the row remains the owner's
    conn.execute("UPDATE project SET status = ? WHERE id = ?", (status, project_id))
    conn.commit()


def seed_projects(conn: sqlite3.Connection) -> dict[str, object]:
    """The ratified set (07 §17): the owner's three projects, declared
    human-side in the life-layer doc. Idempotent by name; each seed mints
    its project_status event (actor human) beside the row — the row never
    appears without its event."""
    ratified = [
        {"name": "Market Momentum", "board_glob": None, "notes_path": None},
        {"name": "Kerdos", "board_glob": None, "notes_path": None},
        {"name": "Eudaimonia", "board_glob": None, "notes_path": None},
    ]
    created = 0
    for spec in ratified:
        exists = conn.execute("SELECT id FROM project WHERE name = ?", (spec["name"],)).fetchone()
        if exists is not None:
            continue
        now = db.utc_now_iso()
        cur = conn.execute(
            "INSERT INTO project (name, status, board_glob, notes_path, ts)"
            " VALUES (?, 'active', NULL, NULL, ?)",
            (spec["name"], now),
        )
        db.insert_event(
            conn,
            kind="project_status",
            origin="app-write",
            source_id=None,
            external_ref=f"project:{cur.lastrowid}:active:seed",
            actor="human",
            payload={"project_id": int(cur.lastrowid), "status": "active", "name": spec["name"]},
            ts=now,
        )
        created += 1
    conn.commit()
    return {"seeded": created}


def _linked_work(conn: sqlite3.Connection, project_id: int) -> dict[str, int]:
    """Open vs resolved linked work, derived by PAYLOAD QUERY (07 §19 (a))
    — no frozen columns, no stored counters. Zeroes are honest: nothing
    in the app links work to projects yet, and the query returns that
    absence plainly."""
    kinds = ",".join("?" * len(LINKED_KINDS))
    rows = conn.execute(
        f"SELECT kind, payload FROM event WHERE kind IN ({kinds})", LINKED_KINDS
    ).fetchall()
    open_count = 0
    resolved = 0
    for row in rows:
        payload = json.loads(row["payload"])
        if payload.get("project_id") != project_id:
            continue
        if row["kind"] in ("task_seen",):
            open_count += 1
        elif row["kind"] in ("loop_done", "task_session_ended"):
            resolved += 1
        else:  # loop_rolled / loop_dropped stay open work
            open_count += 1
    return {"open": open_count, "resolved": resolved}


def _last_activity(conn: sqlite3.Connection, project_id: int) -> str | None:
    kinds = ",".join("?" * len(LINKED_KINDS))
    row = conn.execute(
        f"SELECT MAX(ts) AS last FROM event WHERE kind IN ({kinds})"
        " AND json_extract(payload, '$.project_id') = ?",
        (*LINKED_KINDS, project_id),
    ).fetchone()
    value = row["last"] if row is not None else None
    return str(value) if value is not None else None


def board_health(conn: sqlite3.Connection, board_glob: str | None) -> dict[str, object] | None:
    """Live board health from the kanban chain — through T3.4's engine,
    never a local branch. The kanban chain is DESCOPED (no board data
    root on olympus, verified 2026-10-25): an unlinked project returns
    None and the client renders NO health line — absence is data (law 7),
    a fabricated health line is the defect the spec names."""
    if not board_glob:
        return None
    from app import coverage as tenancy  # the structural gate: one engine

    row = conn.execute(
        "SELECT source_id, source_name, class, status, last_ok_read_ts,"
        " days_fresh_7, artifact_count, paused_evidence FROM coverage"
        " WHERE source_name = ?",
        (f"kanban:{board_glob}",),
    ).fetchone()
    if row is None:
        return None
    return tenancy.evaluate(conn, row)


def list_projects(conn: sqlite3.Connection) -> dict[str, object]:
    rows = conn.execute(
        "SELECT id, name, status, board_glob, notes_path, ts FROM project ORDER BY ts ASC"
    ).fetchall()
    items = []
    for r in rows:
        pid = int(r["id"])
        parked_since = conn.execute(
            "SELECT ts, actor FROM event WHERE kind = 'project_status'"
            " AND json_extract(payload, '$.project_id') = ?"
            " AND json_extract(payload, '$.status') = 'parked'"
            " ORDER BY id DESC LIMIT 1",
            (pid,),
        ).fetchone()
        items.append(
            {
                "project_id": pid,
                "name": str(r["name"]),
                "status": str(r["status"]),
                "board_glob": r["board_glob"],
                "parked_since": str(parked_since["ts"])[:10] if parked_since is not None else None,
                "last_activity": _last_activity(conn, pid),
                "linked_work": _linked_work(conn, pid),
                # board health: None until a board root exists (descoped) —
                # the client renders NO health line when absent (law 7)
                "board_health": board_health(conn, r["board_glob"]),
            }
        )
    return {"projects": items}


def project_detail(conn: sqlite3.Connection, project_id: int) -> dict[str, object] | None:
    row = conn.execute(
        "SELECT id, name, status, board_glob, notes_path, ts FROM project WHERE id = ?",
        (project_id,),
    ).fetchone()
    if row is None:
        return None
    listing = list_projects(conn)
    item = next(i for i in listing["projects"] if i["project_id"] == project_id)
    return {**item, "notes_path": row["notes_path"]}
