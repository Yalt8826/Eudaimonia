---
project: Eudaimonia
doc: Architecture v1
owner: praxis
status: ratified (2026-10-08); P3 seed-count amendment 2026-10-09 (§5:
the reading seed is defined by the extraction rule in implementation
T3.1, not a round number — the live chain measures 70–88 uniques);
split-plane amendment 2026-10-09 (Path 3
public origin yalt8826.com + CF Tunnel) RATIFIED (Noesis two-pass, 2026-10-09);
schema v0.1 frozen (Noesis, 2026-10-02)
---

# Eudaimonia — Architecture v1

**Shape: one server, three thin clients, two network planes.** One
FastAPI + SQLite server on olympus. Data plane (`/api/*`): tailnet-only,
no auth — unchanged. Static plane (public app domain `yalt8826.com` →
tunnel → olympus): serves ONLY the SPA shell, PWA manifest + service
worker, and `/.well-known/assetlinks.json` (Digital Asset Links
verification for the TWA) — the data plane never leaves the tailnet.
Phone = PWA. PC = same PWA installed as a window. Widgets = read-only
doors into the same read API. Nothing else. (Split-plane amendment
2026-10-09: owner chose Path 3 — public domain — as the permanent
origin; see §6 "public plane serves shell only".)

## 1. Topology

```
tailnet (100.99.246.26)
└── Eudaimonia server (FastAPI + SQLite)          ← the ONE write path
    ├── reads   : vault chains, cron output dirs, kanban SQLite (ro),
    │             Multica API :8080, docker/systemd probes, psutil
    ├── writes  : app events → eudaimonia.db (idempotent, event-sourced)
    ├── exports : staged write-backs → vault md (w/ provenance edges)
    ├── invokes : agent_invoke → hermes --profile <name> -z (one primitive:
    │             narration, capture triage, question pickup, email class)
    ├── public  : yalt8826.com → tunnel → static files ONLY: SPA shell,
    │             manifest + SW, /.well-known/assetlinks.json — no /api
    └── clients : phone PWA · PC window · KWGT widget (read) ·
                  Hermes-desktop panel (read) · fuzzel capture (write→API)
```

- Server lives beside its data (vault at `/srv/data/vaults/main/`, cron
  chains at `~/.hermes/profiles/*/cron/output/`). NFS caveat: dev servers
  there need `WATCHFILES_FORCE_POLLING=true`.
- **One write path.** Every state change — adapter ingest, wake tap, loop
  resolution, rating stage — emits an event first; entity tables are
  denormalized indexes of current status. Idempotency + provenance each
  live in exactly one place: `UNIQUE(source_id, kind, external_ref)`.
- **Heavy sources stay read-through** (Multica, server metrics, htop) —
  not ingested; presence *events* (up/down/restart) are ingested.

## 2. The laws (binding on every component)

1. **Freshness ≠ success.** `last_ok_read_ts` advances only when an
   artifact passes the source's success predicate (e.g. digest header ≠
   FAILED), never on mtime or file presence. Adapter failures are
   exceptions, not staleness — "source dead" and "adapter broken" are
   different coverage lines.
2. **Chain-following ingest.** Sources declare vault globs AND cron-output
   globs; ingest takes the newest content-dated artifact per day across
   chains (vault archives go stale — proven repeatedly; cron dirs are the
   live chain). Dedupe via the unique constraint; chain recorded in
   `external_ref`.
3. **Content-derived dates.** `ts` comes from artifact content (day
   headers are truth), never paths or mtimes; path lives only in
   `external_ref` / provenance edges.
4. **Computed tenancy.** Sources carry `class`: **behavioral** (meals,
   wake-taps — demote after 14 silent days, re-earn at ≥3 fresh days in
   trailing 7, judged on ingest timestamps) vs **pipeline** (digest,
   reports — demote on silence, re-earn the moment the success predicate
   passes). Strips auto-demote/promote; tenancy never fires on paused.
5. **Alive / dead / paused.** Three liveness states, different colors,
   different remediations. `paused` requires a recorded `job_paused` event
   with actor=human; the app never pauses or un-pauses anything itself.
6. **App-owned writes.** All app-originated state lives in SQLite.
   Markdown is never edited in place; write-backs (weekly reviews, notes,
   prefs staging) go through staged scripts that apply once and log a
   `write-back` provenance edge. Append-only into daily notes.
7. **Coverage honesty.** Every strip, section, and widget renders
   "N of last 7" + staleness from one shared `coverage` view. Missing days
   are data, never zeros.
8. **Two-tap law.** Everything demoted or on-demand stays reachable from
   the plaza in ≤2 taps. Demoted zones must not become attics.
9. **Hard-mode surfaces.** Any surface used within minutes of waking: no
   navigation, precached route, one full-bleed target, sub-2s budget,
   service-worker offline queue (tap `ts` = tap time; `ingested_at` =
   retry time; idempotency key = device UUID).
10. **Recall-first email.** Default-show; ignorable mail folds into a
    drawer; corrections tune the classifier. Never default-hide.
11. **Estimates law.** Agent-estimated values (meal kcal/P, recalled wake
    times) render with `~` and carry provenance to their estimation basis;
    estimated never renders as measured.
12. **One agent primitive.** `agent_invoke(profile, prompt, timeout,
    success_predicate)` — `hermes --profile <name> -z` primary,
    `HERMES_HOME` fallback; one place for retry/audit/limits; emits spine
    events (the agents screen's invocation-history feed rides it for free).

## 3. Schema v0.1 (frozen — DDL in migration 001)

Tables: `source` (adapter registry: globs, class, success predicate,
`last_ok_read_ts`, status enum) · `event` (the spine: ts, kind, origin
`source-read|app-write|agent-write`, source_id, external_ref, actor,
payload JSON; `UNIQUE(source_id, kind, external_ref)`) · `loop` (direction
owed-by-me/owed-to-me, done/rolled/dropped) · `question` · `reading_item`
(status, 1–5 rating, staged_ts) · `habit` + `habit_tap` events (payload
`method: 'tap'|'recall'`) · `document` (kind, week_id, layer
`mechanical|narrated`, path, sections JSON; `UNIQUE(kind, week_id,
layer)`) · `provenance_edge` (from_ref → to_ref) · `context_note` (dated
`valid_from`/`valid_until` events — config never pretends to know causes).

Payload conventions (non-migrating): `meal` values are estimates w/
food_db provenance; wake taps carry tap/recall method; ratings stage
before prefs write-back.

**v0.2 (additive, 2026-10-08, RATIFIED by Noesis):** `project`, `goal`,
`assignment` tables; project_id/goal_id ride event payloads, not frozen
task columns (see amendment (a) in [[07-life-layer]]);
new event kinds `routine_done`, `goal_status_derived`, `project_status`,
`agent_chat`, plus status enums per [[07-life-layer]] / [[08-agent-console]].
Additive only — no frozen-table changes, no origin-enum changes. Build
slot: routines + projects ride P2/P3; goals derive over accumulated
spine data (P4+); agent console + assignments = P4.5 (post-narrated-pass,
same `agent_invoke` budget).

## 4. Client contracts

- **PWA (phone + PC):** one codebase; installable both; service worker for
  offline wake-tap queue + precache; blur budget enforced in CSS layers;
  `/widgets.json` consumer on desktop panel; fuzzel keybind → POST
  /capture on athena.
- **`/widgets.json`:** waiting-on count, habit chips, `age_minutes`,
  active palette tokens. Read-only; KWGT Pro caveat (~$4) unresolved until
  touched on-device.
- **Multica:** read-through API only. **Kanban:** read-only SQLite globs,
  board dirs globbed, never hardcoded.

## 5. Build order (each phase has named exit tests; all phases P0–P4 are read-models first)

| Phase | Ships | Exit tests (samples) |
|---|---|---|
| **P0** | repo, migration 001 (frozen schema), theme.css (Matte & Torn default + picker incl. v1 Aurora entry), agent_invoke spike (first real profile call), PWA shell + palette picker | offline wake-tap round-trip; `hermes --profile` real invocation; contrast lint green per 01 v2 §7 |
| **P1** | adapters: tasklist, week plan, day reports (chain-following), kanban; **the Plaza** (read-only) | Sept gap backfill from cron chain; empty-dir → coverage lines, no crash; "yesterday" resolves from Oct 1 artifacts |
| **P2** | writes: wake-tap (+SW queue), waiting-on inbox + resolutions, **capture inbox** (early-P2: task/question/loop/note/**meal** triage via agent_invoke), notes→vault append-only | airplane-mode tap → force-stop → reopen → exactly one event, correct `ts`; fuzzel capture → triaged <5 min |
| **P3** | strips: reading queue (seeded from the digest chain) + nutrition strip (Hygeia chain, re-ingest exit test) + habits stats | re-ingest yields meals Aug 10–16 only, strip renders demoted; 20 OK editions → every unique paper the extraction rule yields, **zero dupes, one provenance edge per row** |
| **P4** | weekly review (mechanical 8 sections), agents screen, server screen, narrated pass (3 gates), staged export | W41 draft generates mechanical-only; numeral-diff gate rejects fabricated stat; narrated pass upserts, provenance edges resolve |
| **P5** | email (per-account, recall-first, himalaya/gateway), ratings write-back experiment + kill metric | fold-drawer corrections round-trip; <10 ratings in 4wk → write-back auto-cuts |
| **P6** | KWGT widget + Hermes-desktop panel, hardening, backup/restore drill | widget renders live tokens + age_minutes; restore drill passes; public origin: phone off-tailnet — `/` and `/.well-known/assetlinks.json` return 200, `/api/*` unreachable, wake tap rides the SW queue per hard-mode law 9 (§2) |

## 6. Invariants a reviewer can check in any PR

- No component writes to vault md except `staged_writebacks/`.
- No new `backdrop-filter` beyond one layer per screen (lint rule).
- Every agent call goes through `agent_invoke` (grep-able; no raw hermes
  subprocess anywhere else).
- Every rendered number on the review is traceable: event → mechanical
  doc → numeral-diff gate.
- All liveness UI uses the three fixed state colors — never accent colors.
  Behavioral dormancy is the exception by design: muted tier, never red.
- **Single-writer statuses.** Every status enum has exactly one writer
  (`goal.status` = derivation pass, `assignment.status`/`question.status`
  = the `agent_invoke` event stream); every transition emits its event
  first. The chokepoint **always emits a terminal outcome event** —
  timeout or mid-crash records failure, never silence — and reversals
  (question → `open`) ride that event. No hand-edits, ever.
- **Failure can never read as success.** A timed-out or error-text
  invocation can never write `done`/`answered` (freshness≠success on
  invocations).
- **No frozen-table columns.** v0.1 tables never gain columns in v0.2+;
  new links ride event payloads, views derive by query; promotion to
  columns only on measured pain.
- **Fresh evidence floor.** Derivations (goal status, drift claims)
  compute only from sources passing their freshness predicate; stale
  evidence renders "insufficient fresh evidence," never a judgment.
- **Two-pass verification.** Every defect-sweep or fix pass gets a second
  independent pass (different grep, different eyes) before "clean" is
  claimed — the author never solo-verifies their own sweep. (Earned
  2026-10-08, twice, by the seats that forgot it.)
- **Public plane serves shell only.** The public domain serves the SPA
  shell, PWA manifest + service worker, and `/.well-known/assetlinks.json`
  — nothing else. Any public `/api` route is a build-blocking defect; the
  data plane stays tailnet-gated at the tunnel edge, keeping "no auth"
  true. The wake route never degrades to a Custom Tab (TWA verification
  must pass on first install; wake stays full-bleed hard-mode — law 9,
  §2 above; screen spec: [[04-screens-pwa]] wake section).

## See also

[[01-design-system]] (tokens & render laws) ·
[[03-feature-list]] (scope these laws bind) ·
[[04-screens-pwa]] · [[05-screens-desktop-widgets]] ·
[[06-index]] (MOC + pending calls)
