# Phase P3 — Strips: reading queue · nutrition · habits

**Size M · ~11–12 nights · proves: strips render real personal data honestly,
including dormant data.**

P3 is the first phase where the app shows you **yourself** — papers the
digest sent you, meals you logged in August, taps you have made since P2.
Its working condition: most of that data is old or absent. The strips must
render absence as plainly as presence (02 §2 law 7), demote without
shaming (02 §2 law 4, muted tier per 02 §6), and never let an estimate
dress as a measurement (02 §2 law 11).

**Entry** — P2 exit met (airplane-mode tap survives force-stop; fuzzel
capture triaged <5 min). Decisions taken before starting:

1. **The seed count is a rule, not a number.** The live Zetesis chain
   measured 2026-10-09 yields 70–88 uniques depending on whether
   Tools-section arXiv citations count, so the binding definition is the
   extraction rule in T3.1 and the tested invariants are **zero dupes +
   one provenance edge per row**, never a round number. `02 §5`'s P3 row
   carried "80 unique papers"; it was amended to the extraction rule
   2026-10-09 (see that doc's `status:`), so this is no longer an
   override — plan and build agree.
2. **Ratings stage only.** Rating + `staged_ts` live in SQLite from P3;
   the `digest_prefs.md` write-back is P5's declared experiment with its
   kill metric (03 #5). P3 writes no vault file (02 §2 law 6).
3. **`uninstrumented` adopted as the fifth render state** (W37 dry-run
   finding #2): a source with no artifacts ever renders muted "not yet
   instrumented", never alarms, Dataview-visible.

**Read before starting:** `02-architecture.md` §2 laws 1–5, 7, 8, 11 ·
§3 schema (`reading_item`, `habit`/`habit_tap`) · §5 P3 row ·
`03-feature-list.md` features 3–5 · `04-screens-pwa.md` plaza mock,
`/reading`, `/meals` · `09-weekly-review-format.md` §2#4 + gates 2, 4 ·
`dry-run/2026-W37-dry-run.md` findings 1–2.

---

## The structural gate

**One tenancy/coverage engine, three strip consumers.** If each strip
hand-rolls its own dormancy logic, P4's eight review sections will each
hand-roll it too, and dormancy will disagree between the plaza and the
review — the exact drift the shared `coverage` view (02 §2 law 7) exists
to prevent. T3.4 makes it a test, not a hope: reading (pipeline) and
nutrition (behavioral) must demote and re-earn through the same module,
differing only by `source.class` config. If a fourth strip in P4 needs a
new branch in that module, record it — the same leak will recur in every
later consumer.

---

## Task graph

```
T3.1 reading adapter + digest seed ────────┐
                                           │           ┌── T3.5 /meals ──┐
T3.2 Hygeia chain re-ingest ───────────────┼── T3.4 ───┤                 ├── exit
                                           │  dormancy └── T3.6 projects ┘
T3.3 habits stats (rolling windows) ───────┘  engine
```

T3.1 ∥ T3.2 ∥ T3.3 (independent sources, each ~2 nights). T3.4 (~2
nights) needs all three classes live to prove the shared engine. T3.5
(~1–2 nights) needs T3.2's rows + T3.4's demoted rendering; T3.6 (~2
nights) needs T1.5's board events + the same engine.

---

### T3.1 — Reading-queue adapter + digest seed ingest

**Reads:** 02 §2 laws 1–3 · 02 §3 (`reading_item`) · 03 #5 · 04 `/reading`
**Depends on:** P2 exit
**Parallel with:** T3.2, T3.3
**Tier:** T2 (adapter) · bad seed rows are entity-table drift — fix parser,
re-derive, never DELETE (EXECUTION §1)

**Build**

`source` row `zetesis-digest`: class `pipeline`; cron glob
`~/.hermes/profiles/zetesis/cron/output/*.txt` (21 artifacts, Aug 10–31);
success predicate = edition day-header present AND body ≠ FAILED (law 1:
freshness ≠ success).

Chain-following seed (law 2): two jobs wrote Aug 10 (`30e5f10002f2`,
`b5b0ec782dfe`) — ingest takes the **newest content-dated artifact per
day across chains**: 21 files → **20 winning editions** (no editions Aug
15–16). Content date comes from the edition header, never filename or
mtime (law 3); same-day collision resolves by run stamp, recorded in
`external_ref` alongside the chain — the event `ts` stays the content
date.

**[impl] extraction rule:** a paper is any `**Title** … arXiv abs link`
entry (Papers and Tools sections); dedupe key = normalized arXiv ID.
Cross-day repeats collapse — the queue holds uniques only. Each winning
edition emits one `source-read` event; each seeded paper one app-write →
`reading_item` (status `new`, rating NULL, `staged_ts` NULL per 02 §3).

Status flow new→skimmed→digested→dismissed is `reading_status` app-write
events first (single-writer); 1–5 rating taps emit `rating_staged` and
set `staged_ts` — nothing leaves SQLite in P3 (decision 2). Both kinds
are registered in `EXECUTION.md` §7.

**Tests** — `app/tests/adapters/test_reading_seed.py`

- 21 files → 20 `source-read` events; the Aug 10 winner is
  `b5b0ec782dfe_20260810_120720` (later run, same content date)
- **Zero duplicate arXiv IDs in the queue**; every row provenance-linked
  to its edition event
- A FAILED-header artifact yields no event, no rows (law 1)
- Re-ingest inserts nothing (idempotent via
  `UNIQUE(source_id, kind, external_ref)`)
- Status transition and rating-tap each emit an event before the row
  changes

**Done when**

- [ ] 20 OK editions → every unique paper the extraction rule yields,
      zero dupes, one provenance edge per row, from live artifacts only
      (02 §5 P3 exit as amended 2026-10-09)
- [ ] `/reading` renders the queue (title, edition date, arXiv tag) with
      the digest banner **paused** from the recorded `job_paused` event
      (job deleted 2026-10-09, actor human — law 5), not a hardcoded date

**If it fails**

Dupes mean the dedupe key is not the normalized ID — titles drift between
editions, IDs do not. If counts look wrong, check the per-day winner rule
before the parser: letting mtimes into date selection double-counts
same-day jobs.

**Commits**
`chore(T3.1): start reading-seed — baseline green` →
`feat(T3.1): zetesis digest adapter, 20-edition seed, zero-dup queue`

---

### T3.2 — Nutrition strip: Hygeia chain re-ingest

**Reads:** 02 §2 laws 2–4, 7, 11 · 03 #4 · `Hygeia/README.md`
**Depends on:** P2 exit
**Parallel with:** T3.1, T3.3
**Tier:** T2

**Build**

`source` row `hygeia-meals`: class `behavioral` (law 4); globs: vault
`Hygeia/**/*.md` + `Hygeia/log.csv` + `Food Log/**` (empty today) + cron
glob `~/.hermes/profiles/hygeia/cron/output/**` (empty today — declared
anyway, law 2). Success predicate: a day section with ≥1 parsed meal row.

**[impl] parser decisions:**

- Content dates from `## Ddd Mmm d` day headers only (law 3). Ground
  truth trap: `august/week4.md` contains September days — folder and
  filename lie, headers don't.
- A `—` day-total placeholder is absence, never zero (law 7): the
  week2–4 skeletons (Aug 17–Sep 6) parse to **zero** meal rows.
- Each meal row → `source-read` event + `meal` row (kcal/P/C/F) with a
  provenance edge to its week-file line; all values are agent estimates
  (law 11) carrying food_db provenance.
- Day totals are recomputed from rows — **rows are canonical** (03 #4);
  a stored-stated mismatch is flagged, never silently reconciled.
- `log.csv` weight rows ingest as measured data points (no `~`, dated,
  never rendered as "current"); one row exists: 2026-08-10 · 80.0 kg.

**Tests** — `app/tests/adapters/test_hygeia_reingest.py`

- Fresh-DB full ingest: meal events dated **Aug 10–16 ONLY** — 7 covered
  days, 42 meal rows, zero events before or after (02 §5 P3 exit)
- week2–4 skeletons yield zero meal rows (the `—` placeholder test)
- Day total ≠ row sum → mismatch flag; rows win
- Every kcal/P value carries estimate provenance; the weight row carries
  none (law 11, both directions)
- Second full ingest: zero new events
- Coverage view today: `meals 0 of 7 · last logged Aug 16`

**Done when**

- [ ] Re-ingest yields meals Aug 10–16 ONLY (02 §5 P3 exit)
- [ ] Strip renders demoted per tenancy law — muted, never red (with
      T3.4; the exit's second half)

**If it fails**

If September dates appear, the parser trusted paths for dates — only day
headers are truth (law 3). If Aug 10–16 comes out empty, check the row
regex against the real header (`| Meal | Item | Qty | kcal | P (g) | C (g)
| F (g) |`) — a parser written from imagination fails on `P (g)`.

**Commits**
`chore(T3.2): start hygeia-reingest — baseline green` →
`feat(T3.2): behavioral-class Hygeia adapter, Aug 10–16 only, rows canonical`

---

### T3.3 — Habits stats: rolling windows, no streaks

**Reads:** 09 §2#4 + gates 2, 4 · 02 §3 (`habit`, `habit_tap` payload
`method`) · 03 #3 · 02 §2 law 7
**Depends on:** P2 exit (wake taps exist)
**Parallel with:** T3.1, T3.2
**Tier:** T2

**Build**

`GET /api/habits/stats?window=7` — per habit: `{met, of, recall_share,
recall_majority}`. Everything rolling-window, nothing cumulative:

- `met` = days in the trailing 7 with a tap inside the habit's window
  (wake: target ±30 min); the denominator is always 7. Silent days are
  data and show in the coverage line, never zeros in a run (law 7).
- Method comes from the `habit_tap` payload (`'tap' | 'recall'`); recall
  taps count but mark the window.
- Recall-majority window → the figure renders with `~` (09 §2#4);
  tap-majority renders bare (evidence floor, 09 gate 2).
- **No streak computation exists**: no consecutive-day logic anywhere,
  and banned vocabulary ("streak", "scoreboard", "cheat") is
  string-matched out of every rendered string (09 gate 4).

**Tests** — `app/tests/api/test_habits_stats.py`

- ±30 min boundary: 29 min off counts, 31 does not
- The window slides: day-8 changes the denominator, never a stored
  counter
- 4 in-window taps + 1 recall → `4 of 7`, `recall_majority` false;
  recalls ≥ half → true → `~` in the rendered chip
- Lexical gate: rendered payloads grep-clean for banned vocabulary
  (string-match test, 09 gate 4)
- Grep gate: no `streak|consecutive` in `app/`; the v0 descope
  (taps-only) is a config flip, not a new code path

**Done when**

- [ ] "wake within ±30 min: 4 of 7" renders from real P2 taps
- [ ] Zero banned vocabulary, zero consecutive-day logic

**If it fails**

If the number behaves like a streak, the denominator became "days since
first tap" — it is always the trailing 7. A `7 of 7` that survives a
missed day is a bug, not a feature.

**Commits**
`chore(T3.3): start habits-stats — baseline green` →
`feat(T3.3): rolling-window habit stats, tap/recall honesty, no streaks`

---

### T3.4 — Dormancy rendering pass (the shared engine)

**Reads:** 02 §2 laws 4, 5, 7, 8 · 02 §6 (muted-never-red invariant) ·
01 §1 state colors · 09 §2#1 · W37 dry-run findings 1–2
**Depends on:** T3.1, T3.2, T3.3
**Parallel with:** —
**Tier:** T2

**Build**

One engine consumed by all three strips (and P4's review later): the
shared `coverage` view (law 7) plus a tenancy evaluator keyed on
`source.class`:

| state | trigger | re-earn | rendered |
|---|---|---|---|
| behavioral demotion | 14 silent days | ≥3 fresh days in trailing 7 (ingest timestamps) | muted tier + remediation hint ("log a day to re-earn"); **never red** (02 §6) |
| pipeline demotion | silence | success predicate passes once — instant | muted + repair hint |
| paused | recorded `job_paused`, actor human | human only | amber, law 5; **tenancy never fires on paused** (law 4) |
| `uninstrumented` | no artifacts ever (fifth state, W37 #2) | first artifact | muted "not yet instrumented", Dataview-visible, never alarms |

Two-tap law (law 8): demotion shrinks a strip, never buries it — ≤2 taps
from the plaza at all times.

**[impl]** no strip computes its own liveness: tenancy/coverage logic
exists in exactly one module; strips render its output (grep-enforced).

**Tests** — `app/tests/render/test_dormancy.py`

- Behavioral fixture: silent day 13 → active; day 14 → demoted muted; 3
  fresh days → re-earned — all automatic, no human actor
- A demoted behavioral row never carries the dead hue (token-level
  assert; 02 §6, 01 §1 dormant = muted gray)
- Pipeline: silent → demoted; one predicate pass → alive on the same read
- Paused: amber + recorded actor; demotion suppressed (law 4)
- A source with zero artifacts → `uninstrumented`, muted, present in the
  Dataview export
- Reading + nutrition demote through the same module (import-graph
  assert — the structural gate)
- Demoted nutrition renders `0 of 7 · last logged Aug 16 · log a day to
  re-earn` — the W37 dry-run render, now live

**Done when**

- [ ] Demoted strip renders muted + remediation hint (02 §5 P3 exit,
      second half)
- [ ] `uninstrumented` live for pre-P3 sources (email is P5, goals P4+)

**If it fails**

If a dead digest renders red AND a dead meals strip renders red, the
engine lost the class split. Behavioral red is the exact failure 02 §6
bans: red is for system failure a human must fix — a skipped meal is not
one.

**Commits**
`chore(T3.4): start dormancy-engine — baseline green` →
`feat(T3.4): shared tenancy/coverage engine, five render states, muted-never-red`

---

### T3.5 — /meals screen

**Reads:** 04 `/meals` + plaza · 01 §1, §4 · 02 §2 laws 7, 11 · 03 #4
**Depends on:** T3.2, T3.4
**Parallel with:** T3.6
**Tier:** T1

**Build**

Day cards newest-first from `meal` rows; fold-out full-day table (04).
Every kcal/P figure carries `~` — agent estimates with food_db
provenance (law 11). Weight renders **without** `~`, dated, never as
"current". "Log a meal" → `/capture` prefilled `#meal` (04).

**[impl] protein vs kcal differentiate by ink weight only** — bold vs
regular muted mono (01 §4: data differentiates by weight and mono
styling, never hue). No accent token touches a number on this screen.

Coverage line on-screen from the shared view (law 7); demoted state
renders per T3.4 (muted + hint). Today the screen's default state IS
dormant August data — that is the phase's proof surface, not a defect.

**Tests** — `client/src/routes/meals.test.tsx`

- Every estimated figure renders `~`; weight never does
- Protein vs kcal differ by `font-weight` only — grep: no `--accent`
  token inside the meals route bundle (01 §4)
- Fold-out rows == spine rows 1:1; day total == row sum, else the
  mismatch flag renders (rows canonical, 03 #4)
- Coverage line renders even when demoted — never an empty screen
  (law 7)
- "Log a meal" deep-links `/capture#meal`

**Done when**

- [ ] Weight-only differentiation proven by grep (01 §4)
- [ ] Dormant August data renders honestly — muted, `~`-marked, dated

**If it fails**

T1 republish. If a number shows up in accent teal, the hue law broke in
the one screen built to prove it — fix the token, not the test.

**Commits**
`chore(T3.5): start meals-screen — baseline green` →
`feat(T3.5): /meals day cards, weight-only data ink, demoted-first rendering`

---

### T3.6 — Projects board + derived board health

**Reads:** 07 §17 (projects; derived-never-estimated progress; parked
renders muted) · 07 §19 amendment (a) (`project_id` rides event payloads;
no frozen columns) · 02 §4 (kanban: globbed board dirs, read-only) ·
02 §1 (read-through rule) · 02 §2 law 5 (human-only parked), law 8
(two-tap) · 04 `/projects` · 01 §1 (state pairs; muted tier)
**Depends on:** T1.5 (the kanban adapter's presence events), T3.4 (the
shared dormancy/coverage engine this screen renders through)
**Parallel with:** T3.5
**Tier:** T1 (client) / T2 (API)

**Build**

`/projects` as three columns — **active · parked · done** (04) — plus
`/projects/[id]` detail. The `project` table already exists from
migration 001 (T0.2 Section 2: name, status CHECK, `board_glob`,
`notes_path`, ts); this task fills and renders it.

**[impl] Progress is derived, never entered** (07 §17). No percentage
field exists anywhere. A project row shows: last spine activity, open vs
resolved linked work, and — when `board_glob` is set — live board health
from T1.5's kanban presence events through T3.4's engine. A project with
no board renders **without** a health line, never with a fabricated one.
Any stored progress number is a defect; grep for it.

**[impl] Linked work derives by payload query** (07 §19 amendment (a)).
`project_id` rides event payloads (`task_seen`, loop transitions,
`capture_triaged`), never a frozen-table column (02 §6). `/projects/[id]`
builds its linked-work and activity views by querying payloads; promotion
to a column happens only on measured query pain, and the measurement goes
in the phase's two-pass notes if it ever happens.

**[impl] `parked` is a human-only status** (law 5, extended by 07 §17).
A `project_status` event with actor=human is the only way into or out of
`parked`; the app never parks anything, and no derivation writes this
field. A parked project renders its **parked-since date in the muted
tier — never red, never amber** (02 §6 muted-never-red; 07 §17: lapsed
plans are information). Rows are neutral with board **state dots**; teal
is reserved for your actions (01 §4).

Two-tap law (law 8): `/projects` is reachable from the plaza's More
sheet, and the plaza carries **no project content at all** (07 §17:
on-demand only).

**Tests** — `client/src/routes/projects.test.tsx` + `app/tests/api/test_projects.py`

- A parked project renders muted with its parked-since date; token-level
  assert that no state hue and no accent touches the row (02 §6)
- `parked` cannot be written without a human-actor `project_status`
  event — repo-level gate, same shape as T2.5's single-writer gate
- Board-linked project: T1.5 fixture events → health line with the
  correct state dot; **unlinked project renders no health line** (no
  fabricated health)
- Progress: grep finds no stored progress/percentage field; the detail
  view's counts recompute from payload queries on each read
- Linked work resolves by payload query for a fixture carrying
  `project_id` in `task_seen` payloads — zero frozen-table columns added
- Board health demotes through T3.4's engine, not a local branch
  (import-graph assert — the phase's structural gate)
- Plaza renders zero project content

**Done when**
- [ ] Parked renders muted with its date — never red, never amber
- [ ] Board-linked health comes from T1.5 events through T3.4's engine;
      unlinked projects show none
- [ ] No stored progress anywhere; linked work derives by payload query

**If it fails**
A fabricated health line on an unlinked project means the renderer
defaulted instead of omitting — absence is data (law 7). If parked ever
renders amber, the status was read as a warning: parked is a human
decision, not a system state. If the detail view needs a column to be
fast enough, record the measurement before adding one — 07 §19 (a)
permits promotion only on measured pain.

**Commits**
`chore(T3.6): start projects-board — baseline green` →
`feat(T3.6): projects board, derived board health, human-only parked`

---

## Phase exit

- [ ] Re-ingest drill: meals Aug 10–16 ONLY; strip renders demoted muted
      (02 §5 P3 row, both halves)
- [ ] 20 OK editions → unique papers, zero dupes; provenance edges
      resolve row → edition event
- [ ] Habits: rolling windows only, `~` on recall-majority, lexical gate
      clean
- [ ] Dormancy engine: five render states, muted-never-red,
      `uninstrumented` live, one shared module (structural gate)
- [ ] `/meals`: weight-only ink, `~` on every estimate
- [ ] `/projects`: parked muted with its date, board health derived
      through T3.4's engine, zero stored progress (T3.6)
- [ ] Second independent pass over every claim above (EXECUTION §5 —
      different grep, cold re-read); the author never solo-declares P3
      done

**Rollback** — T2 throughout (adapter/API code, per EXECUTION phase
table). A wrong meal event is T4: compensating event, never DELETE
(EXECUTION §1). Wrong seed rows are entity drift: fix, re-derive.

**Descope** (EXECUTION Part IV): projects board → habits stats (v0
taps-only chips).
**Never cut:** the nutrition re-ingest exit test — it is the phase's
reason to exist.
