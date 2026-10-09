#!/usr/bin/env bash
# The three grep lints from EXECUTION.md §4 — in CI from T0.1, watching every
# commit from birth. Proving they FIRE (fixtures-that-fail + lint-selfcheck)
# is T0.6, not this file's job yet.
#
#   blur         backdrop-filter count <= 1 per screen route under client/src/routes/
#                (law 9 hard-mode budgets; 01 v2 §2 L1: glass is for touching only)
#   accent       accent/state hex literals only inside client/src/theme.css
#                (01 v2 §1 palette; a palette flip must remain a token edit)
#   chokepoint   no subprocess/Popen/hermes outside app/agent_invoke.py
#                (02 §2 law 12: one agent primitive; 02 §6 chokepoint invariant)
#
# Usage: scripts/lint_greps.sh blur|accent|chokepoint|all   (from anywhere)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ROUTES_DIR="client/src/routes"
CLIENT_SRC="client/src"
THEME_CSS="client/src/theme.css"
APP_DIR="app"
CHOKEPOINT="app/app/agent_invoke.py"

# Accent + state hexes from docs/plan/v1/01-design-system.md §1 (v2 Matte &
# Torn): both accents, plum's paper pair, the three state pairs, and the v1
# Aurora violet that survives only as a theme.css picker entry. Base/ink/paper
# tints are deliberately not on this list; the accent/state palette is.
ACCENT_HEXES=(
  2DD4BF  # --accent-1 teal
  B872F2  # --accent-2 plum (glass)
  7E22CE  # --accent-2-ink plum (paper)
  A78BFA  # v1 Aurora violet (picker entry only)
  3FB950 27963C  # alive  glass/paper
  F85149 D64545  # dead   glass/paper
  D29922 A16207  # paused glass/paper
)

check_blur() {
  local violations=0 f n
  while IFS= read -r -d '' f; do
    # grep exits 1 on zero matches — keep that out of the pipefail path.
    n=$({ grep -o 'backdrop-filter' "$f" 2>/dev/null || true; } | wc -l)
    if [ "$n" -gt 1 ]; then
      echo "BLUR BUDGET VIOLATION: $f has $n backdrop-filter occurrences (limit 1 per screen route)" >&2
      violations=1
    fi
  done < <(find "$ROUTES_DIR" -type f -name '*.tsx' ! -path '*__fixtures__*' -print0 2>/dev/null)
  return "$violations"
}

check_accent() {
  local patterns=() out h
  for h in "${ACCENT_HEXES[@]}"; do patterns+=(-e "$h"); done
  out=$(grep -riF "${patterns[@]}" "$CLIENT_SRC" \
          --exclude-dir='__fixtures__' --exclude-dir='node_modules' 2>/dev/null \
          | grep -v "^${THEME_CSS}:" || true)
  if [ -n "$out" ]; then
    echo "ACCENT HEX OUTSIDE ${THEME_CSS}:" >&2
    echo "$out" >&2
    return 1
  fi
  return 0
}

check_chokepoint() {
  local out
  # Test files are out of scope: they mock the chokepoint's transport and
  # assert on its command shape — spawning laws bind production code.
  out=$(grep -rnE 'subprocess|Popen|os\.system|\bhermes\b' \
          --include='*.py' --exclude-dir='.venv' --exclude-dir='__pycache__' \
          "$APP_DIR" 2>/dev/null \
        | grep -v "^${CHOKEPOINT}:" | grep -v "^${APP_DIR}/tests/" || true)
  if [ -n "$out" ]; then
    echo "CHOKEPOINT VIOLATION — agent transport outside ${CHOKEPOINT} (02 §2 law 12):" >&2
    echo "$out" >&2
    return 1
  fi
  return 0
}

case "${1:-all}" in
  blur)       check_blur ;;
  accent)     check_accent ;;
  chokepoint) check_chokepoint ;;
  all)        check_blur && check_accent && check_chokepoint ;;
  *)
    echo "usage: $0 blur|accent|chokepoint|all" >&2
    exit 2
    ;;
esac
