# M5 measurement — the APK, 2026-10-14

Device: owner's A059 (OnePlus AsteroidsIND, serial 001613557001717),
1080×2392, Android 16, USB adb. Host: athena (Arch, JDK 27 system /
Temurin 21 for Gradle), Android SDK at `~/Android/Sdk`. All numbers below
are printed by `scripts/verify_apk.sh` (T6.6 discipline: one flag per leg,
exit code = verdict) and transcribed here unedited.

## Build

| artifact | value |
|---|---|
| release APK | `android/app/build/outputs/apk/release/app-release.apk`, 158,278,214 bytes (4 ABIs; single-ABI is future tuning, not an M5 gate) |
| package / label | `com.yalt8826.eudaimonia` / "Eudaimonia", versionCode 1 |
| signature | own keystore `mobile/keystore/eudaimonia-release.keystore` (gitignored), cert SHA-256 `2a9c123ce7df36f21717b24c623a6391cdbe66147a5e79a5c200908bcc8147ca`, DN `CN=Eudaimonia, OU=Mobile, O=yalt8826.com` — verified with `apksigner verify --print-certs` |
| scheme intent filter | `aapt dump xmltree` shows `android:scheme="web+eudaimonia"` (plus expo's `exp+eudaimonia`) with BROWSABLE+DEFAULT in the launcher activity's filter |
| signing wiring | config plugin `plugins/withReleaseSigning.js` (CNG — no hand-edited gradle); no-ops when the keystore properties are absent; throws if the template anchor moves |
| profiles | `mobile/eas.json`: `development` (dev client), `preview` (signed APK — the M5 artifact), `production` (AAB). `scripts/build-apk.sh <profile>` mirrors the same prebuild+gradle task locally; `eas build --profile <p>` is the same path with an Expo login |

Build-environment findings, measured not assumed:

- Gradle 9.3.1 cannot run on the system JDK 27 — `Unsupported class file
  major version 71`. Fixed by pinning the build JVM to Temurin 21
  (`~/.jdks/jdk-21.0.12.1+1`; the build script auto-selects it).
- npm's allowScripts policy silently blocks `@shopify/react-native-skia`'s
  postinstall; the release build then fails in
  `configureCMakeRelWithDebInfo` with "Skia prebuilt binaries not found.
  Run `npx install-skia`". The build script now runs the package's own
  `scripts/install-libs.js` when `libs/android` is missing.
- One full-release build failed (10m36s, 803 tasks) with no error section
  captured, then passed unmodified on the next run — noted as a flaky
  first-pass, not diagnosed further; the shipped APK is from a clean
  successful run. The dev-client build (`assembleDebug`) ran clean end to
  end (18m58s, 546 tasks).

## Exit tests (PHASE-M §M5 + carried-over T6.6/02 §6)

| test | result |
|---|---|
| the APK installs on a physical device | **PASS** — `adb install -r`: Success, 12.19s (streamed install, USB) |
| cold start to the Plaza ≤ 2s | **PASS** — three cold runs (`am force-stop` then `am start -W -n …/.MainActivity`): **369 / 254 / 373 ms, worst 373 ms** against the 2000 ms budget. Render proof: 4th cold run, Plaza header found in the a11y tree, frame saved to `renders/m5-plaza-cold.png` |
| `web+eudaimonia://wake` lands on the wake route | **PASS** — cold `am start -W -a VIEW -d web+eudaimonia://wake`: TotalTime **250 ms**, `topResumedActivity` = our package, a11y tree contains "I'M AWAKE" + "tap time" (frame: `renders/m5-wake-deeplink.png`) |
| THE WAKE SURFACE NEVER SHOWS BROWSER CHROME | **PASS, tripwire proven** — the gate asserts our activity is foreground (no chrome/chromium/webapk) and the wake markers are present; with the app `pm disable-user`d the gate **FAILS** (proof it can fire), after `pm enable` it passes again. 02 §6 carried from T6.6 |
| off-tailnet: the app opens and the wake tap QUEUES rather than failing | **PASS** — airplane mode on (verified `airplane_mode_on=1`): cold open TotalTime **221 ms**, Plaza renders, wake route opens offline, tap → "will sync" painted; airplane off → the event STAYS queued (the ingest route is still P2 T2.1 — the queue does not lie about a sync that never happened) |
| drain contract across an app update (T6.5 carried over) | **PASS, run on the phone 2026-10-15** — `verify_apk.sh drain` (stand-in fixture `scripts/test_ingest_server.js`, test APK built with `EXPO_PUBLIC_API_BASE` override, `install -r` keeps the outbox). Tap queued offline at **01:00:06.379**, ingested at **01:08:56.994** — 8m50s and one `install -r` later, carrying its **original** ts; 1 POST, 1 distinct `(idempotency_key, ts)`, none twice. An earlier run in the same session drained **4** events the same way, one of them queued **11.5 hours** before and already through an app update |
| dev client | built via `development` profile: `app-debug.apk` 339,806,915 bytes, same package `com.yalt8826.eudaimonia`, scheme filter present, signed by the template debug cert (SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`) — **launcher launch-check still pending — now scripted, awaiting approval to run** |

Dev-client follow-up, 2026-10-15: the measured APK was **destroyed** between
sessions. `expo prebuild --clean` (run by the drain leg) deletes `android/`
wholesale, and only the ship APK had ever been copied out of it by hand — 19
minutes of build gone with nothing left for a reviewer to check. Fixed at the
source: `scripts/build-apk.sh` now preserves every profile's artifact to
`dist/` (`eudaimonia-devclient.apk` / `-ship.apk` / `-store.aab`), with a
guard that renames a stand-in point-build to `*-pointbuild.*` so it can never
take the ship artifact's filename — the drain leg restores the phone from that
exact path, and clobbering it would have left the owner's phone running a
cleartext build aimed at a laptop that is no longer listening.

Rebuilt 2026-10-15 in 7m11s (546 tasks; the 18m58s figure above was a cold
cache): `app-debug.apk` **339,806,915 bytes — byte-identical in size to the
original**, preserved at `dist/eudaimonia-devclient.apk`.

The launch-check itself is now `verify_apk.sh devclient`: install the dev
client, resolve the MAIN/LAUNCHER intent and require it to land on our
activity, fire it with `monkey -c android.intent.category.LAUNCHER` (the
intent an icon tap fires — unlike `am start -n`, which can start an activity
no launcher exposes), assert foreground, then restore the ship APK, with a
trap that restores it on any exit including a `die()` midway. It is marked
DESTRUCTIVE in the script header and not run automatically: the two APKs have
different signing certs (release keystore vs template debug), so Android
refuses `install -r` across them and the required uninstall takes the outbox
with it. Safe only after `drain` has passed, which it now has.

## The scheme registration (why a mapping exists)

expo-router 57 extracts a custom-scheme URL as host+path:
`web+eudaimonia://wake` → path `/wake`, which matches no screen. The
registration is three files that tests pin together
(`src/linking/wakeIntent.test.ts`): `app.json` declares the scheme,
`src/app/+native-intent.tsx` re-exports `redirectSystemPath`, and
`src/linking/wakeIntent.ts` rewrites ONLY the short link
(`web+eudaimonia://wake[/?query]` → `/habits/wake[?query]`). The long form
`web+eudaimonia://habits/wake` passes through — expo-router's default
extraction already yields `/habits/wake`. Both forms land on the one wake
route; 02 §6's "never a second wake surface" is enforced by construction.

## API base (measured topology change)

`mobile/src/data/api.ts` defaulted to `http://100.99.246.26:8000`. Measured
2026-10-14: uvicorn binds `127.0.0.1:8000` on olympus, so the tailnet
IP:8000 is **connection-refused for every device** (curl exit 7); the
phone-reachable data plane is tailscale serve —
`https://olympus.tail7270c7.ts.net/api/health` → 200 `{"status":"ok"}` the
same day. The default now bakes the ts.net origin (override:
`EXPO_PUBLIC_API_BASE` at bundle time); `api.test.ts` asserts the tailnet
https shape instead of the dead address.

## Pre-existing test flakiness (NOT an M5 regression)

`npx jest` on this box today: 148/151, with 3 failures in
`src/screens/wake.test.tsx` (1) and `src/navigation/routes.test.ts` (2) —
all 5-second test-timeouts in heavy renderRouter renders. Verified against
a clean `main` worktree: the same 3 fail there. With
`--testTimeout=30000` all 23 tests in those suites pass. Pure
timeout-flakiness on loaded machines; left untouched in M5, flagged for
whoever owns the M1/M4 test-infra.

## Infrastructure found during this phase (reported, not caused)

- The public origin was 502 at session start: cloudflared was running but
  BOTH backends on olympus were dead (uvicorn, serve_static.py — nohup
  processes from 2026-10-10). Restarted via the documented commands
  (`ops-deploy.sh`'s exact `setsid --fork` lines; `serve_static.py` had to
  be rsynced first — it only deploys on `--full`). Origin verified 200.
- `https://eudaimonia.yalt8826.com/.well-known/assetlinks.json` → **404**:
  it has never existed on the static plane (the P6 T6.2 step that would
  have created it was superseded before running). Fixing it requires
  editing `client/` (the file lives in `client/public/.well-known/`) plus
  a deploy — out of M5 scope by hard rule 2; it only becomes load-bearing
  for https app-links (M8), not for the custom scheme.

## Re-verification on the phone, 2026-10-15

All five legs re-run on the same A059 (`mWakefulness=Awake` asserted by the
harness this time — see below). Numbers from this session, unedited:

| leg | result |
|---|---|
| coldstart | **PASS** — worst of the run **325 ms** (budget 2000 ms) |
| deeplink | **PASS** — `web+eudaimonia://wake` cold, TotalTime **224 ms** |
| tripwire | **PASS** — gate fails with the app `pm disable-user`d, passes after `pm enable` |
| offline | **PASS** — offline cold open **209 ms**, Plaza renders, tap paints "will sync", event survives reconnect |
| drain | **PASS** — see the exit-test table above |

### Four harness defects found and fixed getting there

None of these were app defects; all four made the harness lie about the app.

1. **The release APK forbids cleartext, and the drain stand-in is http.**
   Android has blocked cleartext by default since API 28, so every drain
   POST was dropped **silently** — the leg could not pass however long it
   waited, and it read as a broken drain contract. `android.usesCleartextTraffic`
   in app config is accepted by Expo and then **never written to the
   manifest**, so the fix is a config plugin (`mobile/app.config.js`) that
   sets the attribute only when the baked `EXPO_PUBLIC_API_BASE` is
   `http://`. Verified both ways: ship build → attribute absent; drain
   build → `android:usesCleartextTraffic="true"`. Ship builds talk https
   to the tailnet and are unaffected.

2. **The cleartext assertion could never pass.** It grepped the compiled
   APK. In a binary manifest a framework attribute name is a resource ID,
   not a literal string, so `strings | grep usesCleartextTraffic` finds
   nothing however correctly it is set (checked: it was set, the grep still
   failed). Now asserted against the source manifest prebuild writes and
   Gradle consumes.

3. **The drain assertion stated the wrong contract.** It demanded
   "exactly 1 POST" and failed with *"expected exactly 1 habit_tap POST,
   saw 4"* — but all four were **distinct** events, each sent **once**.
   The contract is *every queued event ingests exactly once with its
   original ts*; the old assertion assumed the outbox holds one event and
   could not tell four events from one event sent four times. Rewritten to
   the real contract.

4. **The phone dozed during the build.** `wake_device` ran at the *start*
   of the drain leg, then the leg spent ~9 minutes in Gradle; by install
   time the device was `mWakefulness=Dozing`, the app opened against a dark
   screen and drained nothing. A second `wake_device` immediately before
   the install fixed it — same leg, same sequence, PASS. (The Chrome
   reachability pre-check was replaced in the same pass: Chrome cold-starts
   in ~40s on this device and re-firing the URL only refocuses the loaded
   tab, so the probe timed out while the tailnet was up the whole time.
   Android ships `curl` at `/system/bin/curl` — one request, one answer.)

### One weak assertion, noted not fixed

The offline leg's closing check — "event still queued after reconnect" —
greps the UI for "will sync". That string is driven by
`useState(false)` in `src/app/habits/wake.tsx` and is **never read back
from the outbox**, so it proves a tap was accepted, not that anything is
still queued; it would also pass if the outbox had silently cleared.
It is only sound because the app is not restarted between the tap and the
check. The claim that survives restart is the drain leg's, which reads the
server side. Left as-is for M5 (the honest claim is the one drain makes);
whoever builds the real ingest route in P2 T2.1 should make the wake
screen's status reflect outbox depth so this check means what it reads.

Corollary, carried forward from M4 and now observed rather than pinned:
the wake screen shows no entrance animation on a cold direct-link start —
confirmed in the deeplink leg (ScreenFade was removed in M4 after
measuring that the fade completed before first paint).
