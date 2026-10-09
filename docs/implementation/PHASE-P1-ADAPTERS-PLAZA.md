# Phase P1 — Adapters + the Plaza (read-only)

**Size M · ~10–12 nights · What it proves: the read-model era works on real
messy data — a lapsed month renders honestly.**

Four chain-following adapters turn the vault's stale archives and the
cron-output live chains into spine events; migration 001's shared
`coverage` view (T0.2) turns those into "N of last 7" lines; the Plaza
renders them. Everything in this phase is read-only: no wake tap, no
capture, no inbox writes — those are P2. The exit is a dead month (September) rendering with full honesty:
plan-missing, reports at their real count, nothing synthesized, nothing
crashing on empty dirs.

- **Ships:** 4 adapters (day-report, week-plan, tasklist, kanban ro) ·
  the first `coverage` consumers · Plaza (`/`, read-only) — per EXECUTION
  Part II. The view itself ships in P0 (T0.2); P1 consumes it.
- **Entry:** P0 exit met — migration 001 (frozen schema v0.1 + the
  `coverage` view) applied, repo+CI green, theme.css gates passing
  (02 §5 P0 row).
- **Exit:** Sept gap backfill renders from the cron chain · empty-dir →
  coverage lines, no crash · "yesterday" resolves from Oct-1 artifacts
  (02 §5 P1 row; full checklist in T1.7).
- **Rollback:** T1 (client) / T2 (adapters) — EXECUTION Part II. Wrong
  ingested rows are superseded by compensating events (T4), never
  DELETEd: the spine is append-only (EXECUTION Part I §1).
- **Descope:** Multica probe deferred (EXECUTION Part IV cut order:
  kanban adapter → Multica probe → day-report backfill). It is **not
  spec'd here**; it lands with the agents screen as the Multica
  read-through section of **P4 T4.4**, read-through per 02 §1. Never cut: the `coverage` consumers — every surface reads them.

**Read before starting:** `02-architecture.md` §1–§3 (topology, laws 1–5,
frozen schema) and §5 (P1 row) · `03-feature-list.md` features 1–2, 14–16 ·
`04-screens-pwa.md` `/` Plaza + global chrome · `01-design-system.md` §1–§2
(tokens, surfaces) · `09-weekly-review-format.md` §2#1 (five coverage
states) · `docs/dry-run/2026-W37-dry-run.md` in full (ground truth +
findings 2–3).

---

## Task graph

```
T1.1 adapter framework ──┬─ T1.2 day-report ──┐
                         ├─ T1.3 week-plan ───┤
                         ├─ T1.4 tasklist ────┼─ T1.6 Plaza on the ─── T1.7 Sept
                         └─ T1.5 kanban ro ───┘   coverage view          backfill exit
```

T1.7 also depends directly on T1.2 and T1.3 — they supply the backfill's
substance (plan + recap content), while T1.6 supplies the surface it is
read on.

T1.2–T1.5 parallelize freely once T1.1 lands. T1.6 needs all four adapters
feeding it. T1.7 is the phase gate and depends on T1.2, T1.3 (the backfill
substance) and T1.6 (the render surface).

---

## Part A — Adapters

### T1.1 — Adapter framework

**Reads:** 02 §2 laws 1–4 · 02 §3 (frozen `source` + `event` tables) · 02 §1 (chain locations, NFS caveat)
**Depends on:** P0 exit
**Parallel with:** —
**Tier:** T2

> Load-bearing for the whole phase: every other P1 task is a row in this
> registry plus a parser. Gets the two-pass treatment (02 §6).

**Build**

**[impl] Registry wiring, no new tables.** The frozen schema already has
`source` (globs, class, success predicate, `last_ok_read_ts`, status enum)
and `event` with `UNIQUE(source_id, kind, external_ref)` (02 §3). This
task wires them: one `source` row per adapter, with glob sets as JSON
(vault globs AND cron-output globs — both, always; law 2), `class` ∈
`behavioral|pipeline`, and `success_predicate` as a *named* predicate
registered in code (the row stores the name; the function lives where it
can be unit-tested).

**[impl] Chain-following ingest (law 2).** Per source per run: enumerate
all globs → parse each artifact's content date (law 3) → keep the **newest
content-dated artifact per day across all chains** → emit `source-read`
events. Vault archives go stale (proven repeatedly, per the dry-run's
ground truth); cron dirs are the live chain — the per-day newest-across-
chains rule makes the cron copy win when both exist, with the winning
chain recorded in `external_ref` as `<chain>:<path>#<content-hash>`.

**[impl] Dedupe is the constraint, not code.** Ingest is idempotent by
construction: a re-run hits `UNIQUE(source_id, kind, external_ref)` and
writes nothing. There is no "already seen" table and no upsert-with-side-
effects — the unique constraint is the entire dedupe mechanism.

**[impl] Freshness ≠ success (law 1).** `last_ok_read_ts` advances only
when an artifact passes the source's success predicate — never on mtime,
never on file presence. Adapter failures (glob misses, parse crashes,
predicate failures) are exceptions, not staleness: they write a
`source_read_failure` event (registered in `EXECUTION.md` §7) and leave
`last_ok_read_ts` unmoved, so "source dead" and "adapter
broken" land as different coverage lines.

**[impl] Content-derived dates or refusal (law 3).** `ts` comes from the
artifact's day headers, never from paths or mtimes. An artifact with no
parseable content date is skipped with a failure event. There is no
fallback heuristic — a wrong date is worse than a missing one.

Adapters run on schedule and pull (never FS-watch): dev servers beside
the vault need `WATCHFILES_FORCE_POLLING=true` on NFS (02 §1), so nothing
in the framework may assume reliable file events.

**Tests**

- Fixture tree with the same day present in a vault archive and cron
  output (cron content newer) → exactly one event, chain = cron in
  `external_ref`
- Two consecutive full ingest passes → identical event counts (zero new
  rows on the second)
- Artifact failing the success predicate → `last_ok_read_ts` unmoved,
  failure event written
- Artifact with no day header → skipped + failure event; mtime set to
  today does not rescue it
- Path date ≠ content date → `ts` follows content

**Done when**

- [ ] Idempotence proven by double-ingest, not by reading the code
- [ ] freshness≠success proven with a predicate-failing artifact present
- [ ] Registry rows exist for all four P1 sources, globs resolvable on olympus
- [ ] Second independent pass over the dedupe/failure logic (02 §6)

**If it fails**
Double events mean `external_ref` isn't capturing chain + artifact
identity — fix the ref format before anything else; the constraint does
the dedupe only if the ref is right. Bad rows already ingested are
superseded by compensating events (T4) — never UPDATE, never DELETE.

**Commits**
`chore(T1.1): start adapter-framework — baseline green` → `feat(T1.1): source registry wiring and chain-following ingest engine`

---

### T1.2 — Day-report adapter

**Reads:** 02 §2 laws 1–3 · 03 feature 1 (yesterday's recap) · dry-run ground truth (report locations)
**Depends on:** T1.1
**Parallel with:** T1.3, T1.4, T1.5
**Tier:** T2

**Build**

**[impl] Source row `day-report`.** Cron globs: the Noesis profile's
output dir (`~/.hermes/profiles/noesis/cron/output/**`, narrowed to
day-report files). Vault globs: `Noesis/<yyyy>/<mm>/<yyyy-mm-dd>.md` —
the archive chain, which goes stale and loses to cron per T1.1's rule.
Class `pipeline`. **Success predicate: a day header present** (`# YYYY-MM-DD`
heading in the artifact body) — a report without its day header is not a
successful read, whatever its mtime says (law 1).

**[impl] September backfill is just a wider window.** The dry-run proved
the gap weeks have cron-chain artifacts to find. Backfill = one ingest
pass over the full chain history, not a separate mechanism. After it, Sept
coverage lines show what actually exists — including the W36 straggler
(`2026-09-04.md`), which belongs to *its* week, not W37 (law 7: missing
days are data).

**[impl] Attribution rides the payload.** Day reports are narrated by
Noesis — the event payload carries the attribution so the Plaza's
yesterday-recap renders its plum agent line (04 `/`).

**Tests**

- Report with day header → event + `last_ok_read_ts` advances
- Header absent/FAILED → predicate fails, failure event, ts unmoved
- Backfill over September fills gap weeks from the cron chain; re-run
  adds zero events (T1.1 dedupe holds at real scale)
- Same day in vault archive + cron → one event, cron chain wins

**Done when**

- [ ] September backfill completes; Sept coverage counts match a manual
      listing of the cron dir
- [ ] Success-predicate boundary proven both sides (header present/absent)

**If it fails**
If Sept stays empty after backfill, the glob is wrong, not the data — the
dry-run already located real artifacts on disk. Fix the glob against a
real directory listing before touching the parser.

**Commits**
`chore(T1.2): start day-report-adapter — baseline green` → `feat(T1.2): day-report adapter with September backfill from the cron chain`

---

### T1.3 — Week-plan adapter

**Reads:** 02 §2 laws 2–3 · 03 feature 1 (today's plan line) · dry-run finding 3 (plan-missing)
**Depends on:** T1.1
**Parallel with:** T1.2, T1.4, T1.5
**Tier:** T2

**Build**

**[impl] Rolling files become dated artifacts from P1 on.** `Week Plan.md`
and `Task List.md` are single rolling files — rewritten in place, no
history. From P1 forward, every observed *content revision* (content-hash
change on ingest) snapshots as its own `source-read` event with
`external_ref = <source>:<revision-hash>`. Where the revision carries day
headers, those are its `ts` (law 3); a revision without one records the
revision honestly without faking a content date. This is the mechanism the
P4 plan-vs-actual section will stand on.

**[impl] September renders plan-missing — asserted, not fixed.** The
rolling file keeps no history, so every pre-P1 week has no plan snapshot
(dry-run finding 3). The adapter must not synthesize plan history from
chat logs, memory, or file mtimes. Coverage for Sept renders `plan:
missing`, and the exit test (T1.7) *expects* that render.

**[impl] Plan-line extraction.** The current revision's per-day plan rows
extract into the payload the Plaza's plan strip consumes (teal left-rule
card, 04 `/`).

**Tests**

- Two successive edits to `Week Plan.md` → two revision events, ordered
- Identical re-read (no content change) → zero new events
- A September week query → `plan: missing`, never zeros, never synthesized
- Plan-line extraction returns the current revision's rows

**Done when**

- [ ] Revision snapshotting proven live (edit the file, ingest, compare)
- [ ] Sept renders plan-missing exactly per dry-run finding 3

**If it fails**
The failure temptation is backfilling plan history to make the render
look fuller. Don't. plan-missing is the honest render and the phase exit
test requires it; the fix for "no plan history" is *from P1 on*, which
this task is.

**Commits**
`chore(T1.3): start week-plan-adapter — baseline green` → `feat(T1.3): week-plan adapter — rolling revisions as dated artifacts`

---

### T1.4 — Tasklist adapter

**Reads:** 03 feature 1 (tasks due today incl. overdue actives) · 03 feature 2 (day-one content)
**Depends on:** T1.1
**Parallel with:** T1.2, T1.3, T1.5
**Tier:** T2

**Build**

**[impl] Parse rows, compute due/overdue from content.** Task List.md rows
parse into task records carried by `source-read` events (row identity in
`external_ref`, so revisions re-ingest without dupes). Due dates come from
row content (due fields / day-header grouping — law 3, never mtime).
Overdue = due < today and not done.

**[impl] Read-only in P1.** The adapter feeds the Plaza's tasks-due line.
Resolutions (done/roll/drop) are P2 inbox writes — no write path exists in
this phase (law 6).

**Tests**

- Due/overdue computed correctly from fixture rows, boundary day included
- Rolling-file revision refreshes rows with zero duplicates
- Unparseable row → skipped + failure event; the run never crashes on it

**Done when**

- [ ] The two known overdue Task List actives (03 feature 2, day-one
      content) appear in the plaza data feed

**If it fails**
Parsing stays lenient: a row that doesn't parse is a failure line, never a
blocked ingest run — the file is hand-edited markdown and will stay messy.

**Commits**
`chore(T1.4): start tasklist-adapter — baseline green` → `feat(T1.4): tasklist adapter with content-derived due dates`

---

### T1.5 — Kanban adapter (read-only)

**Reads:** 02 §4 (kanban: read-only SQLite globs, board dirs globbed never hardcoded) · 02 §1 (read-through rule)
**Depends on:** T1.1
**Parallel with:** T1.2–T1.4
**Tier:** T2

**Build**

**[impl] Globbed boards, ro connections.** Board directories are discovered
by globbing the kanban data root — never a hardcoded list (02 §4; profiles
and boards come and go). Each board's SQLite opens read-only
(`file:...?mode=ro` + busy timeout). No write statement exists anywhere in
the adapter; that's grep-able and stays that way.

**[impl] Presence, not bulk.** Heavy board content stays read-through (02
§1); the adapter ingests card/column **presence and arrival** as
`source-read` events (`external_ref = board:card:state-hash`). A parked-
on-you card becoming queryable is the P2 inbox's kanban half — this task
makes the data exist.

**Tests**

- New card → one event; unchanged board on re-ingest → zero events
- A board dir created at runtime is picked up by the glob (no restart)
- The ro connection refuses a write attempt (asserted in test)

**Done when**

- [ ] Board enumeration proven glob-driven (fixture board discovered, not listed)
- [ ] Zero write paths to kanban SQLite, grep-verified

**If it fails**
`database is locked` means the connection isn't ro/timeout-safe — fix the
connection string. Never copy the board file as a workaround; that breaks
chain-following and forks the chain the events point at.

**Commits**
`chore(T1.5): start kanban-adapter — baseline green` → `feat(T1.5): read-only kanban adapter over globbed board SQLite`

---

## Part B — Coverage + Plaza

### T1.6 — Plaza on the coverage view (read-only)

**Reads:** 02 §2 laws 4, 7, 8 · T0.2 Section 3 (the view this task consumes) · 04 `/` + global chrome · 01 §1–§2 (tokens; surfaces L0/L1/L2) · 09 §2#1 · EXECUTION Part I §4
**Depends on:** T1.1–T1.5
**Parallel with:** —
**Tier:** T1 (client) / T2 (view)

**Build**

**[impl] The `coverage` view is consumed here, never redefined.** The
view ships in migration 001 (T0.2, which fixes its columns and its five
render states — `alive` · `dead` · `paused` · `behavioral-dormant` ·
`uninstrumented`); this task is its first real consumer and adds no
second tally. Any coverage arithmetic in an adapter, route handler or
component is a defect — the standing grep (EXECUTION §4) is extended in
this task to flag `days_fresh\|of last 7` arithmetic outside the view's
own query module. If a P1 source needs a fact the view doesn't expose,
the view is amended in a forward migration (002) and every consumer
inherits it — never worked around locally. Missing days render as
missing, never zeros (law 7).

**[impl] Tenancy is computed here (law 4).** Strip promotion/demotion
rides the coverage view: `behavioral` demotes after 14 silent days,
re-earns at ≥3 fresh days in trailing 7 (judged on ingest timestamps);
`pipeline` demotes on silence and re-earns the moment the success
predicate passes. Never fires on `paused`. Demoted strips collapse to a
one-line coverage row — reachable in ≤2 taps (law 8), never an attic.

**[impl] The Plaza renders fully when sources are dead (04 `/`).** Surface
stack per 01 §2: **L0 matte skin** (`#0B0B0C` + static grain ≤2%) with
torn paper *under* it — reading surfaces are the L2 `TornSheet` revealed
where the black tears away (dark fringe framing light paper, per the
placement ruling); **L1 glass only on interactive elements** (the plan
card's glass fill; one blurred layer per screen max). Hue law (01 §4):
teal = your-action surfaces — the plan strip's teal left-rule, the wake
habit chip, the `＋ capture` FAB (the one FAB, bottom-right); plum =
agent lines (day-report attribution "narrated by Noesis", agent row);
paused-amber (`#D29922`) staleness hints ("plan stale 38 days ⚠");
coverage lines mono in muted. Status dots only in the three fixed state
pairs — never accents.

**[impl] Read-only era.** Pull-to-refresh only, no polling spinners (04).
The capture FAB renders per the 04 spec but inert in P1 — muted/disabled
state, no dead-end tap; it activates with the P2 write path. No write
calls exist on this screen (law 6: P1 extends no write path).

**Tests**

- Coverage-view fixtures for all five states (T0.2's set) render
  distinctly; a source with missing days renders "N of 7" with gaps as data
- Grep: no coverage arithmetic outside the view's query module — the
  Plaza reads states, it never computes them
- The September shape (every source dead/missing/uninstrumented) renders
  the full Plaza — no empty panel, no zeros
- Greps green (EXECUTION Part I §4): ≤1 `backdrop-filter` per route;
  accent hex only inside `theme.css`; liveness colors only the three
  fixed state pairs
- A demoted strip reachable from the Plaza in exactly 2 taps

**Done when**

- [ ] Plaza renders the September-shaped fixture with honest coverage lines
- [ ] All five coverage states proven from T0.2's view data, not hardcoded or recomputed
- [ ] Blur/accent/liveness greps pass in CI

**If it fails**
If a strip renders zeros for a lapsed month, the view is joining against a
calendar that has no rows — missing days are data (law 7). Fix the view,
never the render. If dormancy renders red, the tint-valence law is broken:
red is reserved for system failure a human must fix (01 §1).

**Commits**
`chore(T1.6): start coverage-plaza — baseline green` → `feat(T1.6): read-only Plaza on the shared coverage view`

---

## Part C — Phase exit

### T1.7 — Exit test: September backfill

**Reads:** 02 §5 P1 row · EXECUTION Part I §5 (two-pass), Part II (P1 exit) · dry-run findings 2–3
**Depends on:** T1.2, T1.3, T1.6
**Parallel with:** —
**Tier:** T2 (any fix lands in adapter/view code; re-ingest is free)

**Build** nothing new. **Run the phase's exit criteria against live data
on olympus and record the outputs** (02 §5 P1 row):

1. **Sept gap backfill renders.** Ingest the full cron chain; September
   day-report coverage lines populate from real artifacts (incl. the W36
   straggler staying in W36). Plan-vs-actual for September renders
   **plan-missing** — dry-run finding 3 is the expected output, asserted
   verbatim, not worked around.
2. **Empty-dir → coverage lines, no crash.** Point one source glob at an
   empty/absent directory. The adapter logs the absence as a failure/empty
   read; the coverage view renders a line; nothing 500s.
3. **"Yesterday" resolves from Oct-1 artifacts.** With the first live-chain
   artifacts content-dated Oct 1, the Plaza's yesterday-recap resolves the
   newest content-dated artifact ≤ yesterday — a real render from Oct 1,
   no blank panel, no mtime-derived date (law 3).

**Tests** — the recorded outputs above are the test artifacts; keep the
command transcripts next to this doc's tick-marks.

**Done when**

- [ ] September renders: real report counts, plan-missing per finding 3
- [ ] Empty-dir probe renders a coverage line; zero crashes server-side
- [ ] Yesterday-recap resolves from Oct-1 artifacts on the live Plaza
- [ ] Second independent pass (different greps, cold re-read next day)
      confirms all three — the author never solo-declares the phase done
      (EXECUTION Part I §5)

**If it fails**
Match symptom to tier: adapter/view bug → fix, redeploy (T2), re-run —
ingest is idempotent so re-runs are free. Wrong rows already ingested →
superseding events (T4), never DELETE. A wrong September render that
"looks better" after massaging data is a defect, not a fix.

**Commits**
`chore(T1.7): start sept-backfill-exit — baseline green` → `docs(ops): P1 exit criteria run and recorded — September renders honestly`
