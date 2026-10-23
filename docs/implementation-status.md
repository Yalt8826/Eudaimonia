# Eudaimonia — What's Implemented So Far

As of 2026-10-24

## Overview

The Expo mobile client is built through milestone M5 and verified on a physical phone, while the server is still a skeleton. M5 is merged: `main` holds M0–M5, pushed to origin on 2026-10-24.

Eudaimonia is a personal life-OS: one FastAPI + SQLite server on olympus, with thin clients. The data plane (`/api/*`) is tailnet-only with no auth. Agents run on the server through `hermes --profile`; the phone never schedules anything.

| Area | State | Evidence |
| --- | --- | --- |
| Plan and design docs (v1, docs 01–10) | Ratified | `docs/plan/v1/` |
| Phase and task docs | Written for P0–P6 and M | `docs/implementation/` |
| Server (`app/`) | Skeleton: health route, schema, agent chokepoint | pytest suite, CI |
| Web client (`client/`) | Built, frozen as the reference render | vitest suite, kept green until M8 |
| Mobile client (`mobile/`) | M0–M5 done | 151 jest tests, device runs on the owner's phone |
| Interactive widget, push, cutover (M6–M8) | Not started | none |

The laws that shape every component, from `02-architecture.md` §2 and §6:

- **Append-only spine.** Every state change is an event. Corrections are new events, never `UPDATE` or `DELETE`.
- **Freshness is not success.** A source counts as read only when its artifact passes a success predicate.
- **Coverage honesty.** A missing day is data, never a zero.
- **One agent primitive.** Every agent call goes through `agent_invoke`.
- **Hard-mode wake surface.** The wake tap needs no navigation, works offline, and queues with its original timestamp.
- **Single-writer statuses.** Each status enum has exactly one writer.

## Server (`app/`)

The server implements the foundation of P0 only: one route, the frozen schema, and the agent chokepoint. It has 539 lines across four modules plus the 224-line `001_initial.sql`, and 38 pytest tests — 37 run in CI, one hardware-gated behind `--real-hermes`. There are no adapters and no ingest route yet.

| Piece | What it does |
| --- | --- |
| `app/main.py` | `GET /api/health` returns `{"status":"ok"}`. Any other path serves the built web client from `client/dist`, falling back to `index.html` so deep links work. Unknown `/api/*` paths return JSON 404, and a missing build returns 503. |
| `app/db.py` | SQLite connection, forward-only migration runner, and `insert_event`, the one function that writes to the spine. |
| `migrations/001_initial.sql` | Schema v0.1 plus the v0.2 additive tables: `source`, `event`, `loop`, `question`, `reading_item`, `habit`, `document`, `provenance_edge`, `context_note`, `project`, `goal`, `assignment`, and the `coverage` view. |
| `app/coverage.py` | `derive_render_state` maps a coverage row to one of the five render states, so every strip reads freshness the same way. |
| `app/agent_invoke.py` | The only module allowed to spawn `hermes`. |

**The spine.** `event` carries `ts`, `kind`, `origin` (`source-read`, `app-write` or `agent-write`), `source_id`, `external_ref`, `actor` and a JSON payload. `UNIQUE(source_id, kind, external_ref)` is the single idempotency mechanism, so replaying the same tap cannot create a second row.

**The `coverage` view.** It counts distinct content-dated days in the trailing 7 where a source-read event carries `ok = 1`. It also reports the all-time artifact count and whether a human-authored `job_paused` event exists. It returns counts, never per-day rows, so a missing day is data and not a zero.

**`agent_invoke`.** It runs `hermes --profile <name> -z <prompt>`, with a `$HERMES_HOME/bin/hermes` fallback for shells that lack the PATH. The chokepoint enforces the timeout itself and takes a per-profile lock. Every call writes an `agent_invoke_started` event and exactly one terminal `agent_invoke_result` event with outcome `ok`, `timeout`, `error` or `predicate_failed`, so silence cannot pass for success. A real call to the `clio` profile was recorded on olympus on 2026-10-10 and took about 27 seconds.

## Web client (`client/`)

The React/Vite PWA is feature-frozen and kept deployable as the reference render for the Expo port. It has 3 screens with real content (the Plaza, wake, settings) and 17 stubs — 20 routes in all; the migration plan's "5 screens with real content" overcounted, and the route table is authoritative (corrected here 2026-10-24). It stays green until M8, so rollback during the migration is "deploy `client/` as before".

- **Stack.** React 19, react-router 7, Vite, vitest, pnpm. Node is pinned by `.nvmrc`.
- **Screens with content.** The Plaza (five torn-paper sheets, greeting header, nav cluster), the wake screen and settings.
- **Offline contract.** `src/sw/` holds the service worker, the precache list and `queue.ts`. The queue sets `ts` at tap time, `ingested_at` at replay time, and a device-UUID idempotency key. `queue.ts` is what the mobile outbox was ported from.
- **Torn-paper surface.** `TornSheet`, `TornPaperSection`, the tear SVGs and the paper texture, with measured contrast ratios carried in `theme.css`.
- **Frozen copy.** `preserved/torn-paper-web/` holds the surface as of commit `c0740e8`, including its README of hard-won rules. Delete it only after M8 sign-off.

## Mobile app (`mobile/`)

The Expo client renders the full Plaza, a gesture-driven nav, and a wake screen whose taps survive airplane mode, force-stop and an app update. It runs Expo SDK 57, React Native 0.86, React 19.2, Skia 2.6, Reanimated 4.5 and expo-router 57, with 151 jest tests. The server is untouched, per the phase rule.

| Milestone | What was built | Exit evidence |
| --- | --- | --- |
| M0 | Skia spike of one mint torn-paper sheet: tear mask, fibre texture, fringe | 5 of 7 acceptance rows passed at 390px / 3× DPR on Android |
| M1 | expo-router shell with 20 routes as stubs, `theme.css` ported to typed tokens, contrast suite ported | 63 of 63 jest, route count 20 = 20 against the web test, all routes deep-linked on device |
| M2 | The Plaza: five Skia sheets on three hand-authored contours, gradient greeting header, static bubble cluster | Renders at 320 and 430 measured against the preserved references on the owner's phone |
| M3 | API client, offline outbox on expo-sqlite, wake round-trip | Queue semantics ported verbatim from `client/src/sw/queue.ts` |
| M4 | The nav as a real radial gesture, with motion tokens | Gesture works on device; the screen transition was removed after measuring it invisible |
| M5 | APK pipeline and device verification | See the next section |

**Surface and theme.** `MintSheet` and `TornSheet` paint the torn paper in Skia. The three contours are the hand-authored tables from `author_tears.py`, shipped as SVG and as `tearContours.ts`, with `tear-metrics.json` driving text padding. `src/theme/tokens.ts` is the only place accent and state hexes may live, and `contrast.test.ts` recomputes every ratio. Fonts are IBM Plex Sans and Mono.

**Plaza.** `plaza/model.ts` defines the five strips (mint, sky, blush, butter, lavender). Until the P1 adapters exist, each strip renders its true state: uninstrumented, with an honest coverage line and no fabricated counts. `greeting.ts` and the model were ported unchanged from the web client.

**Navigation.** `radialModel.ts` is a pure, clock-injected state machine: a hold of about 150ms or a drag past about 10px fans out the bubbles, and selection is by angle past a dead zone. Release on a spoke navigates, and release on nothing folds back. `BubbleCluster.tsx` performs the actions, and a quick tap still goes to `/capture`. `theme/motion.ts` pins every threshold, and `motion.test.ts` scans the source so motion never encodes data. The wake screen sits outside the shell with no entrance animation.

**Offline outbox (M3).** The three hard-mode fields are fixed by `queue.ts`:

- `ts` is the tap time, captured at enqueue.
- `ingested_at` is the retry time, set only at replay.
- `idempotency_key` is a device UUID that rides every event.

Replay runs in enqueue order and stops at the first failed POST. Storage is a SQLite file that also holds the device UUID. Replay triggers are reconnect, next foreground, and an immediate sync after each enqueue and at install, all funnelled through one serialized scheduler so triggers cannot double-POST. The API base defaults to `https://olympus.tail7270c7.ts.net`, because uvicorn binds only to localhost on olympus. The ingest endpoint `/api/events/habit_tap` still returns 404 until P2.

**Wake screen.** A full-bleed teal screen with one "I'M AWAKE" target and a "~recall instead" option. Offline, taps queue silently and the screen never blocks. The label is drawn in Skia because Fabric measured it with fallback metrics on a cold direct-link start.

## APK pipeline and device verification (M5)

A signed release APK installs and cold-starts in at most 373 ms on the owner's phone, against a 2000 ms budget. The phone is an A059 (OnePlus), 1080×2392, running Android 16, driven over USB adb from athena. The numbers below are from `mobile/renders/M5-MEASUREMENTS.md`.

**Build.** Package `com.yalt8826.eudaimonia`, versionCode 1. `eas.json` defines `development` (dev client), `preview` (signed APK, the M5 artifact) and `production` (AAB). `scripts/build-apk.sh <profile>` runs the same prebuild and Gradle path locally and copies each artifact to `dist/`. Signing uses an own keystore, wired in by the config plugin `withReleaseSigning.js` rather than hand-edited Gradle. The release APK is 158,278,214 bytes across 4 ABIs, and the dev-client APK is 339,806,915 bytes.

| Exit test | Result |
| --- | --- |
| APK installs on a physical device | Pass, 12.19 s |
| Cold start to the Plaza within 2 s | Pass, worst 373 ms over three runs (re-run: 325 ms) |
| `web+eudaimonia://wake` lands on the wake route | Pass, 250 ms cold (re-run: 224 ms) |
| Wake surface never shows browser chrome | Pass, and the tripwire was proven to fire when the app is disabled |
| Offline: app opens and the wake tap queues | Pass, 221 ms cold open in airplane mode |
| Drain survives an app update | Pass: a tap queued at 01:00:06 ingested at 01:08:56 after an `install -r`, once, with its original `ts` |
| Dev-client launcher check | Pending: scripted, but it uninstalls the app and needs your approval |

**Deep link.** expo-router reads `web+eudaimonia://wake` as the path `/wake`, which matches no screen. `app.json`, `+native-intent.tsx` and `wakeIntent.ts` rewrite that short link to `/habits/wake`, and `wakeIntent.test.ts` pins the three together. There is exactly one wake route.

**Harness fixes.** `scripts/verify_apk.sh` has one leg per flag and its exit code is the verdict. Four defects made it misreport the app, and none were app bugs:

- Android silently dropped cleartext POSTs from the release build. `app.config.js` now enables cleartext only when the baked API base is `http://`.
- The cleartext check grepped a compiled binary manifest, where the attribute is a resource ID, so it could never pass. It now reads the source manifest.
- The drain assertion demanded one POST when the contract is that every queued event ingests exactly once.
- The phone dozed during the 9-minute Gradle build. The harness now wakes the device immediately before install.

Build artifacts were once destroyed by `expo prebuild --clean`, so every profile's output is now preserved to `dist/`.

## Tooling, CI and lints

CI runs four jobs on every pull request and on pushes to `main`. Only the server and web client are covered, and the mobile app has no CI job yet.

| Job | Runs |
| --- | --- |
| `app` | `uv sync --locked`, ruff, mypy (strict), pytest on Python 3.13 |
| `client` | pnpm install, eslint, `tsc --noEmit`, vitest |
| `greps` | The three lints from `EXECUTION.md` §4, via `scripts/lint_greps.sh` |
| `lint-selfcheck` | Each lint must fail on its fixture and pass on the clean tree |

The three grep lints:

- **Blur budget.** At most one `backdrop-filter` per screen route.
- **Accent hexes.** Accent and state hex values may appear only in `client/src/theme.css` and `mobile/src/theme/tokens.ts`.
- **Chokepoint.** No `subprocess`, `Popen` or `hermes` outside `agent_invoke.py`.

A fixture that violates each rule proves the regex still fires. Mobile checks are run by hand: `npx jest`, `npx tsc --noEmit` and `npx expo lint`.

Other conventions: tasks use a commit pair (a baseline commit, then the closing commit), `core.fileMode` is false because of the fuseblk mount, pushes go over HTTPS through athena's gh credential helper, and history is never rewritten.

## Known gaps and what is next

The biggest gap is that no tap reaches a server: the ingest route does not exist, so queued events wait on the phone until P2 T2.1 ships.

| Gap | Detail |
| --- | --- |
| Server ingest and adapters | `POST /api/events/habit_tap` returns 404. P1 adapters, the Plaza read model and the `coverage` consumers are unbuilt. Phase M forbids editing `app/`, so this is P-phase work. |
| Dev-client launch check | Scripted as `verify_apk.sh devclient`, not yet run. It uninstalls the ship APK and the outbox with it, so it needs approval. |
| Weak offline assertion | The "still queued" check greps for "will sync", which is never read back from the outbox. Only the drain leg proves persistence. The wake screen's status should reflect outbox depth when P2 T2.1 lands. |
| Flaky tests | 3 of 151 jest tests time out at the default 5 s on a loaded machine and pass at 30 s. The same 3 failed on pre-merge `main` (not an M5 regression); the merged tree ran 151/151 green on 2026-10-24. |
| Keystore off-box backup | The release signing key has no off-box copy — the P6 T6.2 custody step (vault + one off-box copy, rehearsed restore) was superseded and never done. Losing the key means the installed base can never be updated in place. See `mobile/keystore/README.md`. |
| `assetlinks.json` | Returns 404 on the public origin. It matters only for https app-links in M8. |
| Mobile CI | No CI job runs the mobile tests, lint or typecheck. |
| Notification policy | Push (M7) is blocked until the spec gap in `10-stack-migration.md` §7 is written. |

**Next steps.**

1. ~~Merge `M5-apk` into `main`~~ — done 2026-10-24, pushed, CI running on the merged tree.
2. Start P2 T2.1, the ingest route. It is the critical path: M6's widget writes through the server spine, the phone has held queued taps since M3, and the weak offline assertion stays weak until the wake screen can read outbox depth. The M7 notification spec (`10-stack-migration.md` §7) is dependency-free writing that can slot into any gap.
3. Run the dev-client launch check (`verify_apk.sh devclient`) to close M5. It uninstalls the ship APK and the outbox with it, so it needs the owner and the phone — safe to run now that `drain` has passed, and it gates nothing downstream.
4. Off-box backup of the release keystore — cheap, and the one irrecoverable loss on this list.

M8 then retires or demotes the web client. Descope order, if time runs short, is M7, then M6, then M4. M0 and M3 are never cut.
