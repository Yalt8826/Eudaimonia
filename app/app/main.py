"""Eudaimonia server entrypoint.

One process in prod (frozen decision): FastAPI serves the API under /api/*
and the built SPA (client/dist) at / — no Node process exists on olympus.
In dev, Vite's proxy forwards /api to this app instead.
"""

from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import capture, db, ingest, loops, staged_writebacks, wake
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
