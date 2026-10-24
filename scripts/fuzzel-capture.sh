#!/usr/bin/env bash
# T2.3 — the fuzzel capture door (03 §9: desktop = Hyprland keybind →
# fuzzel prompt → POST /capture against the tailnet API — zero GUI).
#
# Wire it in Hyprland:
#   bind = SUPER, C, exec, ~/.local/bin/fuzzel-capture.sh
# (copy or symlink this script there; it has no repo-side state)
#
# Deps: fuzzel, curl, notify-send (libnotify). All present on athena's
# Hyprland; if notify-send is missing the capture still lands — the
# notification is best-effort feedback, and failure of the pipe is NOT
# swallowed: a failed POST prints the failure to the notification.
#
# The text rides the T2.3 door: POST /capture {text, origin:"fuzzel"} →
# capture_raw event → background triage (agent_invoke, 180s single
# attempt). Failure of the TRIAGE never surfaces here by design — the
# capture is safely in the spine either way; the capture list shows the
# untriaged state with its retry affordance.
set -euo pipefail

API="${EUDAIMONIA_API:-https://olympus.tail7270c7.ts.net}"

TEXT="$(fuzzel --dmenu --prompt 'capture  >  ' </dev/null)" || exit 0
[ -n "$TEXT" ] || exit 0

if curl -fsS -m 20 -X POST "$API/capture" \
    -H 'content-type: application/json' \
    --data "$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "origin": "fuzzel"}))' "$TEXT")" \
    >/dev/null; then
  notify-send -u low "captured" "$TEXT" 2>/dev/null || true
else
  # offline or server down: print it loudly. The fuzzel window is gone by
  # now, so the failure notification carries the text for a re-fire.
  notify-send -u critical "capture FAILED — not saved" "$TEXT" 2>/dev/null \
    || { echo "capture FAILED — not saved: $TEXT" >&2; exit 1; }
fi
