#!/usr/bin/env bash
# ops-deploy.sh — deploy Eudaimonia to olympus.
#
# Usage: scripts/ops-deploy.sh [--full]
#
#   default   build the client, stamp dist/sw.js with the build id (an
#             identical sw.js never triggers a PWA update — clients would
#             serve the old shell forever), rsync dist, verify the origin.
#   --full    also rsync app/ + scripts/, `uv sync` on olympus, and restart
#             uvicorn + the static server. Kill and start happen in SEPARATE
#             ssh calls and the pkill pattern uses [b]racket-escaping — a
#             literal pattern matches the caller's own command line and kills
#             the deploy mid-flight (both traps observed 2026-10-10).
#
# Requires: gh-authenticated ssh to $HOST (BatchMode), pnpm, rsync.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HOST=olympus
REMOTE_DIR=eudaimonia
SSH="ssh -o BatchMode=yes"

full=false
case "${1:-}" in
  "") full=false ;;
  --full) full=true ;;
  *) echo "usage: $0 [--full]" >&2; exit 2 ;;
esac

echo "== build client (typecheck + bundle) =="
(cd client && pnpm build)

version="$(git describe --always --dirty)"
printf '\n// build %s (%s)\n' "$version" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> client/dist/sw.js
echo "== sw.js stamped: build $version =="

echo "== rsync client/dist =="
rsync -a -e "ssh -o BatchMode=yes" client/dist/ "$HOST:$REMOTE_DIR/client/dist/"

if $full; then
  echo "== rsync app/ + scripts/ =="
  rsync -a -e "ssh -o BatchMode=yes" \
    --exclude .venv --exclude __pycache__ --exclude '*.db' \
    app/ "$HOST:$REMOTE_DIR/app/"
  rsync -a -e "ssh -o BatchMode=yes" scripts/ "$HOST:$REMOTE_DIR/scripts/"
  echo "== uv sync (olympus) =="
  $SSH "$HOST" 'cd ~/eudaimonia/app && ~/.local/bin/uv sync'

  echo "== restart uvicorn =="
  # The [b]racket keeps the pattern from matching this ssh call's own shell.
  $SSH "$HOST" 'pkill -f "[u]vicorn app.main" || true'
  sleep 1
  $SSH "$HOST" 'cd ~/eudaimonia/app && nohup ~/.local/bin/uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 >> ~/eudaimonia-uvicorn.log 2>&1 < /dev/null & sleep 3; curl -s http://127.0.0.1:8000/api/health'; echo

  echo "== restart static server =="
  $SSH "$HOST" 'pkill -f "[s]erve_static.py" || true'
  sleep 1
  $SSH "$HOST" 'nohup python3 ~/eudaimonia/scripts/serve_static.py 8090 >> ~/eudaimonia-static.log 2>&1 < /dev/null & sleep 2; curl -s -o /dev/null -w "static: %{http_code}\n" http://127.0.0.1:8090/'
fi

echo "== verify origin =="
code=$(curl -s -o /dev/null -w '%{http_code}' https://eudaimonia.yalt8826.com/)
api=$(curl -s -o /dev/null -w '%{http_code}' https://eudaimonia.yalt8826.com/api/health)
echo "index: $code (want 200) · /api: $api (want 404 — public plane serves shell only)"
[ "$code" = "200" ] && [ "$api" = "404" ] && echo "deploy OK" || {
  echo "DEPLOY FAILED verification — check the tunnel: ssh $HOST 'tail ~/eudaimonia-tunnel.log'" >&2
  exit 1
}
