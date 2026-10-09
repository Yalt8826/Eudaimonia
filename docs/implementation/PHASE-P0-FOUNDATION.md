# Phase P0 — Foundation

**Size M · ~8–10 nights · Risk: low (nothing live)**

The only phase with a free rollback — nothing is live, nothing has data.
Use that: every schema correction here is a text edit to a migration that
has not run. After P0, the same correction is an additive migration and a
rebuild drill (`EXECUTION.md` §2 — no tier exists for "migrate backward",
which is why the schema is frozen *before* this phase, not during).

**What this phase proves:** that migration 001 applies clean to an empty
database, that one real agent round-trip works end-to-end through the
chokepoint, that the shell installs as a PWA and renders offline, and
that the contrast, blur-budget, accent and chokepoint lints are enforced
by CI rather than by memory.

**Exit tests** (02 §5, P0 row): offline wake-tap round-trip at stub
level · real `hermes --profile` invocation · contrast lint green per
01 v2 §7.

**Read before starting:** `EXECUTION.md` in full, once.
`docs/plan/v1/02-architecture.md` §2 (the twelve laws), §3 (frozen
schema), §5, §6. `docs/plan/v1/01-design-system.md` (Matte & Torn v2 —
every hex value lives there). `docs/plan/v1/04-screens-pwa.md` (route
map, wake spec).

**The one thing that can end this phase.** If `hermes --profile <name>
-z` cannot complete headless with a parseable terminal outcome, law 12's
one-primitive contract needs a decision before anything agent-adjacent
builds (P2 capture triage, P4 narrated pass, chat, assignments). So the
T0.3 real round-trip runs early in its window — first half of the phase,
never the last night.

**Frozen, not re-argued here:** origin `yalt8826.com` + Cloudflare
Tunnel (static plane only, `/api/*` tailnet-only — P6 wires it; nothing
in P0 touches it) · scheme `web+eudaimonia` · React SPA via Vite served
as static files by FastAPI (no Node process in prod) · FastAPI + SQLite
on olympus.

---

## Task graph

```
T0.1 monorepo+CI
     │
     ├── T0.2 migration 001 ──── T0.3 agent_invoke ──┐
     │                                               │
     └── T0.4 theme.css ──────── T0.5 PWA shell ─────┴── T0.6 lint fixtures
```

T0.1 wires the three `EXECUTION.md` §4 grep jobs green-on-empty;
T0.6 proves they fire (fixtures-that-fail + one deliberate red each).
T0.2 → T0.3 is a real dependency: the chokepoint records spine events,
so the `event` table exists first. Nothing else serializes.

---

### T0.1 — Monorepo, tooling, CI

**Reads:** 02 §1 (topology), §2 (laws) · 04 (stack: single React PWA, no Node server) · `EXECUTION.md` §4 (the three grep jobs)
**Depends on:** —
**Parallel with:** —
**Tier:** free (nothing deployed)

**Build**

```
eudaimonia/
  app/                        FastAPI, uv-managed
    pyproject.toml            ruff + mypy (strict) + pytest config
    app/main.py               FastAPI app; mounts client/dist at / (prod)
    app/agent_invoke.py       (T0.3 — the only hermes caller)
    migrations/               forward-only SQL (T0.2)
    tests/
  client/                     Vite + React + TS, pnpm
    src/theme.css             (T0.4 — the only file allowed accent hexes)
    src/routes/               (T0.5)
    src/sw/                   (T0.5)
    eslint.config.js
    schemas/                  checked-in schema copy (T0.2)
  docs/                       implementation docs (this directory)
  .github/workflows/ci.yml
```

**[impl] One process in prod: FastAPI serves the SPA.** Vite builds
`client/dist`; `app/main.py` mounts it as static files at `/` with the
API under `/api/*`. No Node process exists on olympus (frozen decision).
In dev, Vite's proxy forwards `/api` to uvicorn. NFS caveat from 02 §1
applies the moment anyone dev-serves from the vault:
`WATCHFILES_FORCE_POLLING=true`.

**[impl] uv pins Python, `packageManager` pins pnpm.** Ruff for lint,
mypy strict from the first commit (retrofitting strict onto a Python
codebase never happens), pytest for app tests; eslint + `tsc --noEmit` +
vitest for client. Node versions pinned via `.nvmrc`; the client toolchain
exists only at build time — its output is static files.

**[impl] The three grep jobs land in CI now, green on an empty tree.**
From `EXECUTION.md` §4: (1) `backdrop-filter` count ≤1 per screen route
under `client/src/routes/`; (2) accent/state hex literals only inside
`client/src/theme.css`; (3) no `subprocess`/`Popen`/hermes invocation
outside `app/agent_invoke.py` (02 §2 law 12, 02 §6 chokepoint invariant).
Wiring them in T0.1 makes them watch every commit from birth; **proving
they fire is T0.6, not this task** — a lint rule with no failing fixture
is a lint rule nobody has proven fires.

CI on pull request, all required to merge: ruff · mypy · pytest ·
eslint · tsc · vitest · the three grep jobs. No deploy jobs — there is
nothing to deploy until P6.

**Tests**

- Fresh clone: `uv sync && uv run pytest` green; `pnpm install && pnpm lint && pnpm typecheck && pnpm test` green.
- CI green on a scratch PR touching all four quadrants (app code, client code, migration dir, docs).
- The three grep jobs present and passing on the near-empty tree (firing proof deferred to T0.6 — stated here so nobody "finishes" linting now).

**Done when**

- [ ] Fresh clone green on both sides, zero manual steps
- [ ] CI blocks a merge on a failing test — proven once by breaking it on a scratch PR
- [ ] The three grep jobs run in CI and pass on the current tree

**If it fails**

`git reset --hard <start-sha>`. Nothing else has run. Vite failing to
resolve the FastAPI proxy is the expected dev-mode failure and it is the
proxy config, not the stack — check `server.proxy` before touching
anything else.

**Commits**
`chore(T0.1): start monorepo-ci — baseline green` → `feat(T0.1): monorepo, FastAPI+Vite single-process skeleton, three grep-lint CI jobs`

---

### T0.2 — Migration 001: frozen schema v0.1 + v0.2 additive + shared coverage view

**Reads:** 02 §3 (schema v0.1 frozen; v0.2 additive) · 02 §6 (no frozen-table columns; single-writer statuses) · 07 §19 (v0.2 DDL, event-kind additions) · 08 (assignment table) · 09 §2 #1 (coverage block) · 02 §2 law 7 (one shared coverage view)
**Depends on:** T0.1
**Parallel with:** T0.4
**Tier:** free

**Build**

`app/migrations/001_initial.sql` — three sections in one forward-only
migration, applied by a ~50-line runner (a `schema_migrations(version,
applied_at)` table, lexicographic order, refuses gaps). No ORM. Hand-written
SQL, `sqlite3` stdlib driver; the DB is one file, `eudaimonia.db`.

**Section 1 — v0.1 frozen.** Every table from 02 §3, columns exactly as
listed there:

- `source` — adapter registry: globs, class (`behavioral|pipeline`),
  success predicate, `last_ok_read_ts`, status enum (`alive|dead|paused`).
- `event` — the spine: `ts`, `kind`, `origin`
  (`source-read|app-write|agent-write`), `source_id`, `external_ref`,
  `actor`, `payload` JSON; **`UNIQUE(source_id, kind, external_ref)`** —
  idempotency and provenance each live in exactly this one place (02 §1).
  `kind` is a plain TEXT column, deliberately not an enum: kinds grow
  additively (`habit_tap`, `routine_done`, `goal_status_derived`,
  `project_status`, `agent_chat`, …) and the origin enum is the frozen
  one. A comment in the migration says why, so nobody "fixes" it into a
  CHECK later.
- `loop` (direction owed-by-me/owed-to-me, done/rolled/dropped) ·
  `question` · `reading_item` (status, 1–5 rating, `staged_ts`) ·
  `habit` (habit taps are `event` rows of kind `habit_tap`, payload
  `method: 'tap'|'recall'` — not a second table; 02 §3 "habit +
  habit_tap events") · `document` (kind, week_id, layer
  `mechanical|narrated`, path, sections JSON;
  **`UNIQUE(kind, week_id, layer)`**) · `provenance_edge` (from_ref →
  to_ref) · `context_note` (dated `valid_from`/`valid_until`).

**Section 2 — v0.2 additive** (07 §19, 08): `project` (id PK, name,
status CHECK `active|parked|done`, board_glob, notes_path, ts) · `goal`
(id PK, title, target_date, status CHECK `on-track|at-risk|achieved|parked`,
links JSON) · `assignment` (id PK, profile, text, context_refs JSON,
status CHECK `queued|running|done|failed`, origin_object_ref,
created_event_id, result_ref). Zero changes to frozen v0.1 tables; no
frozen table ever gains a column (02 §6). Comments on `goal.status` and
`assignment.status` name their single writer each — derivation pass /
`agent_invoke` lifecycle (02 §6 single-writer invariant) — so the next
reader learns the rule from the schema, not from a doc hunt.

**Section 3 — the shared `coverage` view. This migration is the view's
only definition anywhere in the build** (law 7: one shared source). One
view, per source: `days_fresh_7` (distinct content-dated days of the
trailing 7 with an artifact that passed the source's success predicate —
freshness ≠ success, law 1), `last_ok_read_ts`, `status`, `class`, and
the paused-evidence join (law 5: `paused` requires a recorded
`job_paused` event with actor=human). Empty DB → the view queries and
returns honest zeros/empty set, never an error.

**[impl] Five render states, fixed here, consumed everywhere.** The view
exposes the facts; the five states derive from them per law 5 and the
dormancy law. Every later consumer (T1.6 Plaza, T3.4 dormancy engine,
T4.1 review coverage block, T6.3 `/widgets.json`) reads this set and
adds nothing to it:

| State | Fires when | Renders |
|---|---|---|
| `alive` | source passes its success predicate | green pair |
| `dead` | **system failure only** — a human must fix | red pair |
| `paused` | recorded `job_paused` event, actor=human (law 5) | amber pair |
| `behavioral-dormant` | behavioral-class silence (law 4) | muted gray — never a state hue |
| `uninstrumented` | no artifacts ever — awaiting first data | neutral, never alarms |

The fifth state is the W37 dry-run's delivered defect (finding #2: the
four dormancy-law states don't cover "not yet instrumented"); amended
into `09 §2#1` 2026-10-09 and implemented from P0 so no consumer invents
a sixth. **No screen, strip, widget or review section re-derives
coverage or adds a state** — grep-enforced from T1.6 on.

**[impl] Forward-only, tested as such.** There is no down path and the
runner has no concept of one (`EXECUTION.md` §2). The test asserts the
runner is a no-op when re-invoked against an already-migrated DB and
applies clean against an empty one — that pair *is* the migration suite.
Rolling back this task means deleting the `.db` file; nothing in it is
real yet.

**[impl] Schema checked in for the client.** `client/schemas/schema.sql`
is a byte-exact mirror of the applied migration set, asserted equal by a
test on every CI run (the runner's applied DDL concatenated). The client
and any agent get a readable contract without opening the app tree; the
migration stays the single authority.

**Tests**

`app/tests/test_migration.py`:

- Fresh empty DB → 001 applies → every v0.1 + v0.2 table and the view
  exist; re-running the runner changes nothing (no-op asserted).
- Spine idempotency: inserting the same `(source_id, kind, external_ref)`
  twice raises; `INSERT OR IGNORE` returns unchanged rowcount — this is
  the dedupe path every adapter and the SW queue replay ride.
- `document` upsert shape: second `(kind, week_id, layer)` insert
  violates; `INSERT ... ON CONFLICT DO UPDATE` round-trips (09 §1:
  regeneration is an upsert).
- v0.2 CHECKs: `goal.status='streak'` rejected; `assignment.status`
  accepts exactly the four values.
- `client/schemas/schema.sql` byte-equal to the migration set.
- Coverage view: seeded with one source and one passing read →
  `days_fresh_7 = 1`; with zero rows → queries clean. Missing days are
  data, never zeros (law 7) — assert the view reports counts, it does
  not fabricate per-day rows.
- All five render states derive from view facts on fixtures — including
  `uninstrumented` for a registered source with zero artifacts, and
  `behavioral-dormant` never resolving to the dead tier.

**Done when**

- [ ] `eudaimonia.db` created from nothing by one command, zero manual steps
- [ ] Coverage view queries; both the seeded and empty cases asserted
- [ ] Schema mirror byte-equal and CI-checked
- [ ] No down-migration code exists anywhere in the repo

**If it fails**

Reset and edit the migration in place. It has never run against real
data — this is the free window `EXECUTION.md` §2 describes, and it is
the last phase where a schema change is free.

**Commits**
`chore(T0.2): start migration-001 — baseline green` → `feat(T0.2): migration 001 — frozen v0.1, additive v0.2, shared coverage view, forward-only runner`

---

### T0.3 — `agent_invoke` chokepoint + real-profile round-trip spike

**Reads:** 02 §2 law 12 (one agent primitive), law 1 (freshness ≠ success) · 02 §6 (single-writer statuses; failure can never read as success; every agent call goes through the chokepoint) · 08 §20 (writer contract — terminal outcome event even on crash) · 07 §19 amendment (b)
**Depends on:** T0.2 (the spine the outcome events land in)
**Parallel with:** T0.4, T0.5
**Tier:** free (nothing live) — but the spike needs hermes + a real profile on the build box

> **The spike is not the last night.** See the phase header: a
> headless-hermes surprise invalidates law 12's contract, and everything
> from P2 capture triage to P4 narrated pass queues behind that contract.

**Build**

`app/agent_invoke.py` — the only module in the repo permitted to spawn
hermes (02 §2 law 12; grep-enforced from T0.1).

```python
agent_invoke(profile, prompt, timeout, success_predicate) -> InvokeResult
```

- Primary transport: `hermes --profile <name> -z <prompt>`.
- **`HERMES_HOME` fallback** (law 12 names it): when the `hermes`
  entrypoint is not resolvable from the server's environment (cron
  shells, systemd units on olympus have different PATHs than the
  interactive one), resolve the same CLI from `HERMES_HOME` and run it
  with `HERMES_HOME` exported. One documented fallback, still inside
  this module — never a second spawn site.
- **The chokepoint enforces the timeout itself** (`subprocess` timeout +
  kill). This is the load-bearing part of the writer contract (08 §20):
  a process that dies mid-turn still ends in a recorded failure, because
  the *timeout belongs to the caller of the process*, not to the process.
- **Always emits a terminal outcome event** (02 §6): every invocation
  writes a start event (kind `agent_invoke_started`) and exactly one
  terminal `agent-write` event, kind `agent_invoke_result`, payload `{profile, outcome, duration_ms,
  predicate_result, exit_code}` with outcome ∈
  `ok|timeout|error|predicate_failed`. Timeout and non-zero exit and
  predicate-False all record failure — **never silence**, and nothing on
  any path can write `done`/`answered` from a failed invocation (02 §6
  "failure can never read as success"; law 1 applied to invocations).
- `success_predicate(stdout, exit_code) -> bool` — caller-supplied;
  the default additionally requires exit 0. The predicate is the gate
  that keeps a chatty-but-failed run from reading as success (02 §6).
- Retry/audit/limits live here and only here: max retries, per-profile
  concurrency cap of 1, and the audit trail is free — the spine events
  are the agents screen's invocation-history feed (law 12).

**Spike — the real round-trip.** Invoke
`hermes --profile clio -z` with a trivial prompt ("Reply with the single
word OK."), `success_predicate` = exit 0 ∧ `OK` in stdout, timeout 120s.
Assert: predicate true, start + terminal events in `eudaimonia.db` with
`ts` ordering and `duration_ms` recorded. Run it once for real, on the
box where hermes lives; record the exact command that worked in the
module docstring — that line is the fallback documentation.

**Tests**

`app/tests/test_agent_invoke.py` (mocked subprocess — CI always runs
these):

- Happy path: exit 0, predicate true → outcome `ok`, exactly one
  terminal event, `origin='agent-write'`.
- **Timeout**: a subprocess that hangs is killed at `timeout`; outcome
  `timeout`; the terminal event exists; the result cannot satisfy any
  success predicate downstream (assert the outcome field, not trust).
- Non-zero exit with chatty stdout → `error`, not `ok`.
- Predicate returning False on exit 0 → `predicate_failed`, not `ok`.
- Each case: exactly two rows in `event` (`agent_invoke_started` + one
  `agent_invoke_result`), no more — silence is the failure mode this
  module exists to prevent. Both kinds are registered in
  `EXECUTION.md` §7.
- Fallback: with the primary entrypoint masked, resolution via
  `HERMES_HOME` produces the same subprocess shape (mocked).

`app/tests/test_agent_invoke_real.py`, marked `real_hermes`, skipped
unless `--real-hermes` (hardware-gated, like a handset test): the clio
spike above, against the real binary and the real profile.

**Done when**

- [ ] One real `hermes --profile clio -z` round-trip: prompt in, predicate true, spine events in the DB
- [ ] Timeout test kills at the deadline and records `timeout` — never `ok`
- [ ] `grep -r 'subprocess\|Popen' app/ --include='*.py'` hits only `agent_invoke.py`
- [ ] `HERMES_HOME` fallback path exercised once and the working command recorded in the module docstring

**If it fails**

If the CLI's `-z` output shape or exit codes differ from the assumption,
fix the parser inside `agent_invoke.py` only — the law does not move, and
no other module may grow a spawn to "work around" it. If the real
invocation hangs, the timeout firing *is* the chokepoint working; the
spike failing means predicate/profile trouble, which is exactly what this
task exists to discover while it is cheap.

**Commits**
`chore(T0.3): start agent-invoke — baseline green` → `feat(T0.3): agent_invoke chokepoint with guaranteed terminal events, clio round-trip spike`

---

### T0.4 — theme.css: Matte & Torn tokens, grain, palette picker stub

**Reads:** 01 §1 (palette + paper tints + state pairs, all measured), §2 (surfaces, torn under-layer), §7 (gates for theme.css), §6 (type/motion carry-over) · `plan/v1/archive-v1-aurora.md` (picker entry, verbatim tokens) · 04 `/settings` (picker lives there)
**Depends on:** T0.1
**Parallel with:** T0.2, T0.3
**Tier:** T1 (client — rebuild is free)

**Build**

`client/src/theme.css` — every token from 01 §1, names as given:

```css
:root {
  /* base + ink (01 §1) */
  --bg: #0B0B0C;            --text: #EDEDEA;         --muted: #9A9A94;
  /* accents — you act / agents act (hue law, 01 §4) */
  --accent-1: #2DD4BF;      --accent-2: #B872F2;
  --accent-2-ink: #7E22CE;  /* plum's paper pair (5.98 on cream) */
  /* glass — touching only (01 §2 L1) */
  --glass-fill: rgba(255,255,255,0.06);
  --glass-border: rgba(255,255,255,0.10);   /* 1px */
  --scrim: rgba(0,0,0,0.55);
  /* torn-paper under-layer (01 §1) — tint is taxonomy, never valence */
  --paper-cream: #F3EDDF;   --paper-mint: #E3EEE3;   --paper-sky: #E2EDF4;
  --paper-blush: #F6E7E3;   --paper-butter: #F5EFD8;
  --paper-ink: #2B2926;
  /* state colors — two calibrated pairs, same hue per surface (01 §1) */
  --alive-glass: #3FB950;   --alive-paper: #27963C;
  --dead-glass: #F85149;    --dead-paper: #D64545;
  --paused-glass: #D29922;  --paused-paper: #A16207;
  /* dormant: --muted on every surface — never a state hue (01 §1) */
}
```

Plus the Obsidian-dialect callout block mapping the four states (01 §2
end, v1 §6 contract): `[!success]` alive · `[!failure]` dead
(system failure only) · `[!warning]` paused · neutral `[!note]`
behavioral dormancy.

**Grain asset:** `client/src/assets/grain.svg` — static SVG noise,
opacity ≤2%, over `--bg` only (01 §2 L0). Static means static: no
`<animate>`, no CSS animation frames, ever (01 §7 gate 4). It is the
black skin's texture, not a screensaver.

**`TornSheet` primitive stub** (01 §2 L2): tint prop over the five paper
tokens, `--fringe-w` exposed, grain lighter than the skin's and static,
rotation ≤1° static, shadow flat. **Text padding ≥ fringe width** enforced
inside the component (the fringe exclusion zone) — this is gate 3's
assertion surface. The torn edge belongs to the black layer's own
perimeter (paper sits *under* the skin, per the placement ruling in
01 §2); a stub with the right custom properties is enough in P0 — the
calibration surfaces (weekly review, nutrition detail) arrive in P4/P3.

**Palette picker stub on `/settings`:** v2 Matte & Torn default + v1
Aurora entry, whose tokens are copied **verbatim** from
`plan/v1/archive-v1-aurora.md` (`--bg #081217`, `--text #E2EFF1`,
`--muted #8FA8FA`'s sibling `#8FA8AD`, teal `#2DD4BF`, violet `#A78BFA`,
glass/paper/scrim fills) — provenance law: v1 survives as history, not
as a redesign. State colors are palette-invariant and do not flip with
the picker (v1 §1: state colors never move). Flipping swaps a
`data-theme` attribute; a palette flip must remain a token edit, never a
redesign (v1 §7).

**[impl] The contrast lint computes, it does not transcribe.** A vitest
suite parses the hexes out of `theme.css`, computes every WCAG ratio,
and asserts the floors from 01 §7 gate 1 — ≥4.5 for text/ink pairs,
≥3.0 for non-text paper dots — with the measured values in the
assertion messages. The 01 §1 measured column (text/glass 14.83,
muted/glass 6.15, accent-1/glass 9.34, accent-2/glass 5.57,
accent-2-ink/cream 5.98, paper pairs 12.06–12.58, state pairs as
tabulated) doubles as the expected-result cross-check. A contrast
assertion failing means a token is wrong, never that the assertion is
strict — do not soften a floor to make a test pass.

**Tests**

`client/src/theme/contrast.test.ts` — the computing suite above; fails
the build on drift (gate 1).
`client/src/theme/tokens.test.ts` — every 01 §1 token name resolves in
`:root`; every state × surface ink-pair exists as a pair (gate 2).
`client/src/assets/grain.test.ts` — the SVG contains no animation
constructs and the opacity constant ≤2% (gate 4).
Accent-hex grep: CI job from T0.1, firing proof in T0.6.

**Done when**

- [ ] Contrast suite computes and passes, measured values in assertion output
- [ ] All ink-pairs present as token pairs: state × {glass, paper}, plum × {glass, paper} (gate 2)
- [ ] Grain asset static, ≤2%, no animation constructs
- [ ] Picker renders v2 default + v1 Aurora; flipping live-swaps tokens with zero component edits

**If it fails**

T1 — rebuild the CSS. But a contrast failure is a token transcription
error: re-read 01 §1's hexes before touching the assertion.

**Commits**
`chore(T0.4): start theme-tokens — baseline green` → `feat(T0.4): Matte & Torn tokens, TornSheet stub, static grain, palette picker with v1 Aurora entry`

---

### T0.5 — PWA shell: routes, manifest, service worker + offline queue skeleton

**Reads:** 04 (route map, wake spec, global chrome) · 02 §2 law 9 (hard-mode surfaces), §4 (PWA contract) · 01 §3 (bubble cluster) · 02 §6 (wake never degrades; public plane serves shell only)
**Depends on:** T0.1, T0.4
**Parallel with:** T0.2, T0.3
**Tier:** T1

**Build**

Vite React SPA (frozen stack, 04: single React PWA, no Next, no Node in
prod — T0.1's FastAPI mount is the server). React Router wires **every**
route in 04's route map as a stub: `/` `/inbox` `/habits/wake`
`/week/[iso]` `/questions` `/timeline` `/reading` `/meals` `/agents`
`/server` `/capture` `/notes` `/mail` `/projects` `/projects/[id]`
`/goals` `/routine` `/chat` `/chat/[profile]` `/settings`. One tree, stubs render
their route name and nothing else — a route missing in P0 is a 404 the
two-tap law trips over in P1, so all of them exist now.

**`manifest.webmanifest`** — name, icons, `display: standalone`,
`theme_color #0B0B0C`, scheme `web+eudaimonia` registered as a protocol
handler (frozen decision). Installable on Android (PWA) and desktop
(installed window) from the same build.

**Service worker** (`client/src/sw/`):

- **Precache** the app shell and the `/habits/wake` route bundle (law 9:
  hard-mode surfaces are precached — the wake screen must render with
  the network gone).
- **Offline event-queue skeleton**: queued POSTs persist (IndexedDB)
  with `idempotency_key = device UUID` (generated once, stored,
  rides every queued event), `ts` = tap time from the client clock,
  `ingested_at` = retry time — the three fields exactly as law 9 fixes
  them. Replay on reconnect, in order, same keys. On the server side the
  dedupe is the spine's `UNIQUE(source_id, kind, external_ref)` (T0.2),
  with wake-tap `external_ref = "{device_uuid}:{tap_ts}"` — one replay
  storm, one row. **This skeleton is the load-bearing piece**: the P2
  exit test (airplane-mode tap survives force-stop) stands on it, and
  `EXECUTION.md` Part IV lists the SW queue as never-cut.

**Wake route `/habits/wake`:** bare full-bleed teal stub — no nav bar,
no header, no animation, one giant target shape, nothing else (04 wake
spec; law 9). The bubble-cluster nav (01 §3) renders as a stub on every
other route and **never** on this one; the position setting is one CSS
variable from birth. Blur budget discipline from first render: glass
only on interactive elements, zero `backdrop-filter` on wake, ≤1
anywhere — the T0.1 grep watches every commit.

**Tests**

`client/src/sw/queue.test.ts` — fake-timer unit tests: queue while
offline → `ts` captured at tap, not replay; reconnect → replayed once,
same idempotency key, `ingested_at` set at retry; double-replay is
idempotent at the key level.

`client/src/sw/precache.test.ts` — the precache manifest includes shell
assets and the wake route chunk.

`client/src/routes/routes.test.tsx` — every 04 route renders a stub
without throwing; `/habits/wake` renders with zero chrome (nav cluster
absent from its tree — asserted structurally, not visually).

**Done when**

- [ ] Installs as a PWA on a real phone; desktop install opens a window
- [ ] Airplane mode: cold-open renders the shell and `/habits/wake` from cache (stub-level round-trip — the phase exit test)
- [ ] Offline stub tap queues with tap-time `ts`, replays once online with the same idempotency key
- [ ] Every route in 04's map reachable at its URL; wake route bare

**If it fails**

T1 — rebuild the SPA. SW quirks (stale worker not updating) are dev
inconveniences: unregister + re-register, hard reload. Debug the queue
in its fake-timer tests, not on-device — those tests are deterministic,
a handset is not. If the wake route ever renders in a Custom Tab, that
is a build-blocking defect (02 §6: wake never degrades; TWA
verification depends on it in P6) — fix the manifest/scope before
proceeding.

**Commits**
`chore(T0.5): start pwa-shell — baseline green` → `feat(T0.5): PWA shell — full route stubs, installable manifest, SW precache + offline queue skeleton`

---

### T0.6 — Lint gates proven: fixtures-that-fail

**Reads:** `EXECUTION.md` §4 (the three grep jobs) · 02 §6 (the invariants the greps encode) · 01 §7 (theme gates) · 02 §2 laws 9, 12
**Depends on:** T0.1, T0.3, T0.4, T0.5 (the lints need their subjects to exist)
**Parallel with:** —
**Tier:** free

**Build**

The three `EXECUTION.md` §4 jobs, each completed with the thing T0.1
deferred: a **failing fixture** and a self-check step.

1. **Blur budget** — count `backdrop-filter` occurrences per screen
   module under `client/src/routes/`, ≤1 each (law 9; 01 §7 gate 4).
   Fixture: `client/src/routes/__fixtures__/blur_violation.tsx` (two
   backdrop-filters, excluded from the build, included in the lint glob).
2. **Accent hexes** — accent/state hex literals from the 01 §1 palette
   appearing anywhere outside `client/src/theme.css` → red. Fixture:
   `client/src/__fixtures__/accent_violation.tsx` (one accent hex).
   This is what makes "a palette flip is a token edit" (v1 §7) a
   guarantee instead of a hope.
3. **Chokepoint** — `subprocess` / `Popen` / hermes invocation anywhere
   outside `app/agent_invoke.py` → red (law 12; 02 §6). Fixture:
   `app/tests/fixtures/chokepoint_violation.py.txt`.

**[impl] A lint rule with no failing fixture is a lint rule nobody has
proven fires.** Each fixture is asserted to fail in CI itself
(`lint-selfcheck` job: run each grep against its fixture → expect
non-zero; run against the real tree → expect zero; both in one step, so
a regex that silently stops matching turns the self-check red, not
merely useless).

**Tests**

- `lint-selfcheck` green: three fixtures fail, tree passes.
- The manual proof each rule was never just configured: on a scratch
  branch, deliberately violate each rule once (add a second
  backdrop-filter; paste an accent hex in a component; spawn hermes in a
  route handler), watch CI go red on the PR, revert. Tick the boxes only
  after the red is observed — README's rule: a checkbox is ticked by
  observed execution, never by intention.
- Contrast suite from T0.4 already runs in CI; confirmed red-on-drift by
  temporarily editing one hex.

**Done when**

- [ ] Each of the three greps proven red on its fixture in CI
- [ ] Each proven red once by a deliberate violation on a scratch PR
- [ ] Clean tree passes all three + the contrast suite
- [ ] `lint-selfcheck` fails the build if a fixture stops failing

**If it fails**

A grep that will not fire is a regex bug — fix the grep, never weaken
the fixture. A grep that fires everywhere is a scoping bug — tighten the
path glob to exactly `EXECUTION.md` §4's targets. Neither is ever fixed
by deleting the fixture.

**Commits**
`chore(T0.6): start lint-fixtures — baseline green` → `chore(T0.6): grep-lint jobs proven by fixtures-that-fail + CI lint-selfcheck`

---

## Phase P0 exit

All task boxes above, plus the 02 §5 P0 row restated as observed facts:

- [ ] Offline wake-tap round-trip at stub level (SW queue replays with stable idempotency key)
- [ ] Real `hermes --profile clio -z` invocation: predicate passed, spine events recorded
- [ ] Contrast lint green per 01 v2 §7, computing not transcribing
- [ ] Blur / accent-hex / chokepoint greps green **and each proven to fire**
- [ ] Migration 001 applies clean to a fresh DB; coverage view queries
- [ ] Shell installs as PWA on phone and desktop

**Two-pass close** (`EXECUTION.md` §5; 02 §6): the exit claims get a
second independent pass — different grep, different seat, at minimum a
cold re-read the next day. The author never solo-declares the phase
done.

**Descope:** nothing. P0 is the floor everything else stands on; the
first never-cut item on `EXECUTION.md` Part IV (the SW queue) ships
inside it.

**Rollback:** free — nothing is live. Revert the branch, delete
`eudaimonia.db`. No backup exists because there is nothing to back up.
**This is the last phase where that is true**; from P1 on, the spine has
real rows and corrections ride T3/T4.
