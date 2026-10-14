#!/usr/bin/env bash
# M5 exit legs on the physical device (T6.6 discipline carried over): one
# script, one flag per leg, exit code = verdict, every number printed raw.
#
#   scripts/verify_apk.sh coldstart    # 3 cold runs to the Plaza, worst <=2s
#   scripts/verify_apk.sh deeplink     # web+eudaimonia://wake -> wake route,
#                                      # never a browser-chrome surface
#   scripts/verify_apk.sh tripwire     # proves the chrome gate FAILS when the
#                                      # app is disabled, passes when not
#   scripts/verify_apk.sh offline      # airplane on: app opens, wake tap
#                                      # queues ("will sync"), not fails;
#                                      # reconnect: stays honestly queued
#                                      # (the ingest route is still P2 T2.1)
#   scripts/verify_apk.sh drain        # the offline-tap event ingests with
#                                      # its ORIGINAL ts, exactly once, via
#                                      # the stand-in fixture, then restores
#                                      # the ship APK
set -u

PKG="com.yalt8826.eudaimonia"
ACT="$PKG/.MainActivity"
SCHEME_LINK="web+eudaimonia://wake"
WAKE_BUTTON_LABEL="I'M AWAKE"
ADB="${ADB:-$HOME/Android/Sdk/platform-tools/adb}"

die() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "PASS: $*"; }

# ---- device helpers -----------------------------------------------------

ui_dump() {
  $ADB shell uiautomator dump /sdcard/verify_dump.xml >/dev/null 2>&1
  $ADB shell cat /sdcard/verify_dump.xml | tr -d '\r'
}

ui_has_text() { # needle in text= or content-desc= attributes
  ui_dump | grep -q "$1"
}

ui_tap_text() { # tap centre of first node whose text/content-desc contains needle
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

foreground_line() {
  $ADB shell dumpsys activity activities 2>/dev/null | tr -d '\r' | grep -m1 "topResumedActivity"
}

assert_app_foreground() {
  local line; line=$(foreground_line)
  [ -n "$line" ] || die "no topResumedActivity line in dumpsys"
  echo "$line" | grep -q "$PKG" || die "foreground is not $PKG: $line"
  echo "$line" | grep -qiE "chrome|chromium|webapk" && die "browser/webapk in foreground: $line"
  return 0
}

# The wake-surface gate (02 §6, carried from T6.6): the scheme link lands on
# OUR activity, the wake route is rendered, and no browser surface exists.
# Silent variant used by the tripwire leg.
deeplink_gate() {
  local out total
  out=$($ADB shell am start -W -a android.intent.action.VIEW -d "$SCHEME_LINK" | tr -d '\r')
  echo "$out" | grep -q "Status: ok" || { echo "gate: am start did not resolve the intent"; return 1; }
  total=$(echo "$out" | awk -F'TotalTime: ' '/TotalTime/{print $2+0}')
  sleep 2 # let RN paint past first frame
  assert_app_foreground || { echo "gate: foreground check"; return 1; }
  ui_has_text "$WAKE_BUTTON_LABEL" || { echo "gate: wake button not in a11y tree"; return 1; }
  ui_has_text "tap time" || { echo "gate: tap-time line not in a11y tree"; return 1; }
  echo "deeplink TotalTime=${total}ms foreground=$PKG wake markers present, no browser surface"
  return 0
}

# ---- legs ---------------------------------------------------------------

case "${1:-}" in
  coldstart)
    worst=0
    for i in 1 2 3; do
      $ADB shell am force-stop "$PKG"
      sleep 1
      out=$($ADB shell am start -W -n "$ACT" | tr -d '\r')
      echo "$out" | grep -q "Status: ok" || die "activity did not launch (am start status not ok)"
      total=$(echo "$out" | awk -F'TotalTime: ' '/TotalTime/{print $2+0}')
      [ -n "$total" ] || die "no TotalTime in am start -W output"
      [ "$total" -gt 0 ] || die "TotalTime=0 — the launch did not really happen"
      echo "cold run $i: TotalTime=${total}ms"
      [ "$total" -gt "$worst" ] && worst=$total
    done
    echo "worst cold run: ${worst}ms (budget 2000ms)"
    [ "$worst" -le 2000 ] || die "worst cold start ${worst}ms exceeds the 2s budget"
    # render proof on a fourth cold run: Plaza header visible + frame saved
    $ADB shell am force-stop "$PKG"; sleep 1
    $ADB shell am start -W -n "$ACT" >/dev/null
    sleep 2
    ui_has_text "October" || ui_has_text "Yashas" || die "Plaza header not found after cold start"
    mkdir -p renders
    $ADB exec-out screencap -p > renders/m5-plaza-cold.png
    ok "coldstart: worst ${worst}ms of 3, Plaza rendered (renders/m5-plaza-cold.png)"
    ;;

  deeplink)
    $ADB shell am force-stop "$PKG"; sleep 1
    deeplink_gate || die "deeplink gate failed"
    $ADB exec-out screencap -p > renders/m5-wake-deeplink.png
    ok "deeplink: $SCHEME_LINK -> wake route, app foreground, no browser chrome (renders/m5-wake-deeplink.png)"
    ;;

  tripwire)
    $ADB shell pm disable-user --user 0 "$PKG" >/dev/null || die "pm disable-user refused"
    sleep 1
    if deeplink_gate >/dev/null 2>&1; then
      $ADB shell pm enable "$PKG" >/dev/null
      die "tripwire did NOT fire: the gate passed while the app was disabled"
    fi
    echo "tripwire fired: gate FAILED while the app was disabled (this is the proof it can fail)"
    $ADB shell pm enable "$PKG" >/dev/null || die "pm enable refused"
    sleep 2
    deeplink_gate || die "gate must pass again after re-enable"
    ok "tripwire: gate fails when app disabled, passes when enabled"
    ;;

  offline)
    $ADB shell cmd connectivity airplane-mode enable >/dev/null
    sleep 3
    [ "$($ADB shell settings get global airplane_mode_on | tr -d '\r')" = "1" ] || die "airplane mode did not engage"
    ok "airplane mode on"
    # the app OPENS offline
    $ADB shell am force-stop "$PKG"; sleep 1
    out=$($ADB shell am start -W -n "$ACT" | tr -d '\r')
    total=$(echo "$out" | awk -F'TotalTime: ' '/TotalTime/{print $2+0}')
    echo "offline cold open: TotalTime=${total}ms"
    sleep 2
    ui_has_text "October" || ui_has_text "Yashas" || die "Plaza did not render offline"
    ok "app opens and renders the Plaza offline"
    # the wake tap QUEUES rather than failing
    $ADB shell am start -a android.intent.action.VIEW -d "$SCHEME_LINK" >/dev/null
    sleep 2
    assert_app_foreground
    ui_has_text "$WAKE_BUTTON_LABEL" || die "wake route not rendered offline"
    ui_tap_text "$WAKE_BUTTON_LABEL"
    sleep 1
    ui_has_text "will sync" || die "no 'will sync' after offline tap — the tap did not queue"
    ok "offline wake tap queued ('will sync' painted)"
    # reconnect: the queue keeps the event until the server can take it
    # (the ingest route is P2 T2.1, still unbuilt — non-2xx must NOT clear it)
    $ADB shell cmd connectivity airplane-mode disable >/dev/null
    sleep 8
    ui_has_text "will sync" || die "queue cleared on reconnect with no ingest route — the queue lied"
    ok "reconnect: event still queued, honestly (server has no ingest route yet)"
    ;;

  drain)
    # The P2-exit drain contract, re-run against the APK context (T6.5
    # carried-over discipline): the event queued by the `offline` leg must
    # ingest with its ORIGINAL ts once a server accepts it — and exactly
    # once. Same keystore + install -r keeps the outbox across the update.
    BASE="${DRAIN_BASE:-http://100.82.96.116:8000}" # athena's tailscale address
    APK_SHIP="dist/eudaimonia-ship.apk"
    [ -f "$APK_SHIP" ] || die "preserved ship APK missing ($APK_SHIP)"
    rm -f renders/m5-drain-log.jsonl
    node scripts/test_ingest_server.js 8000 >/dev/null &
    STANDIN_PID=$!
    trap 'kill $STANDIN_PID 2>/dev/null' EXIT
    sleep 1
    # reachability pre-check, observed end-to-end: the phone's own browser
    # GET must land in the stand-in log before anything else counts
    $ADB shell am start -a android.intent.action.VIEW -d "$BASE/ping" >/dev/null
    for i in $(seq 1 10); do
      sleep 1
      grep -q '"/ping"' renders/m5-drain-log.jsonl 2>/dev/null && break
    done
    grep -q '"/ping"' renders/m5-drain-log.jsonl || die "phone cannot reach $BASE — open Tailscale on the phone or set DRAIN_BASE"
    ok "phone reached the stand-in at $BASE"
    # test APK with the stand-in base baked at bundle time
    EXPO_PUBLIC_API_BASE="$BASE" sh scripts/build-apk.sh preview >/dev/null || die "test APK build failed"
    $ADB install -r android/app/build/outputs/apk/release/app-release.apk >/dev/null || die "test APK install failed"
    installed_at=$(date +%s%3N)
    $ADB shell am force-stop "$PKG"; sleep 1
    $ADB shell am start -W -n "$ACT" >/dev/null
    drained=""
    for i in $(seq 1 30); do
      sleep 1
      drained=$(grep -c '"method":"POST"' renders/m5-drain-log.jsonl 2>/dev/null || true)
      [ "${drained:-0}" -ge 1 ] && break
    done
    [ "${drained:-0}" -ge 1 ] || die "no POST reached the stand-in within 30s of app open"
    sleep 3 # let any straggler land before asserting exactly-one
    n=$(grep -c '"method":"POST","url":"/api/events/habit_tap"' renders/m5-drain-log.jsonl || true)
    [ "$n" = "1" ] || die "expected exactly 1 habit_tap POST, saw $n"
    grep '"method":"POST","url":"/api/events/habit_tap"' renders/m5-drain-log.jsonl | INSTALLED_AT="$installed_at" python3 -c '
import json, sys, os
entry = json.loads(sys.stdin.readline())
body = entry["body"]
installed_at = int(os.environ["INSTALLED_AT"])
assert body["kind"] == "habit_tap", body
assert body["ts"] + 60000 < installed_at, "ts is not the original tap time (predates the install by <60s)"
assert body["ingested_at"] >= installed_at - 5000, "ingested_at predates the drain session"
print(f"drained exactly once: ts={body[\"ts\"]} (original), ingested_at={body[\"ingested_at\"]}, key={body[\"idempotency_key\"]}, payload={body[\"payload\"]}")
' || die "drain assertions failed"
    # restore the ship build (real ts.net base) — data survives again
    $ADB install -r "$APK_SHIP" >/dev/null || die "ship APK restore failed"
    ok "drain: original-ts event ingested exactly once across an app update; ship APK restored"
    ;;

  *)
    echo "usage: $0 coldstart|deeplink|tripwire|offline|drain" >&2
    exit 2
    ;;
esac
