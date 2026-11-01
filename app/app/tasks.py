"""Per-task notes, subtasks and timed sessions — the plan card's task pages.

A *task* is a subject on the week plan ("GRE", "Deep Learning", "Gym"):
every time block about it shares one thread, across days and across
weeks, so the note left after Tuesday's session is waiting on Wednesday.
Subjects match case-insensitively; the first spelling seen is displayed.

Everything is an event on the spine (02 §2: one write path), folded on
read — there is no task table, and no frozen table changed:

    task_item_added      {subject, item_id, type: subtask|next, text}
    task_item_checked    {item_id, done: bool}
    task_item_removed    {item_id}
    task_session_started {subject, session_id}
    task_session_ended   {session_id, note?}
    task_log_added       {subject, log_id, text, minutes?}

Two doors write them. The phone queues through ``/api/events/{kind}``
(app-write, actor human, offline-safe via the outbox). Hermes — any
profile, from a shell on olympus — uses the plain JSON routes in main.py
(agent-write, actor = the profile), so a conversation that says "add
'redo quant set 2' to GRE" lands on the same thread the phone reads.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from app import db

TASK_KINDS: frozenset[str] = frozenset(
    {
        "task_item_added",
        "task_item_checked",
        "task_item_removed",
        "task_session_started",
        "task_session_ended",
        "task_log_added",
    }
)
"""The task kinds (EXECUTION §7 registry rows) — app-write AND agent-write."""

ITEM_TYPES = ("subtask", "next")
MAX_TEXT = 2000
MAX_SUBJECT = 120
MAX_SESSION_MIN = 16 * 60
"""A session longer than this was a timer left running, not work: it is
reported capped, and flagged, never silently counted as 20 hours."""


class TaskError(ValueError):
    """The payload violates the task contract — routes map this to a 422."""


def subject_key(subject: str) -> str:
    return " ".join(subject.split()).casefold()


def _text(payload: dict[str, Any], field: str, limit: int = MAX_TEXT) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip():
        msg = f"{field} must be a non-empty string"
        raise TaskError(msg)
    if len(value) > limit:
        msg = f"{field} exceeds {limit} characters"
        raise TaskError(msg)
    return value.strip()


def _id(payload: dict[str, Any], field: str) -> str:
    value = payload.get(field)
    if not isinstance(value, str) or not 8 <= len(value) <= 64 or ":" in value:
        msg = f"{field} must be an 8-64 character id without ':'"
        raise TaskError(msg)
    return value


def validate(kind: str, payload: dict[str, Any]) -> None:
    """Contract checks for one task event payload (raises TaskError)."""
    if kind not in TASK_KINDS:
        msg = f"not a task kind: {kind!r}"
        raise TaskError(msg)
    if kind in ("task_item_added", "task_session_started", "task_log_added"):
        _text(payload, "subject", MAX_SUBJECT)
    if kind == "task_item_added":
        _id(payload, "item_id")
        if payload.get("type") not in ITEM_TYPES:
            msg = f"type must be one of {ITEM_TYPES}"
            raise TaskError(msg)
        _text(payload, "text")
    elif kind == "task_item_checked":
        _id(payload, "item_id")
        if not isinstance(payload.get("done"), bool):
            msg = "done must be a boolean"
            raise TaskError(msg)
    elif kind == "task_item_removed":
        _id(payload, "item_id")
    elif kind == "task_session_started":
        _id(payload, "session_id")
    elif kind == "task_session_ended":
        _id(payload, "session_id")
        note = payload.get("note")
        if note is not None and (not isinstance(note, str) or len(note) > MAX_TEXT):
            msg = f"note must be a string of at most {MAX_TEXT} characters"
            raise TaskError(msg)
    elif kind == "task_log_added":
        _id(payload, "log_id")
        _text(payload, "text")
        minutes = payload.get("minutes")
        if minutes is not None and (
            not isinstance(minutes, int)
            or isinstance(minutes, bool)
            or not 0 < minutes <= MAX_SESSION_MIN
        ):
            msg = f"minutes must be an integer in 1..{MAX_SESSION_MIN}"
            raise TaskError(msg)


def new_id() -> str:
    return uuid.uuid4().hex[:16]


def agent_write(conn: sqlite3.Connection, kind: str, payload: dict[str, Any], actor: str) -> int:
    """Hermes's door: one agent-write task event, stamped now."""
    if not actor.strip() or len(actor) > 64:
        msg = "actor must be 1-64 characters (the Hermes profile name)"
        raise TaskError(msg)
    validate(kind, payload)
    event_id = db.insert_event(
        conn,
        kind=kind,
        origin="agent-write",
        source_id=None,  # source-less agent event: the uuid ref is unique
        external_ref=f"agent:{actor}:{uuid.uuid4().hex}",
        actor=actor,
        payload=payload,
    )
    conn.commit()
    return event_id


# ---- the fold --------------------------------------------------------------


def _parse_ts(ts: str) -> datetime:
    parsed = datetime.fromisoformat(ts)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


class _Task:
    def __init__(self, subject: str) -> None:
        self.subject = subject
        self.items: dict[str, dict[str, Any]] = {}
        self.sessions: dict[str, dict[str, Any]] = {}
        self.logs: list[dict[str, Any]] = []
        self.last_ts = ""


def _fold(conn: sqlite3.Connection) -> dict[str, _Task]:
    rows = conn.execute(
        "SELECT ts, kind, actor, payload FROM event"
        f" WHERE kind IN ({','.join('?' * len(TASK_KINDS))})"
        " ORDER BY ts, id",
        tuple(sorted(TASK_KINDS)),
    ).fetchall()
    tasks: dict[str, _Task] = {}
    item_owner: dict[str, str] = {}
    session_owner: dict[str, str] = {}

    def task_for(subject: str) -> _Task:
        key = subject_key(subject)
        if key not in tasks:
            tasks[key] = _Task(" ".join(subject.split()))
        return tasks[key]

    for row in rows:
        kind, ts, actor = row["kind"], row["ts"], row["actor"]
        p = json.loads(row["payload"])
        try:
            validate(kind, p)
        except TaskError:
            continue  # a malformed historical row never breaks the read
        if kind == "task_item_added":
            t = task_for(p["subject"])
            t.items[p["item_id"]] = {
                "id": p["item_id"],
                "type": p["type"],
                "text": p["text"].strip(),
                "done": False,
                "ts": ts,
                "done_ts": None,
                "actor": actor,
            }
            item_owner[p["item_id"]] = subject_key(p["subject"])
        elif kind in ("task_item_checked", "task_item_removed"):
            key = item_owner.get(p["item_id"])
            if key is None:
                continue
            t = tasks[key]
            item = t.items.get(p["item_id"])
            if item is None:
                continue
            if kind == "task_item_removed":
                del t.items[p["item_id"]]
            else:
                item["done"] = p["done"]
                item["done_ts"] = ts if p["done"] else None
        elif kind == "task_session_started":
            t = task_for(p["subject"])
            t.sessions[p["session_id"]] = {
                "id": p["session_id"],
                "started_at": ts,
                "ended_at": None,
                "note": None,
                "actor": actor,
            }
            session_owner[p["session_id"]] = subject_key(p["subject"])
        elif kind == "task_session_ended":
            key = session_owner.get(p["session_id"])
            if key is None:
                continue
            t = tasks[key]
            s = t.sessions[p["session_id"]]
            if s["ended_at"] is None:
                s["ended_at"] = ts
            note = (p.get("note") or "").strip()
            if note:
                s["note"] = note
        elif kind == "task_log_added":
            t = task_for(p["subject"])
            t.logs.append(
                {
                    "id": p["log_id"],
                    "ts": ts,
                    "text": p["text"].strip(),
                    "minutes": p.get("minutes"),
                    "actor": actor,
                }
            )
        else:
            continue
        t.last_ts = max(t.last_ts, ts)
    return tasks


def _session_minutes(s: dict[str, Any], now: datetime) -> tuple[int, bool]:
    end = _parse_ts(s["ended_at"]) if s["ended_at"] else now
    minutes = max(0, int((end - _parse_ts(s["started_at"])).total_seconds() // 60))
    if minutes > MAX_SESSION_MIN:
        return MAX_SESSION_MIN, True
    return minutes, False


def _running(t: _Task) -> dict[str, Any] | None:
    open_sessions = [s for s in t.sessions.values() if s["ended_at"] is None]
    if not open_sessions:
        return None
    s = max(open_sessions, key=lambda x: x["started_at"])
    return {"session_id": s["id"], "started_at": s["started_at"]}


def _minutes_since(t: _Task, since: datetime, now: datetime) -> int:
    total = 0
    for s in t.sessions.values():
        if _parse_ts(s["started_at"]) >= since:
            total += _session_minutes(s, now)[0]
    for log in t.logs:
        if log["minutes"] and _parse_ts(log["ts"]) >= since:
            total += log["minutes"]
    return total


def _items(t: _Task, kind: str) -> list[dict[str, Any]]:
    items = [i for i in t.items.values() if i["type"] == kind]
    items.sort(key=lambda i: i["ts"])
    return items


def task_detail(
    conn: sqlite3.Connection, subject: str, now: datetime | None = None
) -> dict[str, object]:
    """One task's page: next-time notes, subtasks, running timer, history."""
    now = now or datetime.now(UTC)
    t = _fold(conn).get(subject_key(subject)) or _Task(" ".join(subject.split()))
    history: list[dict[str, Any]] = []
    for s in t.sessions.values():
        minutes, capped = _session_minutes(s, now)
        history.append(
            {
                "kind": "session",
                "id": s["id"],
                "ts": s["started_at"],
                "ended_at": s["ended_at"],
                "minutes": minutes,
                "capped": capped,
                "text": s["note"],
                "actor": s["actor"],
            }
        )
    for log in t.logs:
        history.append({"kind": "log", **log, "ended_at": None, "capped": False})
    history.sort(key=lambda h: h["ts"], reverse=True)
    return {
        "subject": t.subject,
        "next": [i for i in _items(t, "next") if not i["done"]],
        "subtasks": _items(t, "subtask"),
        "running": _running(t),
        "history": history[:50],
        "minutes_7d": _minutes_since(t, now - timedelta(days=7), now),
        "minutes_total": _minutes_since(t, datetime.min.replace(tzinfo=UTC), now),
    }


def task_summaries(conn: sqlite3.Connection, now: datetime | None = None) -> dict[str, object]:
    """Every task with anything on it — the card's per-row hints."""
    now = now or datetime.now(UTC)
    out: list[dict[str, object]] = []
    for t in _fold(conn).values():
        nexts = [i for i in _items(t, "next") if not i["done"]]
        open_subtasks = [i for i in _items(t, "subtask") if not i["done"]]
        out.append(
            {
                "subject": t.subject,
                "next_first": nexts[0]["text"] if nexts else None,
                "next_count": len(nexts),
                "open_subtasks": len(open_subtasks),
                "running": _running(t),
                "minutes_7d": _minutes_since(t, now - timedelta(days=7), now),
                "last_ts": t.last_ts,
            }
        )
    out.sort(key=lambda s: str(s["last_ts"]), reverse=True)
    return {"tasks": out}
