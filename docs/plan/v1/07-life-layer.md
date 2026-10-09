---
project: Eudaimonia
doc: Life Layer v1.1 — Projects, Routines, Goals
owner: praxis
status: added 2026-10-08 (v1.1) — closes original-scope gap
supersedes: nothing; extends 03/04/06
---

# Life Layer — Projects, Routines, Goals

The original brief: *"tasks, projects, habits, routines, goals, activity."*
v1 docs covered tasks/habits/activity; this doc adds the missing three.
Design constraint: everything here obeys the signed laws — **no streaks, no
guilt mechanics, coverage-honest, two-tap, app-owned writes.**

Schema note: additive **v0.2** deltas (Noesis ratifies) — new tables +
event kinds, zero changes to frozen v0.1.

---

## 17. Projects — Yashas-owned, distinct from Multica

**Does:** first-class records for the things you're building — Market
Momentum, Kerdos, Eudaimonia itself. A project = name, status
(`active / parked / done`), optional kanban-board glob (Kerdos has a real
board), optional vault notes path, created/updated timestamps. Board-linked
projects render live board health (alive/dead/paused, task counts) from the
existing read-only kanban adapter. Progress is **derived, never manually
estimated**: last spine activity, open vs resolved tasks, board state.
**Helps:** "what am I building and is it moving?" answered from evidence;
parked projects stay visible without nagging — a parked project renders its
parked-since date in muted, not red.
**Lives:** on-demand `/projects` (board-style three columns, glass tier) +
`/projects/[id]` detail (notes, linked tasks/loops, activity feed from the
spine). Plaza carries no project content — on-demand only, two-tap law.

## 18. Routines — the daily backbone, structured

**Does:** the Week Plan backbone (dMAT 3:00 · GRE 3:45–6:45 · Gym 7:00 ·
DL 10:00…) parsed into routine items for the day. Plaza's existing plan
line becomes a **checkable list**: one tap per item emits a
`routine_done` event (teal, app-write). Ticks are optional evidence, never
duty: unticked items render unticked, missing days render coverage lines —
the drift view's *actual* side gains structured signal without depending
on narrated reports alone.
**Tick integrity (from the wellness seat):** `routine_done` payload
carries `method: 'tap'|'recall'`; recall renders `~` in every window
("GRE: ~5 of 7") and drift claims need tap-majority before rendering bare —
the estimates law applied to planned structure. Ticks ride the wake-tap's
full armor: airplane-mode SW queue, device-UUID idempotency. A
planned-but-skipped item can be marked **`routine_skip`** — renders
covered-but-not-done (muted; information, not failure), so the drift view
never learns to flatter you.
**Helps:** plan-vs-actual drift stops being inference from prose; "GRE
happened on 5 of 7 planned days" becomes countable, and it's your tap, not
a surveillance estimate.
**Lives:** plaza strip (replaces today's-plan line, same real estate) +
`/routine` day detail. Habit row (§3) stays separate — habits are *changed
behaviors* (wake), routines are *planned structure*; a habit can anchor to
a routine slot but they don't merge.

## 19. Goals — the horizon

**Does:** long-horizon outcomes with target dates — *Germany master's
WiSe 2027/28 · dMAT 26 Sep · GRE Oct/Nov*. A goal = title, target date,
status (`on-track / at-risk / achieved / parked`), links to related
projects/tasks/questions. Status is **derived**: at-risk when linked
overdue tasks exceed a threshold or target date passes without `achieved`;
never manually colored. Progress = evidence summary from the spine
("12 tasks closed since Aug · dMAT registered ✓"), rendered on paper tier.
**Helps:** the "why" behind the weekly grind stays one tap away, and the
weekly draft's tasks section can reference which goal a closed task
served — without a new draft section in v1 (draft integration waits for a
live-data forcing function, per freeze law).
**Evidence freshness floor for derivation (from the wellness seat):** the
goal derivation pass only computes from sources passing their freshness
predicate; when the evidence base is stale, the goal renders "insufficient
fresh evidence" instead of a status. At-risk is exactly the status most
likely to nag — stale evidence is evidence silence, not drift, and never
becomes an alarm. Live case already on disk: both input sources (Task
List, Week Plan) are stale today.

**Lives:** `/goals` horizon list (on-demand). Deliberately **not on the
plaza** — daily-goal-staring is guilt mechanics; the horizon is for
planning moments and Sunday.

### Screens (wireframe sketches)

```
/projects                      /goals
┌─────────┬─────────┬────────┐  ┌───────────────────────────────┐
│ ACTIVE  │ PARKED  │ DONE   │  │ Germany MSc · WiSe 2027/28    │
│ Market  │ Kerdos  │ …      │  │ on-track · dMAT ✓ · 12 tasks  │
│ Momen ● │ ● board │        │  │ GRE · Oct/Nov · 3 open        │
└─────────┴─────────┴────────┘  │ …                             │
                                └───────────────────────────────┘
/routine (plaza strip expanded)
  ☑ dMAT 3:00   ☐ GRE 3:45   ☐ Gym 7:00   ☐ DL 10:00   2 of 4
```

Colors per dual-accent law: project/goal rows neutral with **state dots**;
routine ticks teal (you act); any agent contribution (question answered
toward a goal, narrated summary) plum. Derived at-risk renders
paused-amber; **red stays system-failure-only** (dormancy law extended:
lapsed plans are information, not alarms).

### Schema v0.2 (additive, ratified)

```sql
project (id PK, name, status CHECK(active|parked|done), board_glob, notes_path, ts)
goal    (id PK, title, target_date, status CHECK(on-track|at-risk|achieved|parked), links JSON)
-- RATIFIED amendment (a): NO frozen-table columns added. project_id / goal_id
--   ride inside event payloads (task_seen, loop transitions); /projects/[id]
--   and /goals/[id] derive linked-work views by payload query. Promote to
--   columns only on measured query pain (read-through rule applied to us).
-- new event kinds: routine_done {routine_key, date}, goal_status_derived,
--   project_status. routine_key = stable slug of the Week Plan line;
--   idempotency via existing UNIQUE(source_id, kind, external_ref) with
--   external_ref = "{routine_key}:{date}" — no routine table in v0.2.
-- RATIFIED amendment (b): goal.status and assignment.status are materialized
--   caches with exactly ONE writer each (derivation pass / agent_invoke
--   lifecycle); every transition is an event first (one-write-path law); a
--   timed-out or error-text invocation can never write 'done'
--   (freshness≠success applied to assignments). parked stays human-only.
```

## See also

[[03-feature-list]] (features 17–19, summary form) ·
[[04-screens-pwa]] (routes `/projects` `/goals` `/routine`) ·
[[01-design-system]] (muted-tier rule these screens obey) ·
[[08-agent-console]] (projects are assignment origin objects) ·
[[06-index]] (MOC, per-screen color table)
