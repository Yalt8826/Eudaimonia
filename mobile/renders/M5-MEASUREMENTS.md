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
  successful run.

## Exit tests (PHASE-M §M5 + carried-over T6.6/02 §6)

| test | result |
|---|---|
| the APK installs on a physical device | **PASS** — `adb install -r`: Success, 12.19s (streamed install, USB) |
| cold start to the Plaza ≤ 2s | **PASS** — three cold runs (`am force-stop` then `am start -W -n …/.MainActivity`): **369 / 254 / 373 ms, worst 373 ms** against the 2000 ms budget. Render proof: 4th cold run, Plaza header found in the a11y tree, frame saved to `renders/m5-plaza-cold.png` |
| `web+eudaimonia://wake` lands on the wake route | **PASS** — cold `am start -W -a VIEW -d web+eudaimonia://wake`: TotalTime **250 ms**, `topResumedActivity` = our package, a11y tree contains "I'M AWAKE" + "tap time" (frame: `renders/m5-wake-deeplink.png`) |
| THE WAKE SURFACE NEVER SHOWS BROWSER CHROME | **PASS, tripwire proven** — the gate asserts our activity is foreground (no chrome/chromium/webapk) and the wake markers are present; with the app `pm disable-user`d the gate **FAILS** (proof it can fire), after `pm enable` it passes again. 02 §6 carried from T6.6 |
| off-tailnet: the app opens and the wake tap QUEUES rather than failing | **PASS** — airplane mode on (verified `airplane_mode_on=1`): cold open TotalTime **221 ms**, Plaza renders, wake route opens offline, tap → "will sync" painted; airplane off → the event STAYS queued (the ingest route is still P2 T2.1 — the queue does not lie about a sync that never happened) |
| drain contract across an app update (T6.5 carried over) | scripted as `verify_apk.sh drain` (stand-in fixture `scripts/test_ingest_server.js`, test APK built with `EXPO_PUBLIC_API_BASE` override, `install -r` keeps the outbox) — **run pending: the phone left USB before this session's drain run** |
| dev client | built via `development` profile (dev launcher embedded) — **install check pending phone** |

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
