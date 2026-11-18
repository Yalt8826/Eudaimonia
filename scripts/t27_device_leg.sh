#!/usr/bin/env bash
# T2.7 device leg — the exit test, on the phone, against the real ingest
# endpoint. The caller has already swapped the scratch server onto
# olympus:8000 (the port tailscale serve fronts) with a THROWAWAY db and
# run one ingest so the scratch spine holds a live week-plan revision
# (plan_keys included — the phone ticks only keyed lines). The installed
# APK talks to the new code over the real ts.net data plane, and the
# owner's prod spine stays untouched: the tick this leg induces is a test
# tick and must never read as a real routine tick.
#
#   ingest scratch → verify plan/today carries plan_keys
#   → pre-drain (the OLD app's queued writes land here and are reported)
#   → snapshot → airplane ON → cold open offline → /routine deeplink
#   → tap a block's done (wall time recorded) → "queued" asserted
#   → force-stop → airplane OFF → relaunch → drain → scratch asserts:
#   exactly one routine_done above the snapshot, ts == tap time,
#   external_ref = "{routine_key}:{today}", method tap|recall, source app
#   → a second foreground proves the replay dedupe on-device.
#
# Cleanup on ANY exit: airplane mode off, screen auto-sleep restored.
set -u

ADB="${ADB:-$HOME/Android/Sdk/platform-tools/adb}"
PKG="com.yalt8826.eudaimonia"
ACT="$PKG/.MainActivity"
SCHEME_LINK="web+eudaimonia://routine"
OLYMPUS="olympus"
SSH="ssh -o BatchMode=yes"
READER="/home/yashas/t27-scratch/read_events.py"   # path ON OLYMPUS
TAP_TOL_S=3        # tap-time comparison tolerance (uiautomator round-trip)
TODAY=$(date +%F)

die() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "PASS: $*"; }

ui_dump() {
  $ADB shell uiautomator dump /sdcard/t27_dump.xml >/dev/null 2>&1 || return 1
  $ADB shell cat /sdcard/t27_dump.xml 2>/dev/null | tr -d '\r'
}

ui_has_text() { ui_dump | grep -q "$1"; }

ui_tap_text() {
  local xy
  xy=$(ui_dump | python3 -c '
import re, sys
needle = sys.argv[1]
xml = sys.stdin.read()
pat = re.compile(r"(?:text|content-desc)=\"([^\"]*%s[^\"]*)\"[^>]*bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"" % re.escape(needle))
m = pat.search(xml)
if not m:
    sys.exit(1)
l, t, r, b = map(int, m.group(2, 3, 4, 5))
print((l + r) // 2, (t + b) // 2)
' "$1") || die "UI node containing '$1' not found"
  $ADB shell input tap $xy
}

assert_app_foreground() {
  local top
  top=$($ADB shell dumpsys activity activities 2>/dev/null | tr -d '\r' | grep -m1 "topResumedActivity")
  echo "$top" | grep -q "$PKG" || die "app not foreground: $top"
}

read_events() { $SSH $OLYMPUS "/home/yashas/eudaimonia/app/.venv/bin/python $READER $1"; }

wake_device() {
  $ADB shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
  $ADB shell svc power stayon usb >/dev/null 2>&1 || true
  sleep 1
  $ADB shell input swipe 540 1800 540 700 150 >/dev/null 2>&1 || true
  sleep 1
}

restore_on_exit() {
  echo "--- cleanup: restoring radios" >&2
  $ADB shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true
  $ADB shell svc power stayon usb false >/dev/null 2>&1 || true
}
trap restore_on_exit EXIT INT TERM

# ---- preflight ----------------------------------------------------------

$ADB get-state >/dev/null 2>&1 || die "no device"
wake_device

# the scratch spine must hold a live plan WITH keys — no keys, no ticks
plan=$($ADB shell "curl -s -m 8 'https://olympus.tail7270c7.ts.net/api/plan/today'" 2>/dev/null | tr -d '\r')
echo "$plan" | grep -q '"plan":"ok"' || die "plan/today is not ok on scratch (got: ${plan:0:120})"
echo "$plan" | grep -q '"plan_keys":\["' || die "plan/today carries no routine keys (got: ${plan:0:120})"
ok "scratch fronting ts.net: plan ok, keys present"

# ---- pre-drain: the OLD app's queued writes, if any, land here ----------

$ADB shell am force-stop "$PKG"; sleep 1
$ADB shell am start -W -n "$ACT" >/dev/null
sleep 10   # reconnect + drain window
PRE=$(read_events 0 | head -1)
ok "pre-drain complete: $PRE device-real event(s) landed in scratch (replay into prod after deploy)"

SNAP=$($SSH $OLYMPUS '/home/yashas/eudaimonia/app/.venv/bin/python -c "import sqlite3; c = sqlite3.connect(chr(47).join((\"/home/yashas\", \"t27-scratch\", \"scratch.db\"))); print(c.execute(\"SELECT COALESCE(MAX(id), 0) FROM event\").fetchone()[0])"')
[ -n "$SNAP" ] || die "could not snapshot the spine"
ok "scratch spine snapshotted at id $SNAP"

# ---- the exit test ------------------------------------------------------

$ADB shell cmd connectivity airplane-mode enable >/dev/null
sleep 3
[ "$($ADB shell settings get global airplane_mode_on | tr -d '\r')" = "1" ] || die "airplane mode did not engage"
ok "airplane mode on"

$ADB shell am force-stop "$PKG"; sleep 1
out=$($ADB shell am start -W -n "$ACT" | tr -d '\r')
total=$(echo "$out" | awk -F'TotalTime: ' '/TotalTime/{print $2+0}')
echo "offline cold open: TotalTime=${total}ms"
sleep 2
# the Plaza paints its text in Skia (invisible to uiautomator); the
    # RN a11y tree is the anchor — strip headers and card row labels
    ui_has_text "TODAY'S PLAN" || ui_has_text "November" || die "Plaza did not render offline"
ok "app opens and renders the Plaza offline"

$ADB shell am start -a android.intent.action.VIEW -d "$SCHEME_LINK" >/dev/null
sleep 3
assert_app_foreground
# wait for the day's BLOCKS (the deeplink is async and the first offline
# fetch cycle re-renders the screen when the cache answers) — the title
# alone can match the Plaza's nav bubble while the screen is still mounting
blocks=""
for _ in $(seq 1 20); do
  if ui_dump | grep -q "mark "; then blocks=yes; break; fi
  sleep 0.5
done
[ -n "$blocks" ] || die "routine blocks never rendered offline — is the plan cache warm?"
ok "routine day screen open offline, blocks tickable"

TAP_WALL_S=$(date +%s)
# the caption ("~ marks a recall — …") contains "mark" too and sits above
# the buttons — tap the NAMED block's done button, never a wildcard.
# (Its label is "mark <block> done"; a block already ticked — by the
# owner or an earlier leg run — has no button and the tap dies loudly.)
ui_tap_text "mark ${FIRST_BLOCK:-GRE}"
queued=""
for _ in $(seq 1 10); do
  if ui_dump | grep -q "queued"; then queued=yes; break; fi
  sleep 0.5
done
[ -n "$queued" ] || die "no 'queued' after the offline tick — the tick did not enqueue"
ok "routine tick queued at $(date -u -d @$TAP_WALL_S +%H:%M:%S) UTC ('queued' painted)"

# force-stop KILLS the app with the tick still queued — the queue must
# hold it in SQLite, not in any process memory.
$ADB shell am force-stop "$PKG"; sleep 1
ok "app force-stopped with the tick queued"

$ADB shell cmd connectivity airplane-mode disable >/dev/null
sleep 8
ok "airplane mode off — network restoring"

# relaunch: the foreground trigger must drain the tick through the real
# endpoint over the ts.net data plane.
wake_device
$ADB shell am start -W -n "$ACT" >/dev/null
sleep 2
assert_app_foreground
ok "app relaunched (foreground replay trigger)"
sleep 8   # drain window: tailscale re-handshake takes a beat

# ---- the database asserts ----------------------------------------------

DB_OUT=$(read_events "$SNAP")
COUNT=$(echo "$DB_OUT" | head -1)
[ "$COUNT" = "1" ] || die "expected exactly 1 device routine_done above snapshot $SNAP, got: $DB_OUT"
ROW=$(echo "$DB_OUT" | tail -1)
ok "scratch spine holds exactly one routine_done above the snapshot"

EVENT_TS=$(echo "$ROW" | python3 -c 'import json, sys; print(json.loads(sys.stdin.read())["ts"])')
EVENT_REF=$(echo "$ROW" | python3 -c 'import json, sys; print(json.loads(sys.stdin.read())["external_ref"])')
EVENT_METHOD=$(echo "$ROW" | python3 -c 'import json, sys; print(json.loads(sys.stdin.read())["method"])')
EVENT_SRC=$(echo "$ROW" | python3 -c 'import json, sys; print(json.loads(sys.stdin.read())["src"])')
EVENT_SID=$(echo "$ROW" | python3 -c 'import json, sys; print(json.loads(sys.stdin.read())["source_id"])')
EVENT_PAYLOAD=$(echo "$ROW" | python3 -c 'import json, sys; print(json.loads(sys.stdin.read())["payload"])')
[ "$EVENT_SRC" = "app" ] || die "tick not attached to the app source: $EVENT_SRC"
[ -n "$EVENT_SID" ] && [ "$EVENT_SID" != "None" ] || die "source_id is NULL — dedupe could never bite"

# external_ref is the ROUTINE contract: "{routine_key}:{plan day}" (07 §19)
echo "$EVENT_REF" | grep -q ":$TODAY$" || die "external_ref is not {routine_key}:{today}: $EVENT_REF (want suffix :$TODAY)"
ok "external_ref = $EVENT_REF (the spine's one-tick-per-block-per-day key)"

case "$EVENT_METHOD" in
  tap|recall) ok "method = $EVENT_METHOD (chosen at the source, 07 §18)" ;;
  *) die "method must be tap|recall, got: $EVENT_METHOD" ;;
esac

# ts == tap wall time, within tolerance — THE exit assertion (law 3: the
# tap time from the client clock survives the outage; retry never touches it)
TAP_EPOCH=$(date -u -d "${EVENT_TS%+00:00}" +%s 2>/dev/null)
[ -n "$TAP_EPOCH" ] || die "could not parse event ts: $EVENT_TS"
DELTA=$(( TAP_EPOCH - TAP_WALL_S ))
[ ${DELTA#-} -le "$TAP_TOL_S" ] || die "tick ts drifted from the tap: ts=$EVENT_TS tap_wall=$(date -u -d @$TAP_WALL_S +%Y-%m-%dT%H:%M:%S) delta=${DELTA}s"
ok "tick ts == tap time (delta ${DELTA}s, tol ${TAP_TOL_S}s): $EVENT_TS"

echo "payload: $EVENT_PAYLOAD"

# ---- replay dedupe on-device -------------------------------------------

# another foreground = another sync trigger; the queue must NOT double-post
$ADB shell am force-stop "$PKG"; sleep 1
$ADB shell am start -n "$ACT" >/dev/null
sleep 8
DB_OUT=$(read_events "$SNAP")
COUNT=$(echo "$DB_OUT" | head -1)
[ "$COUNT" = "1" ] || die "second foreground minted a second row: $DB_OUT"
ok "second foreground → still exactly one tick (on-device dedupe holds)"

echo
echo "=== T2.7 device leg: ALL GREEN ==="
echo "tick: $ROW"
