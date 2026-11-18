"""Eudaimonia server entrypoint.

One process in prod (frozen decision): FastAPI serves the API under /api/*
and the built SPA (client/dist) at / — no Node process exists on olympus.
In dev, Vite's proxy forwards /api to this app instead.
"""

from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app import (
    adapters,
    capture,
    db,
    ingest,
    loops,
    questions,
    routines,
    staged_writebacks,
    tasks,
    wake,
)
from app.ingest import CaptureBody, ReplayBody, RetriageBody

# repo-root/client/dist — parents[2] because this file lives at app/app/main.py
CLIENT_DIST = Path(__file__).resolve().parents[2] / "client" / "dist"

app = FastAPI(title="Eudaimonia", docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/events/{kind}")
async def ingest_event(
    kind: str, body: ReplayBody, background_tasks: BackgroundTasks
) -> dict[str, object]:
    """The app-write ingest door (P2 T2.1) — the queue's ReplayBody lands here.

    Contract violations are 422 (the outbox's poison path — failure must be
    visible, 02 §6); a replay of a stored event is 200 duplicate:true —
    never a second row (02 §1). Connection per request: SQLite file opens
    are cheap and the one-process prod shape has no pool to share.
    """
    conn = db.connect(db.db_path())
    try:
        result = ingest.ingest_event(conn, kind, body)
    except ingest.IngestError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        conn.close()
    if kind == "capture_raw" and not result["duplicate"]:
        # an offline capture just drained — it deserves its triage too
        # (T2.3: the sweep takes every untriaged capture, oldest first)
        background_tasks.add_task(capture.triage_pending)
    if kind in loops.RESOLUTION_KINDS and not result["duplicate"]:
        # an offline resolution just drained — apply the cache row update
        # (the loop row is a denormalized cache of the spine, EXECUTION §1)
        background_tasks.add_task(loops.apply_resolution_event, kind, dict(body.payload))
    return result


@app.get("/api/habits/wake/stats")
async def wake_stats() -> dict[str, object]:
    """The WAKE row's numbers — the one definition (app/app/wake.py).

    Read-only over the spine; empty is honest (zeros + null last_tap), the
    client decides what zero means via total_taps.
    """
    conn = db.connect(db.db_path())
    try:
        return wake.wake_stats(conn)
    finally:
        conn.close()


@app.post("/capture")
async def capture_route(
    body: CaptureBody, background_tasks: BackgroundTasks
) -> dict[str, object]:
    """The capture door (T2.3): fuzzel, the PWA FAB, any direct poster.

    Lands capture_raw and answers immediately; triage runs in the
    background through the chokepoint (180 s single attempt) — the 5-min
    exit budget covers queue + model latency.
    """
    conn = db.connect(db.db_path())
    try:
        landed = capture.land_capture(
            conn, text=body.text, photo_ref=body.photo_ref, origin=body.origin
        )
    except capture.CaptureError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        conn.close()
    background_tasks.add_task(capture.triage_pending)
    return landed


@app.get("/api/capture/recent")
async def capture_recent() -> dict[str, object]:
    """Recent captures with their honest triage state (T2.3's list)."""
    conn = db.connect(db.db_path())
    try:
        return {"captures": capture.recent_captures(conn)}
    finally:
        conn.close()


@app.post("/api/capture/retriage")
async def capture_retriage(body: RetriageBody) -> dict[str, object]:
    """The MANUAL retry path — runs a fresh triage attempt beside the
    originals (append-only; the first triage event is never edited).
    Deliberately NOT an auto-retry: triage failures surface to the human,
    who decides when to retry (PHASE-P2 T2.3).
    """
    conn = db.connect(db.db_path())
    try:
        return capture.retriage(conn, body.capture_ref)
    except capture.CaptureError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        conn.close()


@app.get("/api/notes/recent")
async def notes_recent() -> dict[str, object]:
    """Recent notes with their honest write-back state (T2.4): staged
    (waiting for the applier) or applied (with the vault line ref)."""
    conn = db.connect(db.db_path())
    try:
        return {"notes": staged_writebacks.recent_notes(conn)}
    finally:
        conn.close()


@app.post("/api/notes/apply")
async def notes_apply() -> dict[str, object]:
    """The MANUAL applier trigger (T2.4): appends every staged note to its
    daily note in the vault — the repo's only vault write. Idempotent:
    a second run changes zero bytes."""
    return staged_writebacks.apply_pending()


@app.get("/api/questions/open")
async def questions_open() -> dict[str, object]:
    """The question queue (T2.5): open and picked_up rows, oldest first.
    Answered questions are history — provenance-edged, not pending work.
    """
    conn = db.connect(db.db_path())
    try:
        return questions.open_questions(conn)
    finally:
        conn.close()


@app.post("/api/questions/{question_id}/ask")
async def question_ask(
    question_id: int, background_tasks: BackgroundTasks
) -> dict[str, object]:
    """Send a question to a profile (T2.5): picks it up and dispatches the
    invocation as a background task. The background half is the ONE
    writer that settles answered/open — a pre-chokepoint failure there
    reverts the row itself, so a question cannot stick at picked_up.
    Profile defaults to clio; the picker widens in P4.
    """
    conn = db.connect(db.db_path())
    try:
        receipt = questions.ask(conn, question_id)
    except questions.QuestionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        conn.close()
    background_tasks.add_task(
        questions.run_ask, question_id, receipt["text"], receipt["profile"]
    )
    return receipt


@app.post("/api/ingest/run")
async def ingest_run() -> dict[str, object]:
    """Run every adapter (P1): chain-following ingest over the vault and
    the cron chains. Idempotent by the spine's UNIQUE constraint — a
    second run writes nothing. Runs on olympus where the files are local.
    """
    conn = db.connect(db.db_path())
    try:
        return {"runs": adapters.ingest_all(conn)}
    finally:
        conn.close()


@app.get("/api/coverage")
async def coverage() -> dict[str, object]:
    """The shared coverage view (law 7) — the ONLY definition of strip
    freshness anywhere. Empty sources render honest zeros."""
    conn = db.connect(db.db_path())
    try:
        rows = conn.execute(
            "SELECT source_name, class, status, last_ok_read_ts,"
            " days_fresh_7, artifact_count, paused_evidence FROM coverage"
            " ORDER BY source_name"
        ).fetchall()
        return {
            "coverage": [
                {
                    "source": r["source_name"],
                    "class": r["class"],
                    "status": r["status"],
                    "last_ok_read_ts": r["last_ok_read_ts"],
                    "days_fresh_7": r["days_fresh_7"],
                    "artifact_count": r["artifact_count"],
                    "paused_evidence": r["paused_evidence"],
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


@app.get("/api/plan/today")
async def plan_today() -> dict[str, object]:
    """The plan strip's data: the latest week-plan revision's extracted
    lines + its coverage. plan:missing when no revision exists — asserted,
    never synthesized (T1.3; the dry-run's finding 3)."""
    conn = db.connect(db.db_path())
    try:
        return adapters.plan_today(conn)
    finally:
        conn.close()


@app.get("/api/routine/day")
async def routine_day(date: str) -> dict[str, object]:
    """One plan day's routine ticks (T2.7), read off the spine.

    One row per (routine_key, date) exists by the UNIQUE constraint, so
    the ticks list IS the day's state — there is no routine table (07
    §19) and no latest-wins logic to apply. A bad date param is a 422:
    the same loud failure the ingest door gives an unregistered kind."""
    conn = db.connect(db.db_path())
    try:
        try:
            return routines.day(conn, date)
        except routines.RoutineError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        conn.close()


@app.get("/api/loops/open")
async def open_loops() -> dict[str, object]:
    """Open waiting-ons, oldest first, with the counts the Plaza badge and
    the inbox tabs need. Read-only over the loop cache; empty is honest.
    """
    conn = db.connect(db.db_path())
    try:
        return loops.open_loops(conn)
    finally:
        conn.close()


# ---- tasks (the plan card's task pages) -------------------------------------
# Reads serve the phone and Hermes alike. The writes below are HERMES'S
# door (agent-write, actor = profile); the phone writes the same kinds
# through /api/events/{kind} so they survive being offline.


class TaskItemBody(BaseModel):
    type: str = "subtask"
    text: str
    actor: str = Field(default="agent", max_length=64)


class TaskCheckBody(BaseModel):
    done: bool = True
    actor: str = Field(default="agent", max_length=64)


class TaskActorBody(BaseModel):
    actor: str = Field(default="agent", max_length=64)


class TaskLogBody(BaseModel):
    text: str
    minutes: int | None = None
    actor: str = Field(default="agent", max_length=64)


def _task_write(kind: str, payload: dict[str, object], actor: str) -> int:
    conn = db.connect(db.db_path())
    try:
        return tasks.agent_write(conn, kind, payload, actor)
    except tasks.TaskError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    finally:
        conn.close()


@app.get("/api/tasks")
async def task_list() -> dict[str, object]:
    """Every task with notes, subtasks or time on it (card hints)."""
    conn = db.connect(db.db_path())
    try:
        return tasks.task_summaries(conn)
    finally:
        conn.close()


@app.get("/api/tasks/{subject}")
async def task_detail(subject: str) -> dict[str, object]:
    """One task: next-time notes, subtasks, running timer, session history."""
    conn = db.connect(db.db_path())
    try:
        return tasks.task_detail(conn, subject)
    finally:
        conn.close()


@app.post("/api/tasks/items/{item_id}/check")
async def task_item_check(item_id: str, body: TaskCheckBody) -> dict[str, object]:
    event_id = _task_write(
        "task_item_checked", {"item_id": item_id, "done": body.done}, body.actor
    )
    return {"status": "ok", "event_id": event_id}


@app.post("/api/tasks/items/{item_id}/remove")
async def task_item_remove(item_id: str, body: TaskActorBody) -> dict[str, object]:
    event_id = _task_write("task_item_removed", {"item_id": item_id}, body.actor)
    return {"status": "ok", "event_id": event_id}


@app.post("/api/tasks/{subject}/items")
async def task_item_add(subject: str, body: TaskItemBody) -> dict[str, object]:
    item_id = tasks.new_id()
    event_id = _task_write(
        "task_item_added",
        {"subject": subject, "item_id": item_id, "type": body.type, "text": body.text},
        body.actor,
    )
    return {"status": "ok", "event_id": event_id, "item_id": item_id}


@app.post("/api/tasks/{subject}/logs")
async def task_log_add(subject: str, body: TaskLogBody) -> dict[str, object]:
    payload: dict[str, object] = {"subject": subject, "log_id": tasks.new_id(), "text": body.text}
    if body.minutes is not None:
        payload["minutes"] = body.minutes
    event_id = _task_write("task_log_added", payload, body.actor)
    return {"status": "ok", "event_id": event_id}


@app.post("/api/{rest:path}")
async def api_post_fallback(rest: str) -> JSONResponse:
    """Unknown /api paths under POST answer JSON 404, same contract as GET —
    never the SPA shell, never a bare 405 from the catch-all GET route."""
    raise HTTPException(status_code=404, detail="Not found")


if CLIENT_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=CLIENT_DIST / "assets"), name="assets")


@app.get("/{full_path:path}", include_in_schema=False, response_model=None)
async def spa(full_path: str) -> FileResponse | JSONResponse:
    """Serve built client files; unknown paths fall back to the SPA shell.

    Deep links (e.g. /habits/wake) are client-side routes — they must serve
    index.html, never a 404. /api/* keeps JSON semantics.
    """
    if full_path == "api" or full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    if not CLIENT_DIST.is_dir():
        return JSONResponse(
            status_code=503,
            content={"detail": "client not built — run `pnpm build` in client/"},
        )
    candidate = (CLIENT_DIST / full_path).resolve()
    if full_path and candidate.is_file() and candidate.is_relative_to(CLIENT_DIST):
        return FileResponse(candidate)
    return FileResponse(CLIENT_DIST / "index.html")
