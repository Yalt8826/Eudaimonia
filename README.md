# Eudaimonia

One FastAPI + SQLite server on olympus, three thin clients. Build plan and
laws live in `docs/plan/v1/`; the task-level schedule lives in
`docs/implementation/` (`EXECUTION.md` is the master schedule).

## Layout

```
app/       FastAPI + SQLite (uv-managed). One process in prod: serves the
           API under /api/* and the built SPA (client/dist) at /.
client/    React PWA (Vite + TS, pnpm). Build output is static files —
           no Node process exists in prod.
docs/      plan (v1 design + architecture) and implementation (phases).
scripts/   lint_greps.sh — the three EXECUTION.md §4 grep lints.
```

## Quickstart

Server (Python 3.13, pinned via uv):

```
cd app
uv sync
uv run pytest
uv run uvicorn app.main:app --reload
```

Client (Node 26, pnpm — see `.nvmrc` and `packageManager`):

```
cd client
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm dev        # proxies /api -> http://127.0.0.1:8000
```

In prod the server serves `client/dist` at `/`; there is no Node process.

## Grep lints (EXECUTION.md §4)

```
scripts/lint_greps.sh all   # blur budget · accent hexes · chokepoint
```

## NFS / fuseblk caveats

This repo lives on a fuseblk mount (`core.fileMode` is already set to
`false` — leave it). Dev servers watching vault paths over NFS need
`WATCHFILES_FORCE_POLLING=true` (uvicorn) and `CHOKIDAR_USEPOLLING=true`
(vite).
