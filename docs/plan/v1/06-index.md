---
project: Eudaimonia
doc: Plan v1 — Index & MOC
owner: praxis
updated: 2026-10-09 (split-plane amendment applied; `/mail` route +
  09 fifth-state + P3 seed-rule amendments applied)
tags: [eudaimonia, moc, plan]
---

# Eudaimonia — Plan v1 Index

Personal life-OS. One server (olympus; data plane `/api/*` tailnet-only
no-auth, static plane on the public app domain), three thin clients.
Agora is where agents work; Hermes is the messenger; **Eudaimonia is where
it all comes together.**

## The docs

| # | Doc | What's in it |
|---|---|---|
| 01 | [[01-design-system]] | **Matte & Torn** v2 (matte black, teal+deep plum, torn-paper under-layer) — all contrast measured; glass & paper tiers; type, grid, motion, component recipes; widget/Obsidian token contracts |
| 02 | [[02-architecture]] | one-server topology, the 12 binding laws, frozen schema v0.1, client contracts, phased build order P0–P6 with exit tests |
| 03 | [[03-feature-list]] | all 21 features (16 v1 + 5 v1.1): what each does, everyday payoff, where it lives, anti-features |
| 04 | [[04-screens-pwa]] | every phone screen: wireframes, interactions, route map, global chrome |
| 05 | [[05-screens-desktop-widgets]] | PC wide layout + capture paths (fuzzel), KWGT widget, Hermes-desktop panel, widget laws |
| 06 | [[06-index]] | this MOC: per-screen color assignments, status, pending calls |
| 07 | [[07-life-layer]] | **v1.1** — projects, routines, goals: the original-brief nouns; schema v0.2 additive deltas |
| 08 | [[08-agent-console]] | **v1.1** — agent chat + task assignments: the "interact with agents" promise, scoped honestly |
| 09 | [[09-weekly-review-format]] | the Sunday draft's full render contract: 8 mechanical sections, narrated gates, file skeleton — P4 renderer's source of truth |

## Design decision (user-picked, 2026-10-08)

**Matte + torn paper, teal + deep plum** → design **Matte & Torn** v2: `#0B0B0C` matte base (static grain),
**teal `#2DD4BF` = interactive** (things you do), **deep plum `#B872F2` =
reflective** (things agents do), fixed state colors alive/dead/paused.
Verified: every pair ≥ 4.5 CR on both glass (6%) and paper (13%) tiers.

## Per-screen color assignments (the "proper color for each screen")

| Screen | Surface | Accent usage |
|---|---|---|
| Plaza `/` | **torn sheets, one tint per section** (mint/sky/blush/butter/violet), edge to edge over the matte skin | teal: plan rule, wake chip, capture FAB · plum: agent-attributed lines · paused-amber: staleness hints only · every state dot in its own glass well (01 §5) |
| Wake `/habits/wake` | **full-bleed teal** | deliberate exception to the night-vision rule — a 5-second alerting tap target at 6am *should* be bright; ink-on-teal 10.17 CR |
| Inbox `/inbox` | glass, neutral | actions teal; the count badge paused-amber (the one nagger) |
| Week `/week/[iso]` | **torn-paper sheet**, serif | plum left-rule = narrated sections; ink-pair state dots = coverage; zero accent in body text |
| Reading `/reading` | paper sheet | teal: triage stepper + your ratings · plum: agent one-line summaries |
| Meals `/meals` | glass | data series: **protein vs kcal differentiated by weight only — bold vs regular muted mono, never by accent hue** (hues carry provenance/action/state exclusively); `~` on all estimates |
| Questions `/questions` | glass | plum lifecycle (open→picked_up→answered) — agents' flow |
| Timeline `/timeline` | mono, muted | state dots only for service/agent events |
| Agents `/agents` | neutral rows | state dots green/red/amber carry the meaning; plum for invocation entries |
| Server `/server` | neutral rows | state dots; sparklines muted mono (data never rides accent hue); **no restart buttons in v0** |
| Capture `/capture` | glass sheet | **plum primary button** — you dump, agents triage (role law in one button) |
| Mail `/mail` | glass | fold-drawer neutral; **count badge paused-amber** (the one nagger) · fold reasons muted mono · red only for a dead adapter, never for unread |
| Notes / Settings | glass | teal save/apply; palette picker previews live |
| Projects `/projects` | glass columns | neutral rows + board state dots; teal = your actions; parked renders muted, never red |
| Goals `/goals` | **paper tier** (reading surface) | derived statuses: paused-amber at-risk, green achieved; red never (lapsed plans are information) |
| Routine strip `/` + `/routine` | glass | ticks teal (you act); unchecked renders plain; coverage line when day missing |
| Agent chat `/chat/[profile]` | glass thread | **plum = agent turns, teal = yours** (provenance rendered); attachment chips plum-outlined |
| Assignments (in `/agents`) | rows | status via spine states: queued/running amber→teal→green; plum attribution |

## Status

- Schema v0.1 **frozen** (owner: Noesis) · **v0.2 ratified** 2026-10-08
  (additive: project/goal/assignment tables, no frozen-table columns, per
  [[07-life-layer]] / [[08-agent-console]]). Design system **measured + ratified**.
- Build order P0–P6 signed with named exit tests — see [[02-architecture]] §5.
  Task-level plan: `docs/implementation/` (one doc per phase, **P4.5
  included** — the agent-console slot 02 §3 named; all 21 features now
  carry tasks, ~69–90 nights total).
- Pending user calls: ① P0 go (user deferred 2026-10-09 — design continues
  until go) ② Week Plan refresh. Resolved 2026-10-09: origin **yalt8826.com**
  + CF Tunnel (Path 3, static plane only) · scheme `web+eudaimonia` (adopts
  at TWA day) · KWGT Pro pre-approved · split-plane + wake-lifecycle
  amendments RATIFIED (02, 05). Capture early-P2 already signed into 02 §5.
  Paused life-ops pipelines deleted at user request — recreate later on a
  live channel (Mattermost removed; Telegram down).

## Related (vault)

- Exports will land in `Eudaimonia/Reviews/` (Obsidian dialect: frontmatter,
  callouts, carry-forward tasks, wikilinks) once P4 ships.
- Laws recap in one line each: freshness≠success · chain-following ·
  content dates · two-tap · app-owned writes · computed tenancy ·
  alive/dead/paused · coverage honesty · recall-first email · estimates
  law · hard-mode surfaces · one agent primitive.
