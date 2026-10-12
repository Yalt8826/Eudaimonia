#!/usr/bin/env bash
# The three grep lints from EXECUTION.md §4 — in CI from T0.1, watching every
# commit from birth. T0.6 completes them with fixtures-that-fail + selfcheck:
# a lint rule with no failing fixture is a lint rule nobody has proven fires.
#
#   blur         backdrop-filter count <= 1 per screen route under client/src/routes/
#                (law 9 hard-mode budgets; 01 v2 §2 L1: glass is for touching only)
#   accent       accent/state hex literals only inside the token files —
#                client/src/theme.css (web) and mobile/src/theme/tokens.ts
#                (01 v2 §1 palette; a palette flip must remain a token edit)
#   chokepoint   no subprocess/Popen/hermes outside app/app/agent_invoke.py
#                (02 §2 law 12: one agent primitive; 02 §6 chokepoint invariant)
#
# Usage: scripts/lint_greps.sh blur|accent|chokepoint|all|selfcheck
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ROUTES_DIR="client/src/routes"
CLIENT_SRC="client/src"
THEME_CSS="client/src/theme.css"
MOBILE_SRC="mobile/src"
MOBILE_TOKENS="mobile/src/theme/tokens.ts"
APP_DIR="app"
CHOKEPOINT="app/app/agent_invoke.py"

# Fixtures-that-fail (T0.6): each check must fire on its fixture (excluded
# from the build and from tsc/eslint; the tree checks exclude them) and the
# tree must pass. `selfcheck` asserts both in one step, so a regex that
# silently stops matching turns CI red, not merely useless.
BLUR_FIXTURE="client/src/routes/__fixtures__/blur_violation.tsx"
ACCENT_FIXTURE="client/src/__fixtures__/accent_violation.tsx"
CHOKEPOINT_FIXTURE="app/tests/fixtures/chokepoint_violation.py.txt"

# Accent + state hexes from docs/plan/v1/01-design-system.md §1 (v2 Matte &
# Torn): both accents, plum's paper pair, the three state pairs, and the v1
# Aurora violet that survives only as a theme.css picker entry. Base/ink/paper
# tints are deliberately not on this list; the accent/state palette is.
ACCENT_HEXES=(
  2DD4BF  # --accent-1 teal
  B872F2  # --accent-2 plum (glass)
  7E22CE  # --accent-2-ink plum (paper)
  0F766E  # --accent-1-ink teal (paper) — added 2026-10-12 with the hue-law
          # accents; the list had no entry for it, so the rule had a hole
          # for exactly as long as the token existed
  A78BFA  # v1 Aurora violet (picker entry only)
  3FB950 27963C  # alive  glass/paper
  F85149 D64545  # dead   glass/paper
  D29922 A16207  # paused glass/paper
)

blur_file_ok() {  # true when one screen-route file is within the budget
  local f="$1" n
  # grep exits 1 on zero matches — keep that out of the pipefail path.
  n=$({ grep -o 'backdrop-filter' "$f" 2>/dev/null || true; } | wc -l)
  [ "$n" -le 1 ]
}

check_blur() {  # optional arg: a single target file (selfcheck)
  local violations=0 f
  while IFS= read -r -d '' f; do
    if ! blur_file_ok "$f"; then
      echo "BLUR BUDGET VIOLATION: $f has more than 1 backdrop-filter (limit 1 per screen route)" >&2
      violations=1
    fi
  done < <(if [ $# -gt 0 ]; then printf '%s\0' "$1"; else find "$ROUTES_DIR" -type f -name '*.tsx' ! -path '*__fixtures__*' -print0 2>/dev/null; fi)
  return "$violations"
}

accent_hits() {  # prints matches for a target path (dir or file)
  local target="$1" patterns=() h
  for h in "${ACCENT_HEXES[@]}"; do patterns+=(-e "$h"); done
  # Both token files are exempt — each client has exactly one place where
  # the palette is spelled out, and everything else reads from it.
  grep -riF "${patterns[@]}" "$target" \
        --exclude-dir='__fixtures__' --exclude-dir='node_modules' \
        --exclude-dir='.expo' --exclude-dir='renders' 2>/dev/null \
      | grep -v "^${THEME_CSS}:" \
      | grep -v "^${MOBILE_TOKENS}:" || true
}

check_accent() {  # optional arg: a single target path (selfcheck)
  local out targets=()
  if [ $# -gt 0 ]; then
    targets=("$1")
  else
    targets=("$CLIENT_SRC")
    # mobile/ only exists mid-migration; scan it when it is there.
    [ -d "$MOBILE_SRC" ] && targets+=("$MOBILE_SRC")
  fi
  out=$(for tgt in "${targets[@]}"; do accent_hits "$tgt"; done)
  if [ -n "$out" ]; then
    echo "ACCENT HEX OUTSIDE ${THEME_CSS} / ${MOBILE_TOKENS}:" >&2
    echo "$out" >&2
    return 1
  fi
  return 0
}

chokepoint_hits() {  # prints matches for a target dir; test files are out of
  # scope (they mock the chokepoint and assert on its command shape — the
  # spawning laws bind production code).
  local target="$1"
  grep -rnE 'subprocess|Popen|os\.system|\bhermes\b' \
        --include='*.py' --exclude-dir='.venv' --exclude-dir='__pycache__' \
        "$target" 2>/dev/null \
      | grep -v "^${CHOKEPOINT}:" | grep -v "^${APP_DIR}/tests/" || true
}

check_chokepoint() {  # optional arg: a single target dir (selfcheck)
  local out
  out=$(chokepoint_hits "${1:-$APP_DIR}")
  if [ -n "$out" ]; then
    echo "CHOKEPOINT VIOLATION — agent transport outside ${CHOKEPOINT} (02 §2 law 12):" >&2
    echo "$out" >&2
    return 1
  fi
  return 0
}

# The fixture lives as .py.txt (invisible to the tree check's --include);
# the self-check proves the same regex fires on it by offering it as real .py.
check_chokepoint_fixture() {
  local tmp
  tmp=$(mktemp -d)
  cp "$CHOKEPOINT_FIXTURE" "$tmp/chokepoint_violation.py"
  local rc=0
  check_chokepoint "$tmp" || rc=1
  rm -rf "$tmp"
  return "$rc"
}

check_selfcheck() {
  local rc=0
  echo "lint-selfcheck: fixtures must fail, tree must pass (both in one step)"

  if check_blur "$BLUR_FIXTURE"; then
    echo "  RED FLAG: blur fixture did NOT trip the budget — the grep stopped matching" >&2; rc=1
  else echo "  ok: blur fixture trips (as it must)"; fi

  if check_accent "$ACCENT_FIXTURE"; then
    echo "  RED FLAG: accent fixture did NOT trip — the grep stopped matching" >&2; rc=1
  else echo "  ok: accent fixture trips (as it must)"; fi

  if check_chokepoint_fixture; then
    echo "  RED FLAG: chokepoint fixture did NOT trip — the grep stopped matching" >&2; rc=1
  else echo "  ok: chokepoint fixture trips (as it must)"; fi

  check_blur        || { echo "  tree blur check FAILED" >&2; rc=1; }
  check_accent      || { echo "  tree accent check FAILED" >&2; rc=1; }
  check_chokepoint  || { echo "  tree chokepoint check FAILED" >&2; rc=1; }
  echo "  ok: clean tree passes all three"

  return "$rc"
}

case "${1:-all}" in
  blur)       check_blur ;;
  accent)     check_accent ;;
  chokepoint) check_chokepoint ;;
  all)        check_blur && check_accent && check_chokepoint ;;
  selfcheck)  check_selfcheck ;;
  *)
    echo "usage: $0 blur|accent|chokepoint|all|selfcheck" >&2
    exit 2
    ;;
esac
