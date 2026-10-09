# Eudaimonia — Implementation Docs

Task-level build plan for the ratified v1 design (`docs/plan/v1/`). The
plan settles **what** and **why**; these documents settle **in what order,
how each task proves itself, and how each is undone.**

| Doc | Contents |
|---|---|
| `EXECUTION.md` | Master schedule: ground rules, rollback tiers, phase table, dependency graph |
| `PHASE-P0-FOUNDATION.md` … `PHASE-P6-TWA-HARDENING.md` | One doc per phase: task graph + per-task spec (P4.5 = `PHASE-P4.5-LIFE-CONSOLE.md`) |
| `docs/plan/v1/*` | The ratified sources every task cites (never re-argued here) |

## How to execute a task

1. **Claim & read.** Open the phase doc, read the task's `Reads:` lines
   first. The plan docs win over this document wherever they disagree —
   so where a build decision genuinely supersedes a plan doc, the plan doc
   is amended (dated, in its `status:` field) rather than overridden here.
   A phase doc that quietly contradicts `plan/v1/` is a defect in the
   phase doc.
2. **Branch.** `git checkout -b T<phase>.<n>-<slug>` from a green `main`
   (git mechanics — fileMode, HTTPS push via athena, no-rewrite rule:
   EXECUTION.md ground rule §6).
3. **Build** per the task's **Build** section. `[impl]` blocks are binding
   decisions, not suggestions.
4. **Prove** per **Tests**, then tick **Done when** — a checkbox is ticked
   only by observed execution, never by intention. Load-bearing tasks get
   a second independent verification pass (02 §6, two-pass law).
5. **Commit pair.** One commit before touching code
   (`chore(TP.n): start <slug> — baseline green`), one or more after,
   ending with the task's closing commit (`feat(TP.n): ...` /
   `chore(TP.n): ...` as given). No task merges with a dirty tree.
6. **Update this doc.** Tick the phase doc's copy of the exit test, if
   the task completes one.

## Conventions

- Task IDs: `T<phase-token>.<n>` (T0.3 = P0 task 3). Phases match 02 §5
  (P0–P6) plus **P4.5**, the agent console slot named in 02 §3. P4.5's
  phase token drops the dot — its tasks are `T45.1`, `T45.2` — because
  `T4.5.1` would read as a sub-task of P4's own `T4.5` (the server
  screen). One phase, one unambiguous token.
- Every `Law` citation points at 02 §2 (law number) or 02 §6 (invariant).
- Rollback **Tier** per task: T1 re-export/regenerate · T2 redeploy API ·
  T3 restore SQLite backup · T4 compensating event (never a DELETE —
  the spine is append-only; corrections are new events, see EXECUTION.md §2).
- **Phase size** is a label for the phase's *upper* night estimate, so it
  never disagrees with the number beside it: **S** ≤ 6 nights · **M**
  7–12 · **L** 13+. (P5 read "Size S · ~8–10 nights" while P0 read
  "Size M · ~8–10" — fixed 2026-10-09.)
- **Task grammar** (every task carries these, in this order): `Reads` ·
  `Depends on` · `Parallel with` · `Tier` · `Build` · `Tests` ·
  `Done when` · `If it fails` · `Commits`. `Parallel with` means *no
  ordering constraint* — with one developer on evening slots nothing runs
  concurrently, so it buys freedom of sequence, never schedule
  compression (EXECUTION.md Part I estimate basis).
- **Canonical tree** (frozen by T0.1; every test path in every phase doc
  resolves inside it):

  | Path | Holds | Toolchain |
  |---|---|---|
  | `app/` | FastAPI, migrations, adapters, renderer | uv · ruff · mypy strict · pytest |
  | `app/tests/<area>/test_*.py` | all server-side tests | pytest |
  | `client/src/routes/` | one module per 04 route (blur-lint glob) | — |
  | `client/src/<area>/` | non-route client code (`sw/`, `theme/`) | — |
  | `client/src/**/*.test.ts(x)` | all client tests, colocated | vitest |
  | `staged_writebacks/` | the only vault-writing code in the repo | — |
  | `deploy/` · `e2e/` · `widgets/` | P6 infra, suites, presets | — |

  A phase doc naming a path outside this tree (`apps/api/`, `web/src/`,
  `server/tests/`) is a defect in the phase doc, not a second layout.
