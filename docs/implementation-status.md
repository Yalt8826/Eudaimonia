# Eudaimonia — What's Implemented So Far

As of 2026-11-19 (rewritten from the 2026-10-24 edition after P2 closed)

## Overview

The app is a write surface now. P0 (foundation), P1 (adapters + Plaza read
model) and **P2 (writes) are complete** — wake, inbox, capture+triage,
questions, notes, tasks, routine ticks and meals all land on the spine —
while the Expo client has moved well past M5: the Plaza reads live data,
task pages and routine ticks work local-first, and the phone has survived
two force-stop legs on device. The server is supervised by systemd user
units; both wellness profiles run on DeepSeek after the GLM balance death.

Eudaimonia is a personal life-OS: one FastAPI + SQLite server on olympus,
with thin clients. The data plane (`/api/*`) is tailnet-only with no auth.
Agents run on the server through `hermes --profile`; the phone never
schedules anything.

| Area | State | Evidence |
| --- | --- | --- |
| Plan and design docs (v1, docs 01–10) | Ratified | `docs/plan/v1/` |
| Phase and task docs | P0–P2 written and executed; P3–P6 written | `docs/implementation/` |
| Server (`app/`) | P0 + P1 + P2 complete | pytest 148 (+2 hardware-gated real-hermes legs), CI green |
| Web client (`client/`) | Feature-frozen reference render | vitest suite, kept green until M8 |
| Mobile client (`mobile/`) | M0–M5 + P2 write surfaces; 242 jest tests | device legs: T2.1, T2.7, meals/capture live legs |
| Interactive widget, push, cutover (M6–M8) | Not started | M7 gated on the §7 notification spec |
| Ops (olympus) | Supervised | `eudaimonia-uvicorn.service`, `eudaimonia-static.service` |

The laws that shape every component, from `02-architecture.md` §2 and §6:

- **Append-only spine.** Every state change is an event. Corrections are
  new events, never `UPDATE` or `DELETE`.
- **Freshness is not success.** A source counts as read only when its
  artifact passes a success predicate.
- **Coverage honesty.** A missing day is data, never a zero; a stale
  plan renders "coverage unavailable offline", not a fabricated 0 of 7.
- **One agent primitive.** Every agent call goes through `agent_invoke`.
- **Hard-mode wake surface.** The wake tap — and now every write — needs
  no navigation, works offline, and queues with its original timestamp.
- **Single-writer statuses.** Each status enum has exactly one writer.

## Server (`app/`)

About 2,300 lines across thirteen modules plus the migrations. Every
client write lands through one door; every agent call through one
chokepoint; the spine's `UNIQUE(source_id, kind, external_ref)` is the
only idempotency mechanism anywhere.

| Module | What it does |
| --- | --- |
| `main.py` | Health; the ingest door; wake stats; capture doors; notes; questions; loops; tasks; plan/today; routine day; meals/recent; ingest/run; coverage. Serves `client/dist` at `/`. |
| `db.py` | SQLite connection, forward-only migration runner, `insert_event` — the one spine writer. |
| `migrations/001_initial.sql` | Schema v0.1 + v0.2 additive tables + the `coverage` view. |
| `ingest.py` | `POST /api/events/{kind}` — the client write door. Kind registry (habit_tap, capture_raw, loop resolutions, task kinds, routine ticks); `ts` = tap time; idempotency via the spine. |
| `adapters.py` | P1: chain-following adapters (day-report, week-plan, tasklist; kanban descoped), content-dated or refusal, dedupe by constraint. Week-plan lines carry `plan_keys` — T1.3's stable routine slugs (07 §19). |
| `coverage.py` | `derive_render_state`: one freshness definition for every strip. |
| `agent_invoke.py` | The only spawn site (grep-enforced). Per-profile lock, enforced timeout, start + terminal events with `duration_ms`. |
| `capture.py` | T2.3 + T2.6: the capture doors, clio classification, **meal estimation via Hygeia**, per-attempt append-only triage events, provenance edges, `recent_meals`. |
| `routines.py` | T2.7: `routine_done`/`routine_skip` validation and the day read model. No routine table — the spine is the storage. |
| `tasks.py` | Task kinds (item add/check/remove, session start/end, logs) — app-write and agent-write. |
| `questions.py` | T2.5: open queue, ask dispatch, answered-by-predicate with revert-on-failure. |
| `loops.py` | T2.2: waiting-on rows, resolutions (done/rolled/dropped), cache updated from drained events. |
| `wake.py` | The wake strip's numbers. |
| `staged_writebacks.py` | T2.4: the repo's ONLY vault writer — notes staged then appended to the daily note. |

### The write paths (P2, closed)

| path | door | landing |
| --- | --- | --- |
| Wake tap | offline queue → ingest door | `habit_tap` (method tap/recall) |
| Waiting-on | loops screen | `loop_done` / `loop_rolled` / `loop_dropped` (`{loop_id}:{day}` refs) |
| Capture | sheet (offline queue) or `/capture` (fuzzel, PWA) | `capture_raw` → clio triage → domain landing |
| Task threads | tasks screen (own queue, local-first) | `task_item_*`, `task_session_*`, `task_log_added` |
| Notes | questions→notes→vault | `note_added` → staged write-back |
| Questions | questions screen | ask → `question_picked_up`/`question_answered`, revert on failure |
| **Routine ticks** | plan card, plan sheet, `/routine` (offline-capable) | `routine_done` (method tap/recall) / `routine_skip` — `{routine_key}:{date}` refs, one per block per day |
| **Meals** | capture sheet prefilled `#meal` | clio noun "meal" or the tag → Hygeia estimation → `meal_logged` with per-item `food_db:` bases |

**T2.3/T2.6 exit evidence** (`docs/implementation/T2.3-MEASUREMENTS.md`):
fuzzel capture → triaged measured twice. The 2026-10-25 leg ran 13 real
captures (median 198 s) against the then-degraded upstream; the
2026-11-19 burst ran 10 real captures on the repaired provider — **every
target noun exercised live (task, question, loop, note, meal), worst case
21.3 s, budget 300 s**. The failure clause was also verified against
reality: a real provider outage met the 180 s chokepoint cap exactly and
landed `capture_triaged_failure` with nothing else.

**T2.6's predicate is the estimates law**: strict JSON, every item needs
a `food_db:` basis; a basis-less estimate rejects the whole response into
`capture_triaged_failure` — enforced at the chokepoint, live (hygeia
estimated 3 items in 13 s, every basis a USDA ref). `~` is applied at
render by `est()`; the screen's gate test strips every `est()` span and
fails if any estimate field is left bare.

### The infra outage ledger (found by the legs, fixed)

| outage | window | fix |
| --- | --- | --- |
| uvicorn (prod API) down | Nov 6 20:45 → Nov 18 23:59 | restarted on the T2.6 build; **now `eudaimonia-uvicorn.service`** (Restart=always, proven by kill -9 revival) |
| static plane (port 8090) down | same window | **now `eudaimonia-static.service`** (revival proven) |
| clio dead: GLM balance (429 code 1113) | ~Nov (found Nov 19) | clio default model → `ds/deepseek-chat` (same 9Router/key; old config backed up `config.yaml.bak-20261119`) |
| hygeia same balance death | found Nov 19 | same one-line fix; hygeia answers in ~34 s |

## Web client (`client/`)

Feature-frozen reference render (React 19, Vite, vitest) — rollback is
"deploy `client/` as before". `preserved/torn-paper-web/` stays until M8
sign-off. The static plane is supervised (above).

## Mobile app (`mobile/`)

Expo SDK 57, RN 0.86, Skia 2.6, Reanimated 4.5. 242 jest tests, tsc
clean, eslint at the pre-existing warning count. The phone runs the
2026-11-18 build (T2.7 + offline plan cache).

**Real surfaces (8 of 20 routes)** — Plaza (glass plan card with tick
column, habits coverage line, waiting-on counts), wake (hard-mode),
inbox (waiting-on + resolutions), capture (+ `?meal=1` prefill),
questions, notes, **routine** (day detail: tick/skip/recall), **meals**
(day cards, `~` marks, mismatch flag, log-a-meal deep link).

**Offline-first, two queues.** The app outbox (T2.1 armor: wake taps,
capture_raw, routine ticks — a tick needs zero queue code of its own,
import-asserted) and the task outbox (local-first task pages). Replay
triggers: reconnect, foreground, install. The plan revision rides the
phone (kv) so the tick surface survives outages offline — found by the
T2.7 device leg: blocks that do not render cannot tick.

**Routine ticks (T2.7)** — done and device-verified
(`mobile/renders/T2.7-MEASUREMENTS.md`): airplane tick → force-stop →
relaunch → exactly one `routine_done`, `ts` = tap time (delta 0 s),
`external_ref` = `gre-deep-work:2026-11-18`, dedupe holds on re-foreground.
`routine_skip` renders muted (covered-not-done); recall ticks render `~`
everywhere; a tick-less day renders its coverage line, never a zero. Keys
are T1.3's extractor slugs — never typed or derived client-side.

**Meals (T2.6)** — `/meals` renders the estimates law structurally:
`est()` is the only tilde source for numbers (gate-tested), totals are
the sum of rows, a disagreeing stored total fires the mismatch flag.
Photo-only captures stay honestly `skipped` until a vision transport
exists (the ref rides the prompt when text accompanies it).

## APK pipeline and device verification (M5, re-verified since)

Signed release APK via `scripts/build-apk.sh preview`; installs in-place
(same cert), cold start worst 373 ms, deep links land and never degrade
to browser chrome. Since M5: the phone took the 2026-11-01 (tasks) and
2026-11-18 (T2.7) builds; two force-stop legs ran on it (T2.1 Oct 24,
T2.7 Nov 18 — the latter's tick `ts` matched the tap to 0 s and drained
17.4 s later, the honest receipt pair).

## Tooling, CI and lints

Unchanged from the 2026-10-24 edition: four CI jobs (`app`, `client`,
`greps`, `lint-selfcheck`), the three grep lints with failing fixtures,
commit pairs per task, `core.fileMode` false on fuseblk, history never
rewritten. Standing greps green across the P2 diff (verified 2026-11-19
at the phase exit). Still open: no mobile CI job; mobile checks run by
hand (`npx jest`, `npx tsc --noEmit`, `npx expo lint`).

## Known gaps and what is next

| Gap | Detail |
| --- | --- |
| **Phase two-pass** | P2's exit claims were verified 2026-11-19; the second pass (different greps, cold re-read) is owed the next day per EXECUTION §5. |
| **Weekly review (user action)** | The live Week Plan is the 31 Aug revision — `plan_keys` arrive with the next real revision, and routine ticks activate with them. The plan strip honestly shows the stale week until then. |
| Meals photo path | Photo-only captures stay `skipped` until a vision transport through `agent_invoke` exists; the ref + provenance plumbing is already in place. |
| M6 widget | Home-screen wake tap; same spine, same idempotency. |
| M7 push | **Gated**: notifications appear in no v1 doc — write the §7 spec first; do not invent the policy in code. |
| M8 cutover | Retire/demote the web client; delete `preserved/torn-paper-web/` only after sign-off. |
| P3 strips | Plan-vs-actual drift; T2.7's tick data is its first real input. |
| Poison-entry UX | A 4xx still marks nothing visible on the phone; the event queues silently (the queue spec wants `failed` + a plaza line). |
| Mobile CI | Still no CI job for jest/tsc/eslint. |
| `assetlinks.json` | 404 on the public origin; matters at M8. |
| Keystore custody | Off-box copy exists (olympus vault, sha256-verified); still owed a third site + restore drill (P6 T6.2). |
| Dev-client launch check | Scripted, unrun (uninstalls the ship APK — needs approval). |

**Next steps.**

1. Weekly review → new Week Plan revision → ingest → the tick surfaces
   light up on the phone's next build.
2. Pick: M6 (widget — the wake tap from home) or P3 (strips/drift —
   fed by a few weeks of tick data). Current pull: M6 first.
3. Tomorrow: the P2 two-pass cold re-read, then close the phase books.
