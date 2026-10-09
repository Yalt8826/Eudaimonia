# Phase P5 — Email ingest (recall-first) + ratings staging

**Size M · ~8–10 nights · proves: the highest-noise personal channel renders
recall-first without lying about its own classifier.**

**Ships** — per-account email ingest (himalaya), the `/mail` screen
(default-show, fold-drawer, corrections loop), the two-stage classifier
(rules → `agent_invoke` residue), ratings staging with the prefs write-back
kill metric, plaza badge polish.

**Entry** — P4.5 exit (and therefore P4's: the staged write-back
machinery and the agents screen are live, and the console's invocation
load is known; classifier invocations ride the spine and render on
`/agents` for free).

**Read before starting:** `02-architecture.md` §2 (laws 1, 3, 6, 7, 10,
12), §3 (frozen schema; ratings stage before prefs write-back), §6
(failure can never read as success; single-writer; two-pass) ·
`03-feature-list.md` features 5 and 12 · `04-screens-pwa.md` (fold drawer,
plaza badge) · `01-design-system.md` (fold-drawer role; state colors) ·
`09-weekly-review-format.md` §2 #6 · `EXECUTION.md` Part IV (descope,
decided now).

**The one way this phase fails quietly:** every failure mode of the
classifier tempts toward hiding mail. The standing rule, binding on all
five tasks: **when the classifier is wrong, slow, or dead, mail becomes
more visible — never less.** (Law 10; 03 lists default-hide under
"deliberately not building".)

## Task graph

```
T5.1 email ingest ──┬──► T5.3 classifier ────┐
 (per-account)      │    (rules → residue)   │
                    │                        ├──► T5.5 polish  (last)
                    └──► T5.2 /mail screen ──┘
                         (default-show + corrections loop)

T5.4 ratings staging + kill metric ── independent lane, any night slot
```

Night budget: T5.1 ~3 · T5.3 ~2 · T5.2 ~2 · T5.4 ~1–2 · T5.5 ~1.

---

### T5.1 — Email ingest adapter (per-account, himalaya)

**Reads:** `02-architecture.md` §1 (one write path; UNIQUE), §2 laws 1/2/3,
§3 (schema) · `03-feature-list.md` feature 12 (per-account sources)
**Depends on:** P4.5 exit
**Parallel with:** T5.4
**Tier:** T2 (code) · T4 (bad rows)

**Build**

One `source` row per mail account — feature 12's per-account tenancy is a
registry fact, not a convention: own success predicate, own credentials in
gitignored `.env`. There is no shared "email" source.

[impl] The adapter wraps the `himalaya` CLI per account and has two doors
into the **same** ingest path: a 15-minute poll and an optional gateway
ping. A ping carries **zero mail data** — it only triggers a read; every
envelope enters through himalaya and the frozen dedupe absorbs
double-fires.

[impl] Each envelope becomes one spine event — kind `email_read`, origin
`source-read`, `external_ref = <account>:<Message-ID>`, payload `{from,
subject, date, list-unsubscribe, list-id, flags}`. Dedupe is the frozen
`UNIQUE(source_id, kind, external_ref)` (02 §1/§3): re-polls insert zero.
Message bodies are never ingested at poll time — fetched lazily by the
screen or the classifier's residue pass.

`ts` = the message's Date header, never fetch time (law 3, content-derived
dates). A flag change (read/unread) is a new `email_flagged` event, never
an UPDATE (EXECUTION §1); current unread state derives by query from the
latest event per ref — no new table, no frozen column (02 §6).

Success predicate (law 1, freshness≠success): himalaya exits 0 **and** the
envelope output parses — an empty mailbox parses as success. Nonzero exit
or malformed output records a failure event and freezes
`last_ok_read_ts`: "adapter broken" and "mailbox quiet" are different
coverage lines, per account.

**Tests**

`app/tests/email/test_ingest.py`
- 500-message fixture mailbox backfills; re-run inserts **0** (dedupe
  proven, not asserted)
- same Message-ID on two accounts ingests twice — external_ref is
  account-scoped
- a message fetched today but dated last week ingests with last week's ts
- forced himalaya failure → failure event, `last_ok_read_ts` unchanged,
  coverage line reads adapter-broken (not dead, not empty)
- forced gateway-ping + poll race inserts zero duplicates

**Done when**
- [ ] Real account #1 backfills; re-poll inserts 0; coverage line renders
- [ ] Real account #2 dedupes independently
- [ ] Both coverage lines render from the shared `coverage` view (law 7)

**If it fails**
himalaya is the thin, replaceable part; its real failure mode is auth. An
account that cannot hold auth gets parked — a **human** pause (law 5) —
and the rest ships. Do not hand-roll an IMAP/OAuth client in this phase,
and never let account #2 block recall-first.

**Commits**
`chore(T5.1): start email-ingest — baseline green` →
`feat(T5.1): per-account email ingest — himalaya envelopes as deduped source events`

---

### T5.2 — Recall-first `/mail` screen + corrections loop

**Reads:** `02-architecture.md` §2 laws 7/8/10, §6 · `04-screens-pwa.md`
§`/mail` + route map + More sheet · `01-design-system.md` (fold-drawer role)
**Depends on:** T5.1
**Parallel with:** T5.3, T5.4
**Tier:** T1 (client) · T4 (correction rows)

**Build**

[impl] `/mail` is stubbed from P0 (T0.5) and specced in `04` (route map +
screen section, amended 2026-10-09); this task fills it. Entered from the
More sheet — the two-tap law (law 8) holds: plaza → More → mail. On-demand tenancy; the plaza gets
only the badge (T5.5).

**Default-show is the layout, not a setting** (law 10): every envelope in
the trailing 14 days [impl] renders in the main list. Ignorable classes
(tier = fold) collapse into a thin fold-drawer at the bottom (01's
fold-drawer role): one line — "312 folded · subscriptions". The drawer
opens in one tap; every folded mail stays openable from it — the drawer is
a fold, never an attic (law 8).

**Corrections are the loop.** Fold or unfold anything with one tap; each
tap writes an app-write event — `email_fold` / `email_unfold` — keyed by
the mail's external_ref with the current tier and reason in payload.
[impl] Corrections tune the classifier as per-sender rule overrides: an
unfold on a list-header fold seeds the sender allowlist; a fold on an
allowlisted sender removes it. Overrides outrank base rules in T5.3's
stage 1. Corrections never write tiers directly (single-writer, 02 §6).

Folds are never silent: a folded row renders why ("folded:
list-unsubscribe"), a corrected row marks the human override. Provenance
is the honesty mechanism — the screen must not lie about its own
classifier.

The screen renders per-account coverage lines from the shared view
(law 7): "account 42 new of 312 · adapter ok 15m ago".

[impl] With classification absent or the classifier dead, **everything
renders in the main list** — no tier reads as show. This is the mirror of
02 §6's failure-never-reads-as-success, applied to visibility.

**Tests**

`client/src/routes/mail.test.tsx`
- Round-trip on a 100-mail fixture: fold → drawer +1 / main −1; unfold →
  restored; both events on the spine keyed by external_ref
- Main list + drawer = 100 — **zero default-hidden messages**, proven
- With no classification events, main list renders all 100 (no tier →
  show)
- One unfold creates a sender override; the next rule pass keeps that
  sender's mail out of the drawer
- Offline: last-synced envelopes render from SW cache with the coverage
  age

**Done when**
- [ ] **Fold-drawer corrections round-trip on the real account**
      (EXECUTION Part II, P5 exit)
- [ ] Seeded fixture proves main + drawer = inbox window
- [ ] One real correction observed changing the next pass for its sender

**If it fails**
Wrong folds have a fixed correction direction: **more drawer, less
auto-fold** — shrink the auto-fold set (list-header-only to start). Never
compensate by hiding unclassified mail; that is the one option the plan
explicitly refused (03, "deliberately not building").

**Commits**
`chore(T5.2): start mail-screen — baseline green` →
`feat(T5.2): recall-first mail screen — default-show, corrections as spine events`

---

### T5.3 — Classifier: rules first, residue through `agent_invoke`

**Reads:** `02-architecture.md` §2 laws 10/12, §6 (failure≠success;
single-writer; chokepoint terminal outcomes) · `03-feature-list.md`
feature 12 (rule-based first; LLM for ambiguous residue)
**Depends on:** T5.1
**Parallel with:** T5.2, T5.4
**Tier:** T2 · T4

**Build**

Two stages, one writer. **Stage 1 — rules** (deterministic app code, zero
agent): `List-Unsubscribe`/`List-Id` header → fold (reason:
list-unsubscribe); contact allowlist → keep (03 feature 12). Rule results
write `email_classified` events, origin `app-write`.

**Stage 2 — residue** (everything stage 1 couldn't place) goes through
`agent_invoke` — the chokepoint, law 12; nothing else spawns hermes.
[impl] One batched invocation per ingest cycle, capped at 25 refs, prompt
carrying subject/from/header snippet per ref, response = a fold tier per
ref. Profile: praxis (03 feature 12). Tiers write as `email_classified`
events, origin `agent-write`, with provenance to the invocation — the
agents screen's history feed rides the spine for free (law 12).

`success_predicate` = the response parses to a valid tier for **every**
submitted ref. Timeout, mid-crash, or a missing ref → the chokepoint's
terminal outcome event records failure and **zero tiers persist from that
run** (02 §6) — unclassified mail stays shown (T5.2). A failed run can
never fold anything.

Single-writer (02 §6): fold tiers are written only by the classifier pass.
T5.2's corrections write override events that stage 1 reads — they never
write tiers.

[impl] The LLM stage is optional **forever**: rules-only is a fully
recall-first-compatible shape (folds only list-header mail), not a
descope.

**Tests**

`app/tests/email/test_classifier.py`
- List-header + allowlisted fixture mail classifies with **zero
  invocations** in the run (rules proven agent-free)
- Residue of N ≤ 25 triggers exactly one batched invocation; every ref
  answered
- Response missing one ref → predicate fails → failure outcome event,
  zero tiers persisted
- SIGKILL mid-invocation → terminal outcome event, no tiers, mail fully
  visible (02 §6: mid-crash records failure, never silence)
- Grep gate: a hermes subprocess appears only inside the `agent_invoke`
  module (02 §6, grep-able)

**Done when**
- [ ] Real mailbox end-to-end: rules carry the majority, residue tiered,
      fold reasons visible on the screen
- [ ] Forced chokepoint failure → outcome event on `/agents`, **every
      message still visible**
- [ ] Classifier invocations render in the agents screen history (free
      ride confirmed)

**If it fails**
Rules are the floor. If the residue pass is slow, noisy, or expensive, set
it to zero and ship rules-only — the fold set shrinks to list-header mail
and nothing else changes. Classifier trouble must never gate ingest or
visibility.

**Commits**
`chore(T5.3): start mail-classifier — baseline green` →
`feat(T5.3): two-stage classifier — rules first, residue through agent_invoke`

---

### T5.4 — Ratings staging + the write-back kill metric

**Reads:** `02-architecture.md` §1 (rating stage emits an event first),
§2 law 3, §3 (reading_item rating/staged_ts; ratings stage before prefs
write-back), §6 (no frozen columns) · `03-feature-list.md` feature 5 ·
`09-weekly-review-format.md` §2 #6 · `EXECUTION.md` Part IV
**Depends on:** P4 exit (staged write-back machinery — T4.3)
**Parallel with:** everything in P5
**Tier:** T2 · T4

**Build**

Tap 1–5 on a reading card (04 `/reading`) → a `rating_staged` event
(app-write; one write path — the event first, 02 §1) and `reading_item`
`rating` + `staged_ts` set (frozen schema, 02 §3). **The vault is not
touched at tap time.**

The write-back is a staged script on a weekly cadence: applies staged
ratings to the vault's `digest_prefs.md`, exactly once per batch,
idempotent on `staged_ts`, and logs a `write-back` provenance edge per
rating applied (law 6).

**The kill metric, decided now** (03 feature 5; 02 §5 P5 row; EXECUTION
Part IV): count `rating_staged` events in the trailing 4 weeks by their
content-derived ts (law 3 — backfilled older ratings don't count).
**<10 → the write-back experiment auto-cuts.**

[impl] The auto-cut is the pre-ratified decision executing, not a liveness
pause: it records an `experiment_cut` event (actor=system, payload = count
+ window). Law 5's human-only pause governs source/job liveness states;
this experiment's death was pre-signed by the human in the plan's descope
table. Re-arming the experiment is a human act.

The queue never depends on the write-back: after a cut, ratings keep
staging and the mechanical review section keeps rendering them (09 §2 #6)
— "cut the write-back, keep the queue" (03 feature 5).

**Tests**

`app/tests/ratings/test_staging.py`
- Tap → event + row fields; `digest_prefs.md` byte-identical before any
  write-back
- Write-back applies once; second run is a no-op (idempotence)
- **Boundary proven at 9 and 10 seeded ratings**: 9 → cut event, no
  write-back; 10 → write-back applies
- A rating ts outside the trailing 4 weeks does not count toward the
  metric
- After a cut: staging still works; §6 still renders "ratings given"
- Provenance edge resolves: rating event → prefs file line

**Done when**
- [ ] **<10 ratings in 4wk → auto-cut fires on the real system and is
      recorded** (EXECUTION Part II, P5 exit)
- [ ] ≥10 → write-back applies once, edge resolves
- [ ] Sunday's mechanical §6 renders staged ratings

**If it fails**
A buggy write-back is cut immediately and manually — the kill metric
exists so this decision is never relitigated under pressure, not to
protect the write-back. Staging (events + `reading_item`) has no kill
path: it is the queue, and the queue stays.

**Commits**
`chore(T5.4): start ratings-staging — baseline green` →
`feat(T5.4): staged ratings + prefs write-back with the 9/10 kill metric`

---

### T5.5 — Mail polish to the 04 spec (the one nagger)

**Reads:** `04-screens-pwa.md` (plaza badge; fold drawer) ·
`01-design-system.md` (state colors; component roles; motion) ·
`EXECUTION.md` Part I §4 (review greps)
**Depends on:** T5.2 (screen), T5.3 (real tiers)
**Parallel with:** nothing — last task in the phase
**Tier:** T1

**Build**

Plaza mail line: count badge (unread, trailing window) in paused-amber
`#D29922` — amber is a system state color, not an accent (01). This is
the one nagging element the mail feature gets: a count, no push, no red —
unread mail is not a system failure; red stays reserved for adapter-dead
liveness. No mail to nag about renders **nothing**, never a zero.

Screen polish to 04/01: fold-drawer component role, 150–200ms transitions
honoring `prefers-reduced-motion`, pull-to-refresh only (no polling
spinners), mono coverage lines, More-sheet entry, offline precache.

The review greps (EXECUTION §4) run against `/mail` in CI from T0.6's
linter config: `backdrop-filter` ≤1 on the route, accent hex only inside
`theme.css`, liveness only via the three state colors. This route passes
the same gates every other screen does.

**Tests**

`client/src/routes/mail-polish.test.tsx`
- The three grep gates green on `/mail`
- Badge: count > 0 → amber token; empty window → renders nothing
- Plaza → More → `/mail` in two taps
- Drawer animation 150–200ms; honors `prefers-reduced-motion`

**Done when**
- [ ] `/mail` passes all review greps in CI
- [ ] Plaza badge renders the honest count; a dead adapter renders the
      dead state — never silence
- [ ] Cold offline load: `/mail` renders from SW cache with age line

**If it fails**
Polish is the phase's first cut; recall-first is never cut (EXECUTION Part
IV). If the blur budget fights the drawer, the drawer goes flat — the
blur loses (01 surface rules).

**Commits**
`chore(T5.5): start mail-polish — baseline green` →
`feat(T5.5): mail screen to 04 spec — amber count badge, grep-clean`

---

## Phase P5 exit

- [ ] **Fold-drawer corrections round-trip proven on a real account**
      (EXECUTION Part II, P5)
- [ ] **<10 ratings in trailing 4wk → write-back auto-cut fires and is
      recorded** (EXECUTION Part II, P5)
- [ ] Zero default-hidden messages — seeded fixture proves
      main + drawer = total (law 10)
- [ ] Forced classifier failure → terminal outcome event, zero tiers,
      every message visible (02 §6)
- [ ] Every agent call through `agent_invoke` — grep green (law 12,
      02 §6)
- [ ] Per-account coverage lines render from the shared `coverage` view
      (law 7)
- [ ] Review greps green on `/mail` (EXECUTION §4)
- [ ] Exit claims two-pass verified (EXECUTION §5, 02 §6) — different
      grep, different seat, or a cold re-read the next day

**Rollback.** Code is the usual T1 (client) / T2 (adapter+API). The
phase's risky state is data-plane, hence the table's T3/T4 (EXECUTION §2):
wrong tiers, wrong folds, and stray write-backs are undone by compensating
events — never DELETE (EXECUTION §1) — and a damaged spine segment
restores from backup (T3). The write-back experiment carries its own
pre-decided kill.

**Descope** (EXECUTION Part IV, decided now — not under pressure): cut in
order — 1. the ratings write-back experiment (the kill metric exists;
staging and the queue survive); 2. the LLM residue pass (rules-only is a
compatible degradation, T5.3). **Never cut: recall-first default-show**
(law 10) — it is the phase's proof, not a feature.
