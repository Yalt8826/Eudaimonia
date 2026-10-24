# Eudaimonia — What's Implemented So Far

As of 2026-10-24

## Overview

The Expo mobile client is built through milestone M5 and verified on a physical phone, while the server is still a skeleton. M5 is merged: `main` holds M0–M5, pushed to origin on 2026-10-24.

Eudaimonia is a personal life-OS: one FastAPI + SQLite server on olympus, with thin clients. The data plane (`/api/*`) is tailnet-only with no auth. Agents run on the server through `hermes --profile`; the phone never schedules anything.

| Area | State | Evidence |
| --- | --- | --- |
| Plan and design docs (v1, docs 01–10) | Ratified | `docs/plan/v1/` |
| Phase and task docs | Written for P0–P6 and M | `docs/implementation/` |
| Server (`app/`) | P0 foundation + the T2.1 ingest door | pytest suite (56+1), CI; T2.1 device leg green |
| Web client (`client/`) | Built, frozen as the reference render | vitest suite (128), kept green until M8 |
| Mobile client (`mobile/`) | M0–M5 done; taps now reach the server | 155 jest tests; T2.1 round-trip measured on the phone |
| Interactive widget, push, cutover (M6–M8) | Not started | none |

The laws that shape every component, from `02-architecture.md` §2 and §6:

- **Append-only spine.** Every state change is an event. Corrections are new events, never `UPDATE` or `DELETE`.
- **Freshness is not success.** A source counts as read only when its artifact passes a success predicate.
- **Coverage honesty.** A missing day is data, never a zero.
- **One agent primitive.** Every agent call goes through `agent_invoke`.
- **Hard-mode wake surface.** The wake tap needs no navigation, works offline, and queues with its original timestamp.
- **Single-writer statuses.** Each status enum has exactly one writer.

## Server (`app/`)

The server implements the foundation of P0 plus the first P2 task: the health route, the frozen schema, the agent chokepoint, and — since 2026-10-24 — the app-write ingest door. It has about 780 lines across five modules plus the 224-line `001_initial.sql`, and 57 pytest tests (56 run in CI, one hardware-gated behind `--real-hermes`). The P1 adapters and the Plaza read model are still unbuilt.

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

**The ingest door (`app/app/ingest.py`, T2.1).** `POST /api/events/{kind}` is the one server door clients write through; the wire shape is the phone outbox's `ReplayBody`. The laws it enforces: idempotency is the spine's `UNIQUE(source_id, kind, external_ref)` with `external_ref` built from the device UUID **and** `ts` (the key alone is constant per install — deduping on it would make a device's first tap its last stored event); `source_id` is never NULL (SQLite treats NULLs as distinct — the constraint cannot dedupe them), every client write attaches the one behavioral `app` source row; `event.ts` is the client's tap time to the millisecond while `ingested_at` is stamped by the server at receipt and rides the payload; contract violations are 4xx (the outbox's poison path), a replay is 200 `duplicate:true` — never a second row. Kinds are registered one task at a time (`habit_tap` today, routine ticks at T2.7); an unregistered kind is a loud 422, never a silent spine row. Verified end-to-end on the phone — airplane tap → force-stop → relaunch → exactly one event, `ts` the tap moment, receipt 17 s later: `mobile/renders/T2.1-MEASUREMENTS.md`.

## Web client (`client/`)

The React/Vite PWA is feature-frozen and kept deployable as the reference render for the Expo port. It has 3 screens with real content (the Plaza, wake, settings) and 17 stubs — 20 routes in all; the migration plan's "5 screens with real content" overcounted, and the route table is authoritative (corrected here 2026-10-24). It stays green until M8, so rollback during the migration is "deploy `client/` as before".

- **Stack.** React 19, react-router 7, Vite, vitest, pnpm. Node is pinned by `.nvmrc`.
- **Screens with content.** The Plaza (five torn-paper sheets, greeting header, nav cluster), the wake screen and settings.
- **Offline contract.** `src/sw/` holds the service worker, the precache list and `queue.ts`. The queue sets `ts` at tap time, `ingested_at` at replay time, and a device-UUID idempotency key. `queue.ts` is what the mobile outbox was ported from.
- **Torn-paper surface.** `TornSheet`, `TornPaperSection`, the tear SVGs and the paper texture, with measured contrast ratios carried in `theme.css`.
- **Frozen copy.** `preserved/torn-paper-web/` holds the surface as of commit `c0740e8`, including its README of hard-won rules. Delete it only after M8 sign-off.

## Mobile app (`mobile/`)

The Expo client renders the full Plaza, a gesture-driven nav, and a wake screen whose taps survive airplane mode, force-stop and an app update. It runs Expo SDK 57, React Native 0.86, React 19.2, Skia 2.6, Reanimated 4.5 and expo-router 57, with 155 jest tests. The server is untouched, per the phase rule.

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

Replay runs in enqueue order and stops at the first failed POST. Storage is a SQLite file that also holds the device UUID. Replay triggers are reconnect, next foreground, and an immediate sync after each enqueue and at install, all funnelled through one serialized scheduler so triggers cannot double-POST. The API base defaults to `https://olympus.tail7270c7.ts.net`, because uvicorn binds only to localhost on olympus. The ingest endpoint went live on 2026-10-24 (T2.1) — a wake tap now completes the round-trip: `mobile/renders/T2.1-MEASUREMENTS.md`.

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

The ingest door exists and is live; the next server gap is the P1 adapters and the Plaza read model — the phone posts real events, but nothing reads them yet.

| Gap | Detail |
| --- | --- |
| P1 adapters and read model | The WAKE row reads the spine since 2026-10-24 (`/api/habits/wake/stats` — days-of-7, last tap with age_minutes); every other strip is still static-uninstrumented, and nothing consumes the `coverage` view yet. Phase P1 work. |
| ~~Wake status vs outbox depth~~ ~~Weak offline assertion~~ | **Closed 2026-10-24**: the wake surface reads real outbox depth (`registered` at 0, `queued · will sync` above it) and is one-shot — a double-tap can no longer mint a second event (the 4-event morning). Ships in the next APK; the device legs' grep for "will sync" stays valid until then. |
| Poison-entry UX | A 4xx marks nothing on the phone yet — the outbox keeps the event queued and silent. T2.1's queue spec wants `failed` + a visible plaza line. |
| ~~Flaky mobile tests~~ | **Closed 2026-10-24**: jest `testTimeout` raised to 30 s (the 3 heavy-render suites measured 8-14 s locally; the 5 s default first bit on CI's loaded runner). 166/166 green locally and in CI. |
| Dev-client launch check | Scripted as `verify_apk.sh devclient`, not yet run. It uninstalls the ship APK and the outbox with it, so it needs approval. |
| ~~Weak offline assertion~~ | Closed with the wake-status row above (the claim now reads outbox depth). |
| `assetlinks.json` | Returns 404 on the public origin. It matters only for https app-links in M8. |
| Mobile CI | No CI job runs the mobile tests, lint or typecheck. |
| Notification policy | Push (M7) is blocked until the spec gap in `10-stack-migration.md` §7 is written. |
| Keystore custody (partial) | Off-box copy exists on olympus's vault since 2026-10-24 (`/srv/data/vaults/main/.eudaimonia-keystore-backup/`, mode 600, sha256-verified at copy time). Still owed: one copy on a third site + a rehearsed restore drill (P6 T6.2). |

**Next steps.**

1. ~~T2.1 ingest route~~ — done 2026-10-24: shipped, deployed to olympus, and proven on the phone end to end.
2. Pick the next P-phase slice: T2.2 (waiting-on inbox + resolutions) or T2.7 (routine ticks — proves the queue is consumer-agnostic) ride the door that just opened; P1 adapters unblock the Plaza reading real data and are M6's other half.
3. M6 (interactive widget) is now unblocked — its write path exists.
4. Cheap, real-world: the owner's next real wake tap becomes event id 1 in the prod spine. M7's notification spec (`10-stack-migration.md` §7) is dependency-free writing for any gap.
5. The keystore off-box backup is ten minutes and removes the worst tail risk.

M8 then retires or demotes the web client. Descope order, if time runs short, is M7, then M6, then M4. M0 and M3 are never cut.
