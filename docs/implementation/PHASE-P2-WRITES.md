# Phase P2 — Writes: wake-tap, inbox, capture, notes

**Size L · ~12–16 nights · Entry: P1 exit · Rollback: T3/T4 (EXECUTION Part II)**

> **What the phase proves:** the app becomes a write surface that never
> loses a tap and never lets a failure read as success.

**Ships:** wake-tap write path + service-worker offline queue (hardened
from the P0 skeleton), waiting-on inbox + done/rolled/dropped resolutions,
capture sheet + early-P2 agent triage (task/question/loop/note/meal),
question lifecycle wiring, meal capture path, notes→vault staged
write-backs, **routine ticks** (07 §18 — the second resident of the
generic queue, and the proof T2.1's drain is consumer-agnostic).

**Exit tests (both measured, not believed; two-pass per EXECUTION §5):**

1. **Airplane-mode tap → force-stop → reopen → exactly one event**, `ts` =
   tap time (never retry time) (02 §5 P2 row; 02 §2 law 9).
2. **Fuzzel capture → triaged < 5 min** (02 §5 P2 row).

**Descope order** (EXECUTION Part IV): cut notes→vault append (defer to
P4). **Never cut:** the SW offline queue (02 §2 law 9 — hard-mode is a
law, not a feature).

**Read before starting:** `02-architecture.md` in full (§2 laws, §3
schema, §5 P2 row, §6 invariants) · `04-screens-pwa.md` wake / inbox /
capture / meals sections · `08-agent-console.md` §20 ·
`07-life-layer.md` §18–19 · `03-feature-list.md` §2 §9 §13.

**Standing review greps on every task in this phase** (EXECUTION §4 +
02 §6): one `backdrop-filter` per screen route · accent hexes only in
`theme.css` · liveness only via the three state colors · **no vault-md
write path outside `staged_writebacks/`** · **no raw hermes subprocess
outside `agent_invoke`** · no new columns on frozen v0.1 tables.

**Standing note:** the P0 exit already proved a minimal offline wake-tap
round-trip and the SW queue skeleton exists (`PHASE-P0-FOUNDATION.md`).
**T2.1 hardens that skeleton to the exit-test bar — it does not respec
it.** Likewise the `agent_invoke` chokepoint exists from the P0 spike;
T2.3/T2.5 are its first real consumers, not a second transport.

---

## Task graph

```
P1 exit
   │
T2.1 wake-tap write path + SW queue   ← the serial spine
   │
   ├── T2.2 waiting-on inbox + resolutions
   │
   ├── T2.3 capture sheet + agent triage ──┬── T2.4 notes → vault write-backs
   │                                       ├── T2.5 question lifecycle
   │                                       └── T2.6 meal capture path
   │
   └── T2.7 routine ticks   (proves T2.1's queue is consumer-agnostic)
   │
   ▼
phase exit: force-stop test (T2.1) · fuzzel <5 min (T2.3) ·
            routine tick through the same queue (T2.7) · two-pass
```

Serial spine: T2.1 → T2.3. Everything else fans out. T2.2 and T2.7 need
only T2.1's hardened write path (T2.7 also needs T1.3's plan-line
extractor, which landed in P1); T2.4/T2.5/T2.6 are independent consumers
of T2.3's triage targets.

---

### T2.1 — Wake-tap write path + SW offline queue (hardening)

**Reads:** 02 §2 law 9 (hard-mode: tap `ts` = tap time; `ingested_at` =
retry time; idempotency key = device UUID), 02 §5 P2 row, 02 §3 (event
spine, `habit_tap` payload `method: 'tap'|'recall'`) · 04 `/habits/wake` ·
05 wake lifecycle amendment · 07 §18 (routine ticks ride the same armor)
**Depends on:** P1 exit (phase entry); P0 SW queue skeleton + `POST`
write path
**Parallel with:** nothing (serial spine — everything below queues
through what this task hardens)
**Tier:** T1 (client) / T2 (API); a mis-tap corrects by T4 compensating
event (EXECUTION §2)

**Build**

**[impl] The queue is a generic app-write queue, not wake-specific.**
The SW queues `{idempotency_key, kind, payload, ts}` entries; the wake tap
is its first resident. P3's `routine_done` ticks ride the identical armor
(07 §18) — build the drain so no consumer hardcodes `habit_tap`.

**[impl] `ts` semantics are the exit test.** `event.ts` = tap time,
captured on the client clock **at the tap, before queueing**. `ingested_at`
rides the event **payload** (frozen table — no new columns, 02 §6) and is
stamped by the server at successful receipt. A retry never touches `ts`.
The force-stop test proves the pair: `ingested_at` must be greater than
`ts` by roughly the outage duration.

**[impl] Idempotency key is minted on the device.** A UUID v4 generated
at tap time, persisted **inside the queue entry**, replayed verbatim on
every retry. Server dedupe is the existing spine constraint
`UNIQUE(source_id, kind, external_ref)` with `external_ref` = that UUID;
a replay conflict returns 200 with `duplicate: true` — never a second
event (02 §1 one-write-path).

Hardening checklist against the P0 skeleton:

- Queue entries persist in **IndexedDB** (or Cache API), written
  synchronously before the first POST attempt — never in a SW variable,
  never rebuilt from SW lifecycle state.
- Exactly-once drain: an entry is deleted only after a 2xx. Flush on the
  `sync` event **and** on next foreground — either path alone is a lost
  tap on iOS-family browsers or a force-stop.
- A non-retryable 4xx marks the entry `failed` and the plaza shows a
  visible action line. **Silent deletion is a build-blocking defect** —
  failure must not read as success (02 §6).
- `/habits/wake` hard-mode surface (02 §2 law 9, 04): no nav, no header,
  no animation, route in the SW precache list, sub-2s cold budget, one
  full-bleed target. "will sync" appears after an offline tap — the queue
  is allowed to be invisible, never ambiguous.
- Recall path: minute pad → `method: 'recall'` payload; the value renders
  `~` everywhere, forever (02 §2 law 11 — recalled wake times are
  estimates).

**Tests**

`client/src/sw/queue.test.ts` + `app/tests/integration/test_wake_ingest.py`
- **The exit test, scripted:** airplane-mode ON → tap (record tap wall
  time) → force-stop the browser/kill the PWA → network restored →
  reopen → exactly **one** event; `ts` == tap time to the second;
  `ingested_at` > `ts` by the outage window
- Same queue entry replayed N times → one row, `duplicate: true`
  responses (assert on the DB, not the response)
- Force-stop **between tap and IndexedDB write** loses nothing — the
  write is synchronous with the tap handler
- Poison entry: server 4xx → entry flagged `failed`, plaza line renders,
  no infinite retry
- Grep gate: zero nav/header components in the wake route bundle;
  `/habits/wake` present in the SW precache manifest

**Done when**
- [ ] Airplane-mode tap → force-stop → reopen → exactly one event, correct `ts` (02 §5 P2)
- [ ] `ingested_at` proven to be retry/receipt time on a forced-delay replay
- [ ] Same-key replay never mints a second event (DB-level assert)

**If it fails**
If `ts` drifts to retry time, the queue entry is being rebuilt from SW
state after the kill — persist `{key, ts}` synchronously in the tap
handler, never inside the SW. If duplicates appear, a new UUID is being
minted in the request builder on retry — the key lives in the queue entry
and nowhere else. Both are queue-helper fixes; never patch per-screen.

**Commits**
`chore(T2.1): start wake-tap-queue — baseline green` →
`feat(T2.1): wake tap survives force-stop with device-minted idempotency and tap-time ts`

---

### T2.2 — Waiting-on inbox + resolutions

**Reads:** 02 §3 (`loop` table: owed-by-me / owed-to-me; done/rolled/
dropped), 02 §1 (entity tables are indexes of the spine) · 04 `/inbox` ·
03 §2 (human half / machine half)
**Depends on:** T2.1 (resolutions ride the hardened write path)
**Parallel with:** T2.3
**Tier:** T1 (client) / T2 (API); a wrong resolution corrects by T4

**Build**

One list, two tabs — **Owed by me** (commitments you owe people) /
**Owed to me** (kanban cards `needs_input` on you, review requests, open
agent questions). Rows sorted by age (`since` date), each with source
chip (human/kanban/agent). Machine-half rows are **read-side joins** over
P1 adapter output and the `question` table — no new ingest; the loop
table only owns human-side and manual rows.

**[impl] Resolutions are events first.** `loop_done`, `loop_dropped`, and
`loop_rolled` app-write events; the `loop` row is a denormalized cache
rebuilt from the spine (EXECUTION §1). `external_ref` for rolls is
`"{loop_id}:{date}"` — a loop rolled on many days is many events, and a
double-tap on one day is idempotent via the spine constraint.

UI per 04 `/inbox`: swipe or tap → **done · roll · drop** — three text
buttons, no icons, **no confirm modals** (a reply already sent needs no
"are you sure"). Drop asks a one-line reason **only the first time per
source**; the reason rides the event payload.

**[impl] Optimistic render only after durable queueing.** An offline
resolution shows "queued ·" until the drain confirms 2xx, then settles.
A resolution that silently flips to done on a dead connection is the
exact failure this phase exists to kill.

Plaza WAITING ON badge = count of open loops (amber), tap → `/inbox`
(04 plaza sketch). A hand-edited loop status exists nowhere — there is no
status editor, only resolution buttons.

**Tests**

`client/src/routes/inbox.test.tsx` + `app/tests/integration/test_loops.py`
- done / roll / drop each emit exactly one event; double-tap same-day →
  one event (DB assert)
- roll on three consecutive days → three `loop_rolled` events
  (`{loop_id}:{date}` refs), row's owed-date advances, age re-sort
- drop prompts reason on first drop per source only; second drop skips
- tabs never mix: rendered rows == fixture partition by direction
- **Offline resolution survives force-stop** — same script as T2.1, one
  resolution event, row settles done after reopen
- Plaza badge count == open-loop count from a hand-counted fixture

**Done when**
- [ ] done/rolled/dropped round-trip as spine events, idempotent on double-tap
- [ ] Offline resolution survives force-stop exactly once

**If it fails**
If a resolution lands twice, the client is deriving `external_ref` at
send time (wall clock) instead of replaying the queued key — same failure
family as T2.1; fix in the shared queue helper, never in the screen.

**Commits**
`chore(T2.2): start waiting-on-inbox — baseline green` →
`feat(T2.2): waiting-on inbox with idempotent done/roll/drop resolutions`

---

### T2.3 — Capture sheet + early-P2 agent triage

**Reads:** 02 §2 law 12 (one agent primitive), 02 §5 P2 row, 02 §6
(chokepoint always emits terminal outcome; failure never reads as
success) · 03 §9 §15 · 04 `/capture` · 05 capture PC paths · 08 §20
**Depends on:** T2.1 (queue + write path), P0 `agent_invoke` spike
**Parallel with:** T2.2
**Tier:** T2 (API) / T1 (client)

**Build**

**Doors (all land in one inbox):**
- **fuzzel (athena):** Hyprland keybind → fuzzel prompt → `curl -fsS`
  `POST /capture` against the tailnet API — zero GUI (05)
- **PWA:** the one FAB (`＋`, teal) → `/capture` compose — one textarea
  or shared photo; share-target registration (04)

`POST /capture {text | photo_ref, origin}` → stores the raw capture as an
app-write event (`capture_raw`) and returns its id. Triage target enum:
**task / question / loop / note / meal** (03 §9).

**[impl] Triage goes through `agent_invoke` ONLY.**
`agent_invoke(profile, prompt, timeout, success_predicate)` with the
capture text as context — no raw hermes subprocess anywhere else
(02 §2 law 12; grep-able, EXECUTION §3). Capture triage needs the text
and nothing else: 08's context-injection is chat's advantage, not
triage's — every attached context adds latency against a 5-minute exit
budget.

**[impl] Failure can never read as success.** The chokepoint ALWAYS emits
a terminal outcome event — timeout or mid-crash records failure, never
silence (02 §6). A capture is `triaged` only when the success predicate
passes: response parses to exactly one legal target. On failure the
capture returns to **untriaged** — visible in the capture list with a
retry affordance — and never silently lands as a note.

**[impl] Triage timeout 180 s, single attempt**, leaving ~3 min headroom
for queue + model latency inside the 5-min exit budget. Manual re-triage
is the retry path, not auto-retry.

Results: `capture_triaged` agent-write event (plum attribution) +
provenance edge `capture_raw → capture_triaged` (03 §15). Targets land as
their domain nouns: **question** → `question` row (T2.5 wires the
lifecycle) · **loop** → `loop` row · **note** → T2.4 write path ·
**meal** → T2.6 path · **task** → `task_seen` event (tasks ride event
payloads — 07 §19 amendment (a); no task table exists in v0.1 and none
is added). Human re-triage override = a **new** app-write event; the
original triage event is never edited (append-only spine).

**Tests**

`app/tests/integration/test_capture_triage.py` + `client/src/routes/capture.test.tsx`
- **The exit test, measured:** 10 real fuzzel captures end-to-end →
  median triage latency **< 5 min**; record the numbers, don't estimate
- Hermes killed mid-run → `capture_triaged_failure` terminal event
  exists, capture state == untriaged, **nothing** landed
- Success predicate rejects output that isn't exactly one legal target
- Grep gate: no hermes/subprocess call outside the `agent_invoke` module
- Each target mints exactly its domain event + a resolvable provenance edge
- Re-triage override appends a second event with flipped attribution;
  first event intact
- Offline PWA capture queues via the T2.1 armor and renders "queued"
  until flushed

**Done when**
- [ ] fuzzel capture → triaged < 5 min, measured over ≥ 10 real captures (02 §5)
- [ ] A killed invocation leaves the capture untriaged + terminal failure event

**If it fails**
If triage latency blows the budget, first strip context attachments —
the prompt should carry the capture text only. If the chokepoint reports
timeout while hermes actually finished, the success predicate is matching
the wrong terminal marker: fix the predicate, never widen the timeout —
the 5-minute budget is the exit test, not a knob.

**Commits**
`chore(T2.3): start capture-triage — baseline green` →
`feat(T2.3): capture sheet + fuzzel door with agent_invoke-only triage`

---

### T2.4 — Notes → vault staged write-backs

**Reads:** 02 §2 law 6 (app-owned writes; markdown never edited in
place; staged scripts apply once + `write-back` provenance edge;
append-only into daily notes), 02 §6 (no vault-md writes outside
`staged_writebacks/`) · 03 §13
**Depends on:** T2.3 (note = triage target)
**Parallel with:** T2.5, T2.6
**Tier:** T4 (a bad write-back is compensated by a correcting event —
never a DELETE, EXECUTION §2)

**Build**

Notes are spine events first: `note_added` app-write events; `/notes`
renders from the spine, so a wiped entity table rebuild re-derives
identical notes (EXECUTION §1 drill).

**[impl] The applier is a staged script, and it is the only vault
writer.** Flow: `note_added` events → pending entries in
`staged_writebacks/` → applier appends each as one line
(`- [hh:mm] text`, event-ts order) to **that day's daily note** → marks
applied in the staging ledger → records a `write-back` provenance edge
per note (`note event → vault path#L-range`) (02 §2 law 6, 03 §13).

- **Append-only, always:** the applier opens the target for append; never
  read-modify-write. Existing lines are never touched (03 §13). Missing
  daily note → create with the day's frontmatter (creation of a
  nonexistent file is append-only by definition).
- **Apply-once idempotency:** the ledger marks a note applied only after
  a verified append (read-back check), not after `write()` returns. A
  re-run is a no-op.
- **Cadence:** staging is immediate; apply runs on a short server-side
  timer (or manual trigger). A failed apply leaves notes visible in
  staging — never lost, never half-applied.
- Grep gate enforced in CI: no write-mode open of vault md anywhere
  outside the applier (02 §6).

**Tests**

`app/tests/integration/test_notes_writeback.py`
- 10 notes → one apply pass → daily note contains exactly 10 appended
  lines; every provenance edge resolves to a real line range; **second
  apply run changes zero bytes**
- `SIGKILL` the applier mid-pass → re-run → no duplicate lines, no lost
  notes (ledger survives)
- A human line added to the daily note between staging and apply →
  still there byte-identical after apply; the note appended after it
- Grep gate: zero vault-md write paths outside `staged_writebacks/`
- Entity-table wipe + rebuild → `/notes` renders identical list

**Done when**
- [ ] Append-only proven: pre-existing daily-note bytes never change across any apply
- [ ] Applier kill/re-run leaves zero duplicates and zero losses

**If it fails**
A vanished note means the staging ledger and the spine diverged — the
ledger is derived from events, so re-derive from events and re-apply;
**never hand-edit the vault to patch it**. Duplicate lines mean "applied"
was recorded before the read-back check — fix the ordering in the
applier, never in the ledger by hand.

**Commits**
`chore(T2.4): start notes-writeback — baseline green` →
`feat(T2.4): staged append-only notes write-back with provenance edges`

---

### T2.5 — Question lifecycle wiring

**Reads:** 02 §6 (single-writer statuses; chokepoint terminal outcome;
reversals ride terminal outcome events; failure never reads as success) ·
08 §20 (question lifecycle mapping + writer contract) · 04 `/questions`
**Depends on:** T2.3 (questions born from triage; chokepoint consumed)
**Parallel with:** T2.4, T2.6
**Tier:** T2 (API) / T1 (client)

**Build**

Lifecycle: **open → picked_up → answered**, with the reversal edge back
to open. The `question` table is frozen v0.1 — no columns are added;
`question.status` is a **materialized cache**.

**[impl] Exactly one writer: the `agent_invoke` event stream.** Every
status transition is written by invocation events; the repo layer rejects
any other write path. There is no status editor and no admin endpoint —
"ask again" on a question opens a **new** invocation through the
chokepoint; even reversals arrive only via invocation events (02 §6;
08 §20 writer contract).

- **picked_up** = an invocation opened via `agent_invoke` (renders plum,
  agent name, 04): from `/questions`, "send to \<profile\>" mints the
  invocation with the question text as context.
- **answered** = success predicate **passed** + answer written with its
  provenance edge (question → answer/session log); the brief renders on
  the paper tier with a provenance footer (04).
- **Reversal:** a timed-out, error-text, or mid-crash invocation emits a
  terminal **failure** outcome event — which is what flips the question
  back to `open`. A process that dies cannot emit its own terminal event,
  so the chokepoint detects the dead subprocess and emits the failure
  itself (08 §20). **A question stuck at `picked_up` is a chokepoint
  defect, by construction.**
- An invocation whose output lacks the predicate's marker can never write
  `answered` (freshness≠success applied to the question queue, 02 §6).

**Tests**

`app/tests/integration/test_question_lifecycle.py`
- Happy path open → picked_up → answered: exactly one event per
  transition; replaying all events re-derives the cached status exactly
- **Kill hermes mid-run** → terminal failure event → status == open
  (never stuck `picked_up`) — the 08 §20 contract test
- Fabricated success: output missing the predicate marker → `answered`
  NOT written, question still open
- Repo-level gate: a direct status UPDATE outside the invocation stream
  is rejected; grep finds no second writer
- "Ask again" mints a new invocation; the prior failure event remains
  (append-only history)

**Done when**
- [ ] A mid-run killed invocation flips the question back to open via the terminal event
- [ ] No writer of `question.status` exists outside the invocation event stream (grep + repo gate)

**If it fails**
If questions stick at `picked_up`, the chokepoint's timeout is not being
enforced by the caller — fix it in `agent_invoke` (the one place retry/
audit/timeout live, 02 §2 law 12), never in question code. A
question-specific watchdog would be a second writer and is forbidden.

**Commits**
`chore(T2.5): start question-lifecycle — baseline green` →
`feat(T2.5): question lifecycle with single-writer invocation stream and crash reversal`

---

### T2.6 — Meal capture path

**Reads:** 02 §2 law 11 (estimates: `~` marks + provenance to estimation
basis; estimated never renders as measured), 02 §3 payload conventions
(meal values are estimates w/ food_db provenance) · 03 §4 · 04 `/meals`
**Depends on:** T2.3 (meal = triage target)
**Parallel with:** T2.4, T2.5
**Tier:** T2 (API) / T4 (a wrong meal is superseded by a re-triage
compensating event, EXECUTION §1)

**Build**

"Log a meal" → `/capture` prefilled `#meal` (04); text or photo. Triage
target **meal** routes to the Hygeia profile via `agent_invoke` (the
T2.3 chokepoint — no new transport).

**[impl] The success predicate enforces the estimates law.** A triaged
`meal_logged` event (kind registered in `EXECUTION.md` §7) carries
`items[]` in its payload, each item
`{label, kcal_est, protein_g_est, basis: "food_db:<ref>"}` (02 §3). The
predicate **rejects any response containing an item without a food_db
basis ref** — a basis-less estimate is not stored and the capture returns
to untriaged. Enforcing this at the predicate is the whole mechanism; a
prompt asking nicely is not.

**[impl] `~` is applied at render from payload shape, never hand-typed.**
Every kcal/protein figure derived from an `*_est` field renders with `~`
on `/meals` day cards and the fold drawer (02 §2 law 11). Day totals are
computed by summing item rows — **rows are canonical**; a mismatch
against the displayed total is flagged, never smoothed (03 §4).

Meal photos: ref stored at capture, attached to the estimation
invocation, provenance edge photo → meal event recorded (03 §15).

Scope line: P2 ships capture → spine write → `/meals` day cards. The
plaza nutrition strip, tenancy demotion/promotion, and the Hygeia-chain
re-ingest exit test stay in P3 (02 §5 P3 row) — do not pull them forward.

**Tests**

`app/tests/integration/test_meal_capture.py` + `client/src/routes/meals.test.tsx`
- Text meal ("2 eggs + toast") → one meal event, per-item est values,
  every item carries a `food_db:` basis ref
- **Predicate rejection:** a mocked estimation response with one
  basis-less item → capture untriaged, no meal event
- Render gate: DOM assert — **no estimated number on `/meals` renders
  without `~`**
- Day total == sum of rows to displayed precision; a broken fixture
  fires the mismatch flag
- Photo meal: ref stored, invocation received it, provenance edge resolves
- Re-triage of the same capture (same idempotency key) → one meal event

**Done when**
- [ ] Every estimated number on `/meals` renders `~` with resolvable food_db provenance
- [ ] A basis-less estimation is rejected by the predicate, not stored

**If it fails**
If Hygeia returns precise-looking numbers without bases, tighten the
success predicate (require the ref per item) — the estimates law is
enforced at the chokepoint, never by hoping the prompt behaves. If `~`
goes missing on a new screen, the screen is reading a raw `*_est` field
without the render helper — fix the helper usage, don't sprinkle `~`
strings.

**Commits**
`chore(T2.6): start meal-capture — baseline green` →
`feat(T2.6): meal capture with food_db provenance and render-time ~ marks`

---

### T2.7 — Routine ticks (the plan strip becomes checkable)

**Reads:** 07 §18 (routines; tick integrity; `routine_skip`) · 07 §19
(schema note: `routine_key`, `external_ref = "{routine_key}:{date}"`, no
routine table) · 02 §2 law 9 (the tick rides the wake-tap armor), law 11
(estimates: recall renders `~`) · 04 `/` plaza plan strip + `/routine` ·
01 §4 (teal = you act) · T1.3 (the week-plan revisions these keys come from)
**Depends on:** T2.1 (the generic queue — T2.1 builds the drain so no
consumer hardcodes `habit_tap`; this task is the proof of that), T1.3
(plan-line extraction)
**Parallel with:** T2.2, T2.4, T2.5, T2.6
**Tier:** T1 (client) / T2 (API); a wrong tick corrects by T4
compensating event (EXECUTION §1)

**Build**

The plaza's plan line (T1.6, read-only in P1) becomes a **checkable
list** in the same real estate (07 §18): one tap per item, plus a
`/routine` day detail. Habits stay separate — habits are *changed
behaviors*, routines are *planned structure*; a habit may anchor to a
routine slot but they never merge (07 §18).

**[impl] `routine_key` is a stable slug of the Week Plan line** (07 §19),
derived by T1.3's plan-line extraction, not typed here. `routine_done`
and `routine_skip` are app-write events with
`external_ref = "{routine_key}:{date}"`, so the spine's existing
`UNIQUE(source_id, kind, external_ref)` makes a double-tap idempotent and
**no routine table exists in v0.2** (07 §19). `project_id`/`goal_id`-style
links ride payloads, never frozen columns (02 §6).

**[impl] Ticks are optional evidence, never duty** (07 §18). Unticked
items render unticked — no amber, no red, no nagging. A
planned-but-skipped item marked `routine_skip` renders
**covered-but-not-done in the muted tier**: information, not failure
(01 §1 dormancy law; 02 §6 muted-never-red). A day with no interaction
renders a coverage line from the shared view (law 7), never a row of
zeros.

**[impl] Tick integrity, from the wellness seat** (07 §18). Payload
carries `method: 'tap'|'recall'`. Recall renders `~` in every window
("GRE: ~5 of 7"), forever (law 11), and **a drift claim needs
tap-majority before rendering bare** — the same evidence rule T3.3
applies to habit windows, enforced here at the source so P4's plan-vs-
actual section inherits it (09 §2#2).

**[impl] Full wake-tap armor, reused not rebuilt.** Ticks go through
T2.1's queue helper: IndexedDB persistence written synchronously in the
tap handler, device-UUID idempotency replayed verbatim, `ts` = tap time,
`ingested_at` = receipt time, exactly-once drain, visible `failed` state
on a non-retryable 4xx. **If this task needs one line of queue code of
its own, T2.1's drain was built wrong** — fix it there (law 9 binds every
hard-mode write, not just wake).

Ticks are teal (you act, 01 §4). No streak logic exists: the denominator
is the planned set for the day, never consecutive days (09 §3 gate 4).

**Tests**

`client/src/routes/routine.test.tsx` + `app/tests/integration/test_routine_ticks.py`
- Tap → one `routine_done`; double-tap same day → still one (DB assert on
  `{routine_key}:{date}`)
- `routine_skip` renders muted, carries no state hue, and counts as
  covered-but-not-done — token-level assert (02 §6)
- Recall tick → `method: 'recall'`, every rendered window carries `~`;
  a recall-majority window never renders bare
- **Offline tick survives force-stop** — T2.1's script, re-run against
  this consumer: exactly one event, `ts` = tap time
- Import assert: the routine screen imports T2.1's queue helper and
  declares no queue of its own (the structural claim T2.1 made)
- A day with no ticks renders its coverage line, never zeros
- Grep: no `streak|consecutive` in the routine module; plan keys come
  from T1.3's extractor, never hardcoded

**Done when**
- [ ] A tick survives airplane-mode + force-stop exactly once, through
      T2.1's queue with zero task-local queue code
- [ ] `routine_skip` renders muted — never red, never a failure
- [ ] Recall ticks carry `~` everywhere they are counted

**If it fails**
If ticks need their own queue, the defect is in T2.1's drain generality —
fix it there and re-run both consumers' force-stop tests. If a skipped
item reads as a failure, the render reached for a state hue: skipped is
muted information (07 §18; 02 §6). If keys drift between plan revisions,
`routine_key` is being derived from the line's text rather than T1.3's
stable slug — a renamed plan line must not orphan its history.

**Commits**
`chore(T2.7): start routine-ticks — baseline green` →
`feat(T2.7): routine_done/routine_skip ticks on the wake-tap armor`

---

## Phase exit

**Build nothing new. Measure, then verify twice.**

- [ ] **Airplane-mode tap → force-stop → reopen → exactly one event, correct `ts`** (T2.1; 02 §5 P2)
- [ ] **fuzzel capture → triaged < 5 min**, measured over ≥ 10 real captures (T2.3; 02 §5 P2)
- [ ] Every T2.x "Done when" box ticked by observed execution (README §how-to-execute step 4)
- [ ] Standing greps green across the phase diff: blur budget · accent hexes · state colors · vault-md write paths · hermes subprocesses · frozen-table columns (EXECUTION §4, 02 §6)
- [ ] **Routine tick survives the same force-stop script through T2.1's queue, with zero task-local queue code** (T2.7)
- [ ] **Two-pass:** exit claims re-verified by a different grep / cold re-read the next day — the author never solo-declares the phase done (EXECUTION §5, 02 §6)

**If the phase must be undone:** T3 (restore SQLite backup) for data-plane
damage; T4 (compensating events) for wrong ingest/write-backs; client
code rolls back T1. Descope in EXECUTION Part IV order: notes→vault
append defers to P4 first; the SW offline queue is never cut (02 §2 law 9).
