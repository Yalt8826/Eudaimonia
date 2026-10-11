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
# NEVER background a daemon over ssh with `cd somewhere && nohup daemon &`.
# The `&` applies to the AND-LIST, so bash forks a subshell to run it, and
# the `>> log 2>&1` redirection binds to the inner command rather than to
# that subshell — which therefore keeps ssh's stdout/stderr pipes and blocks
# in wait() for a daemon that never exits. ssh then hangs forever with the
# health check already printed, which is exactly what it looks like: a
# successful deploy that never returns (observed 2026-10-11, confirmed by
# fd and wchan inspection; `uv run` supervises uvicorn for its lifetime, so
# the wait never ends). `setsid --fork` below starts daemons with no `&` at
# all, so no subshell is created and nothing is left holding the channel.
#
# Requires: gh-authenticated ssh to $HOST (BatchMode), pnpm, rsync.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

HOST=olympus
REMOTE_DIR=eudaimonia
SSH="ssh -o BatchMode=yes"

# Restart a remote daemon and PROVE the new one is serving.
#
#   restart_remote NAME PGREP_PATTERN START_CMD HEALTH_URL LOG_BASENAME
#
# LOG_BASENAME is relative to the REMOTE home: $HOME here is the deploying
# machine, and the two accounts are not the same user.
#
# The old code was `pkill || true; sleep 1; start; sleep 3; curl`. Both
# sleeps were guesses, and the failure they hid is the dangerous one: if the
# old process was still holding the port a second later, the new one exits
# with EADDRINUSE into its log and the health check passes AGAINST THE
# PROCESS WE MEANT TO REPLACE — a green deploy still serving the old build
# (freshness is not success, 01 §7). So: wait for the old PIDs to actually
# go, then require the serving PID to have changed.
restart_remote() {
  local name=$1 pattern=$2 start=$3 health=$4 log=$5
  local before after

  echo "== restart $name =="
  before=$($SSH "$HOST" "pgrep -f '$pattern' | sort | tr '\n' ' '" || true)

  if ! $SSH "$HOST" "pkill -f '$pattern' || true
      for _ in \$(seq 1 40); do pgrep -f '$pattern' >/dev/null || exit 0; sleep 0.25; done
      exit 1"; then
    echo "$name: the old process would not exit (pids:$before) — deploy aborted" >&2
    return 1
  fi

  $SSH "$HOST" "$start"

  if ! $SSH "$HOST" "for _ in \$(seq 1 40); do
        curl -fs -o /dev/null '$health' && exit 0
        sleep 0.25
      done
      exit 1"; then
    echo "$name: never became healthy at $health — last log lines:" >&2
    $SSH "$HOST" "tail -n 20 \"\$HOME/$log\"" >&2 || true
    return 1
  fi

  after=$($SSH "$HOST" "pgrep -f '$pattern' | sort | tr '\n' ' '" || true)
  if [ -z "$after" ]; then
    echo "$name: healthy but no process matches '$pattern' — check the pattern" >&2
    return 1
  fi
  if [ "$before" = "$after" ]; then
    echo "$name: still the OLD process (pids:$after) — it never restarted" >&2
    return 1
  fi
  echo "   $name ok — pids:$after (was:${before:-none})"
}

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

  restart_remote uvicorn "[u]vicorn app.main" \
    'cd ~/eudaimonia/app && setsid --fork ~/.local/bin/uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 >> ~/eudaimonia-uvicorn.log 2>&1 < /dev/null' \
    'http://127.0.0.1:8000/api/health' \
    eudaimonia-uvicorn.log

  restart_remote static-server "[s]erve_static.py" \
    'setsid --fork python3 ~/eudaimonia/scripts/serve_static.py 8090 >> ~/eudaimonia-static.log 2>&1 < /dev/null' \
    'http://127.0.0.1:8090/' \
    eudaimonia-static.log
fi

echo "== verify origin =="
code=$(curl -s -o /dev/null -w '%{http_code}' https://eudaimonia.yalt8826.com/)
api=$(curl -s -o /dev/null -w '%{http_code}' https://eudaimonia.yalt8826.com/api/health)
echo "index: $code (want 200) · /api: $api (want 404 — public plane serves shell only)"
[ "$code" = "200" ] && [ "$api" = "404" ] || {
  echo "DEPLOY FAILED verification — check the tunnel: ssh $HOST 'tail ~/eudaimonia-tunnel.log'" >&2
  exit 1
}

# 200 and 404 only prove the tunnel is up and the static server is running.
# Neither touches the bundle, so both pass while the origin serves the
# PREVIOUS build. sw.js is stamped at the top of this script precisely so
# clients update; this is the check that the stamp actually arrived.
echo "== verify the shipped build =="
if curl -fsS https://eudaimonia.yalt8826.com/sw.js | grep -qF "// build $version"; then
  echo "deploy OK — origin is serving build $version"
else
  echo "DEPLOY FAILED: the origin's sw.js is not build $version (stale dist?)" >&2
  exit 1
fi
