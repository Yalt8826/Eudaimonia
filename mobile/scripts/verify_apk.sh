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
#   scripts/verify_apk.sh devclient    # the dev-client APK installs and
#                                      # launches FROM THE LAUNCHER, then
#                                      # restores the ship APK
#
# DESTRUCTIVE leg: `devclient` uninstalls the app. The dev client is signed
# with the template debug cert and the ship APK with the release keystore, so
# Android refuses `install -r` across them (INSTALL_FAILED_UPDATE_INCOMPATIBLE)
# and the uninstall takes the outbox with it. Run it only when the outbox is
# empty — i.e. after `drain` has passed, not before.
set -u

PKG="com.yalt8826.eudaimonia"
ACT="$PKG/.MainActivity"
SCHEME_LINK="web+eudaimonia://wake"
WAKE_BUTTON_LABEL="I'M AWAKE"
ADB="${ADB:-$HOME/Android/Sdk/platform-tools/adb}"

die() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "PASS: $*"; }

# ---- device helpers -----------------------------------------------------

# Wake the screen and keep it awake while plugged in. A dozing phone
# renders nothing, so every leg that asserts "the Plaza rendered" fails
# with a verdict about the app when the truth is that the screen was off.
# Cost a real debugging detour at 1am (mWakefulness=Dozing, app perfectly
# healthy, leg reporting "Plaza did not render offline").
wake_device() {
  $ADB shell input keyevent KEYCODE_WAKEUP >/dev/null 2>&1 || true
  $ADB shell svc power stayon usb >/dev/null 2>&1 || true
  # swipe past a lock screen if one is up; harmless when it is not
  $ADB shell input swipe 540 1800 540 700 150 >/dev/null 2>&1 || true
  sleep 1
}

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
    wake_device
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
    wake_device
    $ADB shell am force-stop "$PKG"; sleep 1
    deeplink_gate || die "deeplink gate failed"
    $ADB exec-out screencap -p > renders/m5-wake-deeplink.png
    ok "deeplink: $SCHEME_LINK -> wake route, app foreground, no browser chrome (renders/m5-wake-deeplink.png)"
    ;;

  tripwire)
    wake_device
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
    wake_device
    # Restore the radio on ANY exit. Without this a die() between enable
    # and disable leaves the owner's phone in airplane mode — the script
    # would be reporting a failure while having caused a worse one.
    trap '$ADB shell cmd connectivity airplane-mode disable >/dev/null 2>&1' EXIT INT TERM
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
    wake_device
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
    # Reachability pre-check, from the PHONE, so a failure here is
    # attributed to the network rather than to the drain contract.
    #
    # It used to drive the phone's browser, and that was the whole
    # difficulty: Chrome cold-starts in ~40s on the A059, re-firing the
    # same URL only refocuses the loaded tab, and the check timed out
    # while the tailnet was up the entire time (`tailscale ping iris`
    # answered in 108ms). Android ships curl at /system/bin/curl — one
    # request, one answer, no UI in the loop.
    reached=""
    for i in $(seq 1 10); do
      code=$($ADB shell "curl -s -m 6 -o /dev/null -w '%{http_code}' '$BASE/ping?probe=$i'" 2>/dev/null | tr -d '\r')
      [ "$code" = "200" ] && { reached=1; break; }
      sleep 1
    done
    [ -n "$reached" ] || die "phone cannot reach $BASE — check Tailscale is up on the phone or set DRAIN_BASE"
    ok "phone reached the stand-in at $BASE"
    # test APK with the stand-in base baked at bundle time
    EXPO_PUBLIC_API_BASE="$BASE" sh scripts/build-apk.sh preview >/dev/null || die "test APK build failed"
    # The ship APK forbids cleartext HTTP (Android's default since API 28)
    # and talks https to the tailnet. This stand-in is http, so Android
    # dropped every POST SILENTLY — the outbox never drained and this leg
    # could not pass however long it waited. app.config.js enables
    # cleartext only when the baked base is http://, so assert the two
    # agree: a test build that lost the exemption fails here rather than
    # looking like a broken drain contract.
    # Assert on the SOURCE manifest prebuild just wrote and Gradle just
    # consumed — not on the APK. In the compiled binary manifest a
    # framework attribute like usesCleartextTraffic is a resource ID, not
    # a literal, so `strings | grep` can never find it however correctly
    # it is set. (Checked: it was set, the grep still failed.)
    GEN_MANIFEST="android/app/src/main/AndroidManifest.xml"
    case "$BASE" in
      http://*)
        grep -q 'android:usesCleartextTraffic="true"' "$GEN_MANIFEST" \
          || die "test build forbids cleartext but the stand-in is $BASE — the POSTs would be dropped silently"
        ok "test build permits cleartext for the http stand-in (ship builds do not)"
        ;;
    esac
    # Wake AGAIN: the Gradle build above takes minutes and the phone
    # dozes in the meantime, so the app would open against a dark screen
    # and drain nothing while the leg blamed the outbox.
    wake_device
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
    sleep 3 # let any straggler land before asserting
    # THE CONTRACT, stated as it actually is: every queued event ingests
    # EXACTLY ONCE, carrying its ORIGINAL tap time.
    #
    # This asserted "exactly 1 POST", which is a different claim and not
    # the contract — it assumes the outbox holds one event. A real outbox
    # holds whatever was queued while the server had no ingest route, and
    # this run drained four: three from today and one queued 11.5 hours
    # earlier that had already survived an app update. Four POSTs is the
    # contract working; one event posted twice is the contract broken, and
    # the old assertion could not tell those apart.
    INSTALLED_AT="$installed_at" python3 -c '
import json, os, sys
rows = [json.loads(l) for l in open("renders/m5-drain-log.jsonl") if l.strip()]
posts = [r for r in rows if r.get("method") == "POST" and r.get("url") == "/api/events/habit_tap"]
assert posts, "no habit_tap POST reached the stand-in"
installed_at = int(os.environ["INSTALLED_AT"])
seen = {}
for r in posts:
    b = r["body"]
    assert b["kind"] == "habit_tap", b
    ts = b["ts"]
    assert ts + 60000 < installed_at, "ts %d is not an original tap time (too close to the install)" % ts
    assert b["ingested_at"] >= installed_at - 5000, "ingested_at predates the drain session"
    assert b["ts"] < b["ingested_at"], "tap time must precede ingest time"
    seen.setdefault((b["idempotency_key"], ts), []).append(r["at"])
dupes = {k: v for k, v in seen.items() if len(v) > 1}
assert not dupes, f"event(s) sent more than once: {dupes}"
for (key, ts), at in seen.items():
    print(f"  ingested once: ts={ts} (original) key={key}")
print(f"drained {len(posts)} event(s), {len(seen)} distinct, none twice")
' || die "drain assertions failed"
    # restore the ship build (real ts.net base) — data survives again
    $ADB install -r "$APK_SHIP" >/dev/null || die "ship APK restore failed"
    ok "drain: every queued event ingested once with its original ts, across an app update; ship APK restored"
    ;;

  devclient)
    wake_device
    # The dev client is the development-profile artifact (Metro-backed, debug
    # cert). M5 measured its size and signature but left the launch-check
    # "pending phone" because proving it launches costs the release install:
    # different signing certs cannot replace each other in place.
    #
    # It is also why dist/ exists. The first dev-client APK was built,
    # measured, and then deleted by the next leg's `expo prebuild --clean`,
    # because only the ship APK had ever been copied out of android/ by hand.
    APK_DEV="dist/eudaimonia-devclient.apk"
    APK_SHIP="dist/eudaimonia-ship.apk"
    [ -f "$APK_DEV" ] || die "dev-client APK missing ($APK_DEV) — scripts/build-apk.sh development"
    [ -f "$APK_SHIP" ] || die "preserved ship APK missing ($APK_SHIP) — nothing to restore afterwards, refusing to uninstall"
    # Restore the ship build on ANY exit, including a die() midway. Leaving
    # the owner's phone with no app, or carrying a debug build aimed at a
    # Metro host that is not running, is a worse outcome than the failure
    # being reported. The leg clears the flag once it has restored the ship
    # itself, so the trap is a net rather than a duplicate.
    DEVCLIENT_RESTORED=""
    restore_ship_on_exit() {
      [ -n "$DEVCLIENT_RESTORED" ] && return 0
      echo "restoring the ship APK (leg did not finish cleanly)" >&2
      $ADB uninstall "$PKG" >/dev/null 2>&1 || true
      $ADB install -r "$APK_SHIP" >/dev/null 2>&1 \
        || echo "PHONE HAS NO APP: reinstall $APK_SHIP by hand" >&2
    }
    trap restore_ship_on_exit EXIT INT TERM
    $ADB uninstall "$PKG" >/dev/null 2>&1 || true
    $ADB install -r "$APK_DEV" >/dev/null || die "dev-client APK install failed"
    ok "dev-client APK installs ($(stat -c %s "$APK_DEV") bytes)"
    # A launcher icon has to EXIST before "launches from the launcher" can
    # mean anything: resolve the MAIN/LAUNCHER intent the way the launcher
    # does, and require it to land on our activity.
    resolved=$($ADB shell "cmd package resolve-activity -c android.intent.category.LAUNCHER -a android.intent.action.MAIN $PKG" | tr -d '\r')
    echo "$resolved" | grep -q "$PKG" || die "no launcher activity resolves for $PKG: $resolved"
    launch_act=$(echo "$resolved" | awk -F'name=' '/name=/{print $2; exit}')
    ok "launcher entry resolves to $launch_act"
    # `monkey -c LAUNCHER` fires exactly the intent an icon tap fires —
    # not `am start -n`, which can start an activity no launcher exposes.
    $ADB shell am force-stop "$PKG"; sleep 1
    wake_device
    $ADB shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 \
      || die "launcher intent did not start $PKG"
    sleep 6
    assert_app_foreground
    ok "dev client launches from the launcher and holds the foreground"
    # With no Metro host reachable the dev client shows its own development
    # screen rather than the Plaza; either is a pass for THIS leg, whose
    # claim is "it launches", not "it loaded a bundle". Print which, so the
    # record says what was actually on screen.
    if ui_has_text "October" || ui_has_text "Yashas"; then
      ok "dev client rendered the Plaza (a bundle was reachable)"
    else
      echo "note: dev client is on its development screen (no Metro host) — expected without \`npx expo start\`"
    fi
    $ADB uninstall "$PKG" >/dev/null 2>&1 || true
    $ADB install -r "$APK_SHIP" >/dev/null || die "ship APK restore failed — PHONE HAS NO APP, reinstall $APK_SHIP by hand"
    DEVCLIENT_RESTORED=1
    ok "devclient: launch-check done; ship APK restored (outbox reset by the uninstall, as documented)"
    ;;

  *)
    echo "usage: $0 coldstart|deeplink|tripwire|offline|drain|devclient" >&2
    exit 2
    ;;
esac
