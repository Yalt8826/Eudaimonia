"""Eudaimonia server entrypoint.

One process in prod (frozen decision): FastAPI serves the API under /api/*
and the built SPA (client/dist) at / — no Node process exists on olympus.
In dev, Vite's proxy forwards /api to this app instead.
"""

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

CLIENT_DIST = Path(__file__).resolve().parent.parent / "client" / "dist"

app = FastAPI(title="Eudaimonia", docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


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


def _red_proof_law12_violation() -> None:
    import subprocess

    subprocess.run(["hermes", "-z", "hi"])  # deliberate chokepoint violation
