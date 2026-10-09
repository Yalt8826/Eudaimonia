# Execution Plan — Phases, Tests, Exit Criteria, Rollback

The master schedule. `docs/plan/v1/02-architecture.md` settles **what**
(the laws, the frozen schema, the phased shape); its §5 build order is the
skeleton this document fleshes out into task-level phases. One doc per
phase in this directory; each phase has **Ships · Entry · Exit · Rollback
· Descope**, each task has **Reads · Depends · Tier · Build · Tests · Done
when · If it fails · Commits** (grammar defined in README.md).

**Estimates assume one developer with an evening slot**, ~5 focused
hours/week-equivalent spread across nights — Yashas builds between college
and 1–2am. Durations in nights; double them if a phase is touched on
weekends only.

---

## Part I — Ground rules

### 1. The spine is append-only; corrections are events

No `UPDATE` on `event` rows, no `DELETE` as correction. A wrong entry is
superseded by a new event (kinds per schema v0.1/v0.2); entity tables are
denormalized indexes that may be rebuilt from the spine at any time.
Consequence: **rebuild drills are safe by construction** — P6's
backup/restore drill re-derives every entity table from `event` and gets
byte-equal rows or the phase does not exit.

### 2. Rollback tiers

| Tier | Mechanism | Time to recover | Applies to |
|---|---|---|---|
| **T1** | Regenerate/re-export (SPA rebuild, doc re-export) | minutes | all client code, static plane files |
| **T2** | Redeploy previous API (git revert + uvicorn restart) | minutes | `app/` server code |
| **T3** | Restore SQLite from backup file | hours | any data-plane damage |
| **T4** | Compensating event | append-only | wrong ingest, bad write-back |

The static plane is stateless (T1, free). The data plane's only state is
`eudaimonia.db` + the vault (T3). **No tier exists for "migrate backward"**:
schema v0.1 is frozen and v0.2+ is additive-only (02 §6), so every
migration is forward; a rollback leaves a newer empty table behind, which
costs nothing.

### 3. Feature gating is by phase, not flags

ServGrid needed per-role server flags for fourteen live users. Eudaimonia
has one user and three thin clients; the pause mechanism is the phase
boundary itself. The two gating mechanisms that DO exist:

- **`agent_invoke` chokepoint** (02 §2 law 12): every agent call goes
  through it; its `success_predicate` is the gate that keeps failure from
  reading as success (02 §6). Nothing else may spawn hermes.
- **Public-plane allowlist** (02 §6): the tunnel serves exactly
  `index.html`, manifest, SW, `assetlinks.json`. Adding a public route is
  a build-blocking defect; the allowlist lives in one config file and is
  grep-able.

### 4. One blur layer, tint-taxonomy, hues — enforced by grep

Every UI task carries the same review greps: `backdrop-filter` count ≤1
per screen route, accent-hex strings only inside `theme.css`, liveness
only via the three state colors (law binding from 01 v2). CI-able from P0
on; the P0 task T0.6 ships the linter config.

### 5. Two-pass on load-bearing exits

Phase exit claims are verified by a second pass (02 §6): different grep,
different seat, or at minimum a cold re-read the next day. The author
never solo-declares a phase done.

### 6. Git mechanics (repo home + GitHub push path, verified 2026-10-09)

Prior-project precedent is cited by name below (ExpenseTrackerApp, Tyche,
medintel — earlier builds on this machine). Those are the evidence for
each rule, not reading assignments; every rule is restated here in full
so no cross-project lookup is needed.

- **Repo home is `/mnt/storage/Study/Eudaimonia/` (fuseblk).** The mount
  presents every file as mode 777, so T0.1 sets
  `git config core.fileMode false` before the first commit — without it
  every task drowns in phantom mode-change diffs (same symptom as
  ExpenseTrackerApp, different cause: there it was NFS, here it is the
  fuseblk mount's uniform permissions). Verified by `ls -la` on this tree
  2026-10-09.
- **No SSH to GitHub from this machine.** The remote is HTTPS; pushes ride
  athena's gh credential helper:
  `git -c credential.helper='!gh auth git-credential' push https://github.com/Yalt8826/<repo>.git <branch>`
  (proven live: Tyche `18b648a`, 2026-10-09). Every task's commit-pair push
  uses this path; a plain `git push` fails with publickey.
- **No history rewrites with live servers.** Never `reset --hard` or rebase
  while uvicorn/vite hold files open on the repo tree (.venv-on-a-network-
  mount lesson, medintel). Rollback is forward per the T1/T2 tiers —
  revert + redeploy — never a rewrite.
- **Polling caveats are about the vault, not the repo.** The repo mount
  fires file events normally; the *olympus vault and cron-output chains*
  (02 §1, reached over NFS) do not. Any dev server watching vault paths
  needs `WATCHFILES_FORCE_POLLING=true` (uvicorn) and
  `CHOKIDAR_USEPOLLING=true` (vite) — inherited from 02 §1; phase docs may
  assume both are set. Adapters pull on a schedule and never FS-watch
  (T1.1), so this binds dev servers only.

### 7. The event-kind registry (one list, or the spine drifts)

`event.kind` is TEXT by design — kinds grow additively (02 §3, T0.2). The
cost of that freedom is drift: a consumer querying a kind the emitter
never wrote fails silently, which is exactly the failure T4.4's
*If it fails* anticipates ("the query expects event kinds that don't match
what the chokepoint emits"). So **every kind any phase emits is listed
here, and a task that coins a kind adds its row in the same commit.**
02 §3 / 07 §19 remain the authority for the frozen-schema set; this table
is the build-wide roster.

| Kind | Origin | Emitted by | Phase |
|---|---|---|---|
| `source_read_failure` | `source-read` | adapter framework (predicate/parse failure, law 1) | P1 T1.1 |
| `job_paused` | `app-write` | human action only (law 5) — never the app | P1+ |
| `habit_tap` | `app-write` | wake tap / recall pad (payload `method: 'tap'\|'recall'`) | P2 T2.1 |
| `loop_done` · `loop_rolled` · `loop_dropped` | `app-write` | inbox resolutions (`{loop_id}:{date}` refs) | P2 T2.2 |
| `capture_raw` | `app-write` | `POST /capture` (fuzzel door, PWA FAB) | P2 T2.3 |
| `capture_triaged` | `agent-write` | triage invocation, predicate passed | P2 T2.3 |
| `capture_triaged_failure` | `agent-write` | triage invocation, terminal failure | P2 T2.3 |
| `task_seen` | `app-write` | triage target `task` (no task table — 07 §19 (a)) | P2 T2.3 |
| `note_added` | `app-write` | notes compose → staging | P2 T2.4 |
| `meal_logged` | `agent-write` | meal estimation, food_db basis per item (law 11) | P2 T2.6 |
| `rating_staged` | `app-write` | 1–5 tap on a reading card | P3 T3.1 / P5 T5.4 |
| `reading_status` | `app-write` | new→skimmed→digested→dismissed | P3 T3.1 |
| `routine_done` · `routine_skip` | `app-write` | routine ticks (`{routine_key}:{date}`) | P2 T2.7 |
| `project_status` | `app-write` | project active/parked/done (human-only `parked`) | P3 T3.6 |
| `goal_status_derived` | `app-write` | the derivation pass — the status cache's one writer | P4 T4.8 |
| `agent_invoke_started` · `agent_invoke_result` | `agent-write` | the chokepoint, always exactly one terminal row (02 §6) | P0 T0.3 |
| `agent_chat` | `agent-write` / `app-write` | chat turns (`{profile, direction}`) | P4.5 T45.1 |
| `assignment_status` | `agent-write` | assignment lifecycle cache's one writer | P4.5 T45.2 |
| `email_read` · `email_flagged` | `source-read` | per-account himalaya ingest (`<account>:<Message-ID>`) | P5 T5.1 |
| `email_classified` | `app-write` (rules) / `agent-write` (residue) | the classifier pass — fold tiers' one writer | P5 T5.3 |
| `email_fold` · `email_unfold` | `app-write` | human corrections (override seeds, never tiers) | P5 T5.2 |
| `experiment_cut` | `app-write`, actor=system | the pre-signed ratings kill metric firing | P5 T5.4 |
| `service_up` · `service_down` · `service_restart` | `source-read` | presence probes (metrics stay read-through, 02 §1) | P4 T4.5 |

Staged write-backs are the one state change that is **not** an event
kind: an applier records a `provenance_edge` row of type `write-back`
(law 6), and the note/review/rating event it applied is already on the
spine. Nothing new is emitted at apply time.

Two rules ride this table:

- **Emitter/consumer parity.** A kind with no listed emitter is a dead
  query; a kind with no consumer is dead weight. Both are findings in the
  phase's two-pass close (§5).
- **Terminal outcomes are never optional.** Any kind naming a failure
  (`*_failure`, `*_failed`, `agent_invoke_result` with a non-`ok`
  outcome) exists so silence can never pass for success (02 §6). Removing
  one is a build-blocking change, not a cleanup.

---

## Part II — Phase table

| Phase | Ships | Nights | Entry | Exit (abridged — full list in phase doc) | Rollback |
|---|---|---|---|---|---|
| **P0** | repo+CI, migration 001 (incl. the shared `coverage` view + its five render states), theme.css, agent_invoke spike, PWA shell | 8–10 | none (green-field) | offline wake-tap round-trip; real `hermes --profile` call; contrast+blur lint green | free (nothing live) |
| **P1** | 4 adapters (chain-following), first `coverage` consumers, Plaza (read-only) | 10–12 | P0 exit | Sept backfill renders; empty-dir → coverage line; "yesterday" resolves from Oct-1 artifacts | T1 (client) / T2 (adapters) |
| **P2** | writes: wake-tap + SW queue, inbox, capture+triage, notes→vault, routine ticks | 12–16 | P1 exit | airplane-mode tap survives force-stop; fuzzel capture triaged <5 min; routine tick rides the same queue | T3/T4 |
| **P3** | strips: reading queue (digest seed), nutrition, habits stats, projects board | 11–12 | P2 exit | re-ingest yields Aug 10–16 meals only; demoted strip renders muted; parked project muted with its date | T2 |
| **P4** | weekly review renderer (mechanical), agents screen (+ Multica read-through), server screen, goal derivation | 14–16 | P3 exit | W41 draft mechanical-only; numeral-diff gate rejects fabricated stat; stale inputs render insufficient-fresh-evidence | T1 |
| **P4.5** | agent console: `/chat` threads with context attachment, assignments tab | 4–6 | P4 exit | chat turn round-trips with its attachment + provenance; a proposal mutates nothing without a tap; killed invocation ⇒ `failed` | T1/T2 |
| **P5** | email ingest (recall-first), ratings staging | 8–10 | P4.5 exit | fold-drawer corrections round-trip; <10 ratings in 4wk → auto-cut | T3/T4 |
| **P6** | TWA (Bubblewrap), KWGT widget, desktop panel, CF Tunnel static plane, hardening | 10–14 | P5 exit; domain purchased | off-tailnet 200/200 + `/api` unreachable; KWGT scheme E2E; restore drill | T1 |

**Total: ~69–90 nights** (P0 8–10 · P1 10–12 · P2 12–16 · P3 11–12 ·
P4 14–16 · P4.5 4–6 · P5 8–10 · P6 10–14). Phases strictly sequential;
tasks inside a phase carry no ordering constraint among themselves (per
each phase doc's task graph) — which buys freedom of sequence, not
schedule compression, since the estimate basis is one developer on
evening slots.

**Scope note (2026-10-09).** This table now covers all 21 features of
`03-feature-list.md`. The life-layer nouns and the agent console entered
the build order on their `02 §3` slots rather than staying plan-only:
routines → P2 (T2.7) · projects → P3 (T3.6) · goals → P4 (T4.8) ·
chat + assignments → P4.5. That is where the P2/P3/P4 night growth and
the new P4.5 row come from.

---

## Part III — Dependency graph (phases)

```
P0 ── P1 ── P2 ── P3 ── P4 ── P4.5 ── P5 ── P6
      │                                      ▲
      └── CF Tunnel + domain ────────────────┘   (any time before P6
                                                 entry; zero coupling
                                                 to P1–P5 tasks)
```

The domain purchase and Cloudflare wiring are the **only** infra tasks
outside phase order — they gate P6 entry alone and can happen any weekend
in between (task spec: P6/T6.0).

---

## Part IV — Descope paths (decided now, not under pressure)

| If trouble in | Cut in this order | Never cut |
|---|---|---|
| P1 | kanban adapter → Multica probe → day-report backfill | the `coverage` view's consumers (everything reads it) |
| P2 | routine ticks (defer to P3) → notes→vault append (defer to P4) | SW offline queue (hard-mode law 9) |
| P3 | projects board → habits stats (v0: taps only) | nutrition re-ingest exit test (Hygeia's law) |
| P4 | server screen (htop exists) → goal derivation | numeral-diff gate (fabrication defence) |
| P4.5 | spend line → context attachment beyond the current object | suggestions-require-a-tap; single-writer assignment cache |
| P5 | ratings write-back experiment (kill metric exists) | recall-first default-show |
| P6 | desktop panel (PWA window covers it) | wake never-degrades law; restore drill |
