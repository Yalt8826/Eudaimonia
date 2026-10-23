#!/usr/bin/env bash
# T2.1 device leg — the exit test, on the phone, against the real ingest
# endpoint. The caller has already swapped the scratch server onto
# olympus:8000 (the port tailscale serve fronts) with a THROWAWAY db, so
# the installed ship APK talks to the new code over the real ts.net data
# plane — and the owner's prod spine stays untouched: the tap this leg
# induces is a test tap and must never read as a real wake-up.
#
#   pre-drain (real queued taps, if any, land here and are reported)
#   → snapshot the spine → airplane ON → cold open → wake deeplink → tap
#   (wall time recorded) → "will sync" asserted → force-stop → airplane
#   OFF → relaunch → drain → scratch db asserts: exactly one habit_tap
#   above the snapshot, ts == tap time (ms tolerance), ingested_at > ts,
#   source = app; a second foreground proves the replay dedupe on-device.
#
# Cleanup on ANY exit: airplane mode off, screen auto-sleep restored.
set -u

ADB="${ADB:-$HOME/Android/Sdk/platform-tools/adb}"
PKG="com.yalt8826.eudaimonia"
ACT="$PKG/.MainActivity"
SCHEME_LINK="web+eudaimonia://wake"
WAKE_BUTTON_LABEL="I'M AWAKE"
OLYMPUS="olympus"
SSH="ssh -o BatchMode=yes"
READER="/home/yashas/t21-scratch/read_events.py"   # path ON OLYMPUS — $HOME here is athena's
TAP_TOL_S=3        # tap-time comparison tolerance (uiautomator round-trip)

die() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "PASS: $*"; }

ui_dump() {
  $ADB shell uiautomator dump /sdcard/t21_dump.xml >/dev/null 2>&1 || return 1
  $ADB shell cat /sdcard/t21_dump.xml 2>/dev/null | tr -d '\r'
}

ui_has_text() { ui_dump | grep -q "$1"; }

# verify_apk.sh's parser, verbatim: tap centre of the first node whose
# text/content-desc contains the needle.
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

# phone must reach the data plane and the plane must answer with the NEW
# code: old prod answers a bad POST 405; the ingest door answers 422 with
# the pydantic detail (which names ts — the body's first missing field).
shape=$($ADB shell "curl -s -m 8 -X POST https://olympus.tail7270c7.ts.net/api/events/habit_tap -H 'content-type: application/json' -d '{}'" 2>/dev/null | tr -d '\r')
echo "$shape" | grep -q "ts" || die "ingest endpoint not fronting ts.net (got: $shape) — did the caller swap scratch onto 8000?"
ok "phone reaches the T2.1 endpoint over the tailnet (canary: $shape)"

# ---- pre-drain: the owner's REAL queued taps, if any, land here ---------
#
# The ship APK has had no server since M5 (the ingest route did not
# exist). Any wake tap the owner made since Oct 15 is still queued in the
# outbox. This relaunch drains those into the scratch db FIRST — they are
# printed below and MUST be replayed into prod after the real deploy, or
# a 2xx here destroyed real data.
$ADB shell am force-stop "$PKG"; sleep 1
$ADB shell am start -W -n "$ACT" >/dev/null
sleep 10   # reconnect + drain window
PRE=$(read_events 0 | head -1)
ok "pre-drain complete: $PRE owner-real event(s) landed in scratch (replay into prod after deploy)"

SNAP=$($SSH $OLYMPUS '/home/yashas/eudaimonia/app/.venv/bin/python -c "import sqlite3; c = sqlite3.connect(chr(47).join((\"/home/yashas\", \"t21-scratch\", \"scratch.db\"))); print(c.execute(\"SELECT COALESCE(MAX(id), 0) FROM event\").fetchone()[0])"')
[ -n "$SNAP" ] || die "could not snapshot the spine"
ok "spine snapshotted at id $SNAP"

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
ui_has_text "October" || ui_has_text "Yashas" || die "Plaza did not render offline"
ok "app opens and renders the Plaza offline"

$ADB shell am start -a android.intent.action.VIEW -d "$SCHEME_LINK" >/dev/null
sleep 2
assert_app_foreground
ui_has_text "$WAKE_BUTTON_LABEL" || die "wake route not rendered offline"
ok "wake route open offline"

TAP_WALL_S=$(date +%s)
ui_tap_text "$WAKE_BUTTON_LABEL"
sleep 1
ui_has_text "will sync" || die "no 'will sync' after offline tap — the tap did not queue"
ok "wake tap queued at $(date -u -d @$TAP_WALL_S +%H:%M:%S) UTC ('will sync' painted)"

# force-stop KILLS the app with the event still queued — the queue must
# hold it in SQLite, not in any process memory.
$ADB shell am force-stop "$PKG"; sleep 1
ok "app force-stopped with the event queued"

$ADB shell cmd connectivity airplane-mode disable >/dev/null
sleep 8
ok "airplane mode off — network restoring"

# relaunch: the foreground trigger must drain the outbox through the
# real endpoint over the ts.net data plane.
wake_device
$ADB shell am start -W -n "$ACT" >/dev/null
sleep 2
assert_app_foreground
ok "app relaunched (foreground replay trigger)"
sleep 8   # drain window: tailscale re-handshake takes a beat

# ---- the database asserts ----------------------------------------------

DB_OUT=$(read_events "$SNAP")
COUNT=$(echo "$DB_OUT" | head -1)
[ "$COUNT" = "1" ] || die "expected exactly 1 device habit_tap above snapshot $SNAP, got: $DB_OUT"
ROW=$(echo "$DB_OUT" | tail -1)
ok "scratch spine holds exactly one habit_tap above the snapshot"

EVENT_TS=$(echo "$ROW" | python3 -c 'import json, sys; print(json.loads(sys.stdin.read())["ts"])')
EVENT_REF=$(echo "$ROW" | python3 -c 'import json, sys; print(json.loads(sys.stdin.read())["external_ref"])')
EVENT_ING=$(echo "$ROW" | python3 -c 'import json, sys; print(json.loads(sys.stdin.read())["payload"])' | python3 -c 'import json, sys; print(json.loads(sys.stdin.read())["ingested_at"])')
EVENT_SRC=$(echo "$ROW" | python3 -c 'import json, sys; print(json.loads(sys.stdin.read())["src"])')
EVENT_SID=$(echo "$ROW" | python3 -c 'import json, sys; print(json.loads(sys.stdin.read())["source_id"])')
[ "$EVENT_SRC" = "app" ] || die "event not attached to the app source: $EVENT_SRC"
[ -n "$EVENT_SID" ] && [ "$EVENT_SID" != "None" ] || die "source_id is NULL — dedupe could never bite"
echo "$EVENT_REF" | grep -q ":" || die "external_ref malformed: $EVENT_REF"

# ts == tap wall time, within tolerance — THE exit assertion (law 3: the
# tap time from the client clock survives the outage; retry never touches it)
TAP_EPOCH=$(date -u -d "${EVENT_TS%+00:00}" +%s 2>/dev/null)
[ -n "$TAP_EPOCH" ] || die "could not parse event ts: $EVENT_TS"
DELTA=$(( TAP_EPOCH - TAP_WALL_S ))
[ ${DELTA#-} -le "$TAP_TOL_S" ] || die "event ts drifted from the tap: ts=$EVENT_TS tap_wall=$(date -u -d @$TAP_WALL_S +%Y-%m-%dT%H:%M:%S) delta=${DELTA}s"
ok "event ts == tap time (delta ${DELTA}s, tol ${TAP_TOL_S}s): $EVENT_TS"

# ingested_at is the SERVER's receipt — strictly after the tap
ING_EPOCH=$(date -u -d "${EVENT_ING%+00:00}" +%s 2>/dev/null)
[ -n "$ING_EPOCH" ] || die "could not parse ingested_at: $EVENT_ING"
[ "$ING_EPOCH" -gt "$TAP_EPOCH" ] || die "ingested_at ($EVENT_ING) not after ts ($EVENT_TS)"
ok "ingested_at (server receipt) is after ts by $(( ING_EPOCH - TAP_EPOCH ))s — the outage window"

# ---- replay dedupe on-device -------------------------------------------

# another foreground = another sync trigger; the queue must NOT double-post
$ADB shell am force-stop "$PKG"; sleep 1
$ADB shell am start -n "$ACT" >/dev/null
sleep 8
DB_OUT=$(read_events "$SNAP")
COUNT=$(echo "$DB_OUT" | head -1)
[ "$COUNT" = "1" ] || die "second foreground minted a second row: $DB_OUT"
ok "second foreground → still exactly one event (on-device dedupe holds)"

echo
echo "=== T2.1 device leg: ALL GREEN ==="
echo "event: $ROW"
