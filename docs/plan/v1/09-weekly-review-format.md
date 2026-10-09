---
project: Eudaimonia
doc: Weekly Review Format v1 — the Sunday draft spec
owner: clio
status: plan of record (argued 2026-10-02→08; on disk 2026-10-08);
  amended 2026-10-09 — fifth render state `uninstrumented` added to §2#1
  per [[../../dry-run/2026-W37-dry-run]] finding 2 (implemented from P0,
  T0.2 Section 3)
supersedes: nothing; full detail behind [[03-feature-list]] feature 6
---

# Weekly Review Format

The P4 renderer's contract: one generated document per ISO week, two
layers, every rule reviewer-checkable. Summary lives in
[[03-feature-list]]; this file is the full spec — the chat is not the
record.

## 1. Identity & storage

- One review per ISO week, two `document` rows (`layer='mechanical'`,
  `layer='narrated'`). Regeneration is an upsert —
  `UNIQUE(kind, week_id, layer)` (frozen v0.1).
- One markdown file per week: vault `Eudaimonia/Reviews/<ISO-week>.md`
  (e.g. `2026-W41.md`), path recorded in `document.path`. Movable during
  build; the record is the row, not the path.
- Export order: mechanical writes first; the narrated pass re-exports the
  composed file. Both go through the staged write-back with a `write-back`
  provenance edge. App state lives in SQLite (law 6); the file is an
  export, never the master.
- Past reviews are first-class inputs: a "third week running" claim cites
  prior `document` rows through provenance edges — grounded, not vibes.

## 2. Mechanical layer — eight sections, fixed order

Renders with zero agent dependency; survives every cron being dead.

| # | Section | Content & rules |
|---|---|---|
| 1 | Coverage block (always first) | per-source lines from the shared `coverage` view: "day reports 5 of 7 · digest alive (repaired Oct 2) · meals dormant since Aug 16". **Five** render states (amended 2026-10-09): alive `[!success]` · dead `[!failure]` (system failure only) · paused `[!warning]` · behavioral dormancy neutral/muted · **`uninstrumented`** neutral `[!note]` — a source awaiting its first artifact ever, which the four dormancy-law states did not cover (W37 dry-run finding 2); it never alarms and stays Dataview-visible in the frontmatter `coverage` map. The review states its evidence base before claiming anything. |
| 2 | Plan vs actual | planned (Week Plan) vs actual (day_report + `routine_done`/`routine_skip` events). Honest sentence shape: "planned 4 · ticked 2 · skipped 1 · silent 1". Recall ticks render `~`. Missing days render missing, never zero. |
| 3 | Tasks & loops | completed this week, overdue still open, resolutions done/rolled/dropped, carry-ins. |
| 4 | Habits | rolling windows only ("wake within ±30 min: 4 of 7"), tap counts, `~` on recall-majority windows. No streaks. |
| 5 | Wellness | built only on Hygeia's quotable atoms (meal rows, day kcal/P sums, weight rows, targets line). Estimates render `~` with provenance to food_db rows. Headline rule: after ≥14-day dormancy, the first covered week renders "restart confirmed" — never a trend; trends locked until two covered weeks exist. |
| 6 | Reading & research | items by status, ratings given, editions seen (deduped), questions answered / still open. |
| 7 | Activity digest | the buried timeline query as one table, incl. the ops line (service up/down/restart counts from spine events). |
| 8 | Carry-forward | the explicit into-next-week list as Obsidian task syntax: open loops, unanswered questions, surfaced plan adjustments. The half that turns Sunday's read into Monday's behavior. |

A section with no data renders its coverage line — sections never
silently disappear.

## 3. Narrated layer — "Patterns & notes"

- Placement: optional short preamble + one "Patterns & notes" section,
  inserted immediately after the coverage block.
- Production: in-app `agent_invoke` pass over the mechanical export — no
  delivering cron anywhere in the loop (the paused Sunday recap job is
  retired; its history ingests as source events). Lands as `agent-write`
  events + the `narrated` document row; provenance edges to the session
  log and the mechanical document.
- Three gates, enforced by the staging checker — a gate failure blocks the
  write-back before the file is touched:
  1. **Numeral-diff gate** — every number in the narrative must already
     appear in the mechanical export (numerals normalized: weekday/month
     names, "5 of 7" vs "five of seven"). Fabricated or rounded stats fail
     staging. The assert/quote split as a gate, not a style guide.
  2. **Evidence floor** — pattern claims ("third week running…") require
     ≥4 weeks with ≥5 covered days behind them; below the floor,
     observations stay week-scoped ("slipped twice this week").
     Recall-majority data needs tap-majority before a window renders bare.
  3. **Temporal gate** — a `context_note` is quotable for week W iff its
     validity window intersects W; expired notes explain past weeks in
     retrospective reads, never current claims.
  4. **Lexical gate** — banned vocabulary in the narrated voice:
     "streak", "scoreboard", "cheat", and moralized evaluatives on
     behavioral data ("kept the streak alive", "perfect week"). Behavioral
     facts are narrated descriptively — "ticked 2 of 4 planned" — never as
     virtue or failure; evaluative status words ("on-track", "at-risk")
     belong to *goals* only, where they are derived, never to habits.
     Mechanically enforced by string match, same as gate 1.
- If the narrated pass doesn't run some Sunday, the mechanical export
  still ships. Narration is an enhancement layer, never a dependency —
  the most cron-fragile thing in the app sits on the layer that can't
  die.

## 4. File skeleton (the render contract)

```markdown
---
week: 2026-W41
layer: composed            # mechanical | narrated | composed
generated_at: 2026-10-11T20:00:05+05:30
coverage: {reports: "5/7", digest: "7/7", meals: "0/7", wake: "4/7"}
---

# Week 41 · 2026-10-05 → 2026-10-11

> [!note] Coverage
> day reports 5 of 7 · digest 7 of 7 (alive since Oct 2) ·
> meals 0 of 7 (dormant since Aug 16) · wake 4 of 7 (~1 recalled) ·
> email not yet instrumented

*Patterns & notes*   ← narrated only; provenance footer

## Plan vs actual        ## Tasks & loops
## Habits                ## Wellness
## Reading & research    ## Activity
## Carry-forward
- [ ] reply APS India
```

Frontmatter properties are Dataview-queryable; callout types follow the
mapping in [[01-design-system]] §6.

## See also

[[03-feature-list]] (feature 6, summary) ·
[[02-architecture]] (laws 6/7/11; gates echoed in §6 invariants) ·
[[07-life-layer]] (routine events feeding §2; goal evidence floor) ·
[[01-design-system]] (callout & token contracts) ·
[[06-index]] (MOC)
