---
project: Eudaimonia
doc: Feature List v1
owner: praxis (compiled from all five seats' final slates)
status: signed + frozen scope (2026-10-08)
---

# Eudaimonia — Feature List v1

**What it is:** a personal life-OS hub. One server on olympus, three thin
clients (phone PWA, PC window/PWA, widgets). Agora is where agents work;
Hermes is the messenger; Eudaimonia is where it all comes together for you.

**The laws every feature obeys** (full text in `02-architecture.md`):
freshness≠success · chain-following ingest · content-derived dates · two-tap
law · app-owned writes · computed tenancy · alive/dead/paused · coverage
honesty · recall-first email · one write path (PWA is the only interactive
write client; fuzzel & KWGT deep-links are doors) · hard-mode
surfaces · provenance on every generated artifact.

---

## DAILY LAND

### 1. The Plaza (Today view) — Noesis
**What it does:** one screen that renders itself from live sources — today's
plan line (Week Plan.md), tasks due today incl. overdue actives (Task
List.md), yesterday's recap (day reports via the live chain), agents
currently running, one line per daily strip. Dead or stale sources render
coverage lines ("reports 3 of 7 · plan stale 38 days") — never empty, never
lying. Zero input required, ever.
**Everyday help:** the 07:00 briefing you already read, become a place
instead of a message. Opening costs nothing.
**Lives:** home screen. The only front-page real estate.

### 2. Waiting-on inbox — Praxis + Noesis
**What it does:** one list of everything parked on you. Two adapters, one
inbox: **human half** (commitments you owe people — reply, send, decide) and
**machine half** (kanban cards blocked `needs_input` on you, review
requests, agent questions). Each item: one-tap **done / roll to tomorrow /
drop**. Resolutions are app-owned events in SQLite.
**Everyday help:** the only screen that unblocks rather than displays; the
direct countermeasure to the most-documented failure pattern in your
history (late replies, dropped commitments). Day-one content: two overdue
Task List actives already visible.
**Lives:** daily land beside the plaza. The only tile permitted to nag —
about unblocked work, never guilt.

### 3. Habit row — Noesis + Hygeia
**What it does:** max 2–3 actively-changing habits, rolling "4 of 7" chips,
one tap each. First resident: **wake-time** — the hard-mode surface
(preloaded, full-bleed tap, sub-2s, works offline via service-worker queue).
Recall entries ("woke ~8:30, logged at noon") render `~` everywhere, forever.
**Everyday help:** the app's only genuinely new daily capture — one tap on
waking anchors the sleep schedule, your most persistent drift. No streaks.
**Lives:** plaza strip; stats ride Sunday's draft. Widget deep-link may
auto-POST the pre-filled tap through the same write path.

### 4. Nutrition strip — Hygeia
**What it does:** kcal + protein vs target, read from Hygeia's markdown
chain — zero new capture. Renders honest dormancy today ("0 of last 7 ·
last logged Aug 16"). Meal values are agent **estimates** and render with
`~`; day totals cross-check row sums (rows canonical, mismatch flagged).
**Everyday help:** when logging lives, it's one number in the morning; when
it dies, this strip is the first to say so — the week it dies, not week 7.
Capture-inbox `meal` target routes photos to Hygeia async.
**Lives:** plaza strip, provisional on liveness. Computed tenancy: demoted
after 14 silent days; re-earns at ≥3 fresh logging days in trailing 7.

### 5. Reading triage strip — Zetesis
**What it does:** every digest paper lands in one queue — seeded day 1 from
the ~80 unique papers in the 20 good editions — flowing new → skimmed →
digested → dismissed, optional 1–5 rating. Digest liveness renders as a
first-class tile ("digest dead since Sep 22 · paused Oct 2"). Rating
write-back to `digest_prefs.md` is a declared experiment with a kill
metric: <10 ratings in 4 weeks → cut the write-back, keep the queue.
**Everyday help:** papers stop evaporating into 08:00 scrollback.
**Lives:** morning-flow strip, provisional on liveness (pipeline class:
instant re-earn when the success predicate passes again).

---

## WEEKLY ZONE — one generated document

### 6. Weekly Review (two-layer) — Clio
**What it does:** every Sunday, one markdown file per ISO week, vault-path
`Eudaimonia/Reviews/`, Obsidian dialect (frontmatter, callouts, tasks,
wikilinks). **Mechanical layer** — app-computed, zero agent dependency,
cron-proof: ① coverage block first, always ② plan-vs-actual drift figure ③
tasks & loops resolved/carried ④ habit windows ⑤ wellness paragraph
(estimates marked, "restart confirmed" headline after ≥14-day dormancy,
trend claims locked until two covered weeks) ⑥ reading & research ⑦
activity digest incl. ops line (containers, restarts) ⑧ carry-forward as
task syntax. **Narrated layer** — in-app agent pass via `agent_invoke`, no
cron: "Patterns & notes," every number must match the mechanical export
(normalized numeral-diff gate), patterns labeled inference with a 4-week /
≥5-covered-day evidence floor, context-note temporal gate (expired notes
explain past weeks, never current ones). Regeneration is an upsert —
`UNIQUE(kind, week_id, layer)`.
**Everyday help:** Sunday reflection becomes editing five paragraphs instead
of facing a blank page. Past reviews are inputs to future drafts — "third
week running" is grounded, not vibes.
**Lives:** the weekly zone *is* this document; two taps from plaza →
"This week." Full render contract (sections, gates, file skeleton):
[[09-weekly-review-format]].

---

## ON-DEMAND — two taps from the plaza

### 7. Open Questions — Zetesis
**What it does:** frictionless "I wonder…" capture; questions sit as a list,
any agent picks one up async (via `agent_invoke`), briefs link back.
**Everyday help:** makes asking as cheap as thinking; curiosity stops
evaporating. **Lives:** on-demand tab; Sunday's draft summarizes open ones.

### 8. Activity timeline — Praxis
**What it does:** "what did I actually do this week?" answered from the
event spine — agent runs, invocations, kanban moves, service up/downs,
reports, commits — not memory. Filterable deep view.
**Everyday help:** zero cost on good days, the whole answer on reflective
ones; the substrate agents need before any of them can reason about your
life. **Lives:** draft section 7 + a two-tap deep view.

### 9. Capture inbox — Praxis (ships early-P2)
**What it does:** one raw-text/photo dump (desktop: Hyprland keybind →
fuzzel prompt → POST /capture; phone: share target) that an agent triages
async via `agent_invoke` into **task / question / loop / note / meal**. The
22:00 debrief's replacement lives here eventually; until then, narrate days
to Noesis in chat and the report chain stays alive.
**Everyday help:** one pipe instead of five queues that each die at
friction. **Lives:** one + button in the plaza; triage targets already exist.

### 10. Agents screen — Praxis
**What it does:** one row per Hermes profile (glob-enumerated, never
hardcoded — profiles come and go): cron liveness (alive/dead/paused + why),
last-run output, uptime; Multica tasks read-through its API (never direct
DB); invocation history from the spine. The screen that would have shown
one dead digest and five paused jobs this month in one glance.
**Everyday help:** answers "what are my agents actually doing?" — the
Eudaimonia↔Agora bridge made visible. **Lives:** on-demand screen.

### 11. Server screen — Praxis
**What it does:** containers (docker), systemd user units, htop-style
CPU/mem snapshots — read-only in v0. Presence events (up/down/restart) are
spine events; "multica-frontend restarted 4× this week" becomes a Sunday
sentence. Restart buttons: P7+, explicitly confirmed, never before.
**Everyday help:** the state of olympus at a glance, wherever you are.
**Lives:** on-demand screen.

### 12. Email triage — Praxis (P5+)
**What it does:** per-account sources (own tenancy, own credentials,
gitignored .env — only). Rule-based classifier first: List-Unsubscribe →
subscription, contact allowlist → keep. **Recall-first law: default-show,
never default-hide** — agent-flagged-ignorable mail folds into a thin
drawer; you correct the folds, taps tune the classifier. LLM pass
(himalaya or gateway, to be installed) only for ambiguous residue.
**Everyday help:** "only the important ones" without ever silently eating
an interview invite. **Lives:** on-demand; one stats line in the weekly draft.

### 13. Notes → Obsidian — Praxis
**What it does:** type a note in the app; it lands append-only in the vault
daily note (or `Eudaimonia/Inbox.md`) — existing vault lines are never
touched. Each note becomes a source event, so Sunday's draft can quote your
own words back with provenance. Exports flow the other way as first-class
vault citizens (frontmatter, callouts, wikilinks).
**Everyday help:** the app and your vault stay one knowledge base, not two.
**Lives:** capture flow + notes tab (on-demand).

---

## UNDERGROUND — invisible, load-bearing

### 14. Coverage honesty
Every strip and section renders "N of last 7" and staleness; widgets render
server-supplied `age_minutes`. The week this thread audited itself: one
flagship job dead 11 mornings, one habit dormant 8 weeks, two stale vault
archives, a feedback loop that never closed once (0 ratings ever) — every
one invisible to the old stack, every one a coverage line here.

### 15. Provenance edges
Every generated artifact — narrated sections, agent answers, triaged
captures, staged write-backs — cites its origin (file#L12, event,
session log). One click from "why do I believe X?" to evidence. The
mechanism under the assert/quote gate and the estimates law.

### 16. The event spine + laws
One boring SQLite write path; every state change an event; entity tables
are indexes, not truth. Sources declare both vault globs and live-chain
globs (chain-following); success predicates per source (freshness≠success);
computed tenancy by source class; alive/dead/paused with human-only pause
actors; app-owned state never lives in markdown; staged write-backs carry
`write-back` provenance edges.

---

### 17–19. Goals, projects & routines — the life nouns (added v1.1, [[07-life-layer]])
**What they do:** goals = long-horizon outcomes with derived status
(Germany MSc, dMAT, GRE — at-risk computed from linked overdue work, never
hand-colored); projects = first-class records for what you're building
(Market Momentum, Kerdos) with kanban-linked board health; routines = the
Week Plan backbone as tappable daily items (`routine_done` events feed the
drift view's actual side). Full spec: [[07-life-layer]].
**Everyday help:** the three nouns from the original brief that v0 had no
home for; parked/lapsed things render as information (muted), never alarms.
**Location:** on-demand (`/projects`, `/goals`); routines live as the
checkable plaza plan strip.

### 20–21. Agent chat & task assignments (added v1.1, [[08-agent-console]])
**What they do:** talk to any profile from inside the app with automatic
context attachment (current review, loop history, a paper) through the one
`agent_invoke` primitive; assign tracked tasks to agents from any object
(question, capture, project). Responses are attributed agent-write events
with provenance; agent proposals that would mutate state land as
suggestions requiring your tap.
**Everyday help:** the "interact with Hermes and my other agents" promise —
directed with context, logged forever.
**Location:** `/chat`, `/chat/[profile]`, "assign" action sheet, assignments
tab in `/agents`.

## Deliberately not building
Manual time tracking · streaks/gamification · hydration or step tracking ·
daily prompted journaling · rich-text editors · sync server / auth / plugin
system · unified event store day 1 · citation manager / personal wiki ·
widget write paths · app-side restart buttons (v0) · default-hide email.

---

## Pending calls (parked here until answered)
① digest repair (Zetesis — repoint model, fix prefs note, un-pause
output-only, probe) · ② P0 go · ③ capture at early-P2 (three seats
recommend) · ④ Noesis's debrief-replacement reinstate (repointed 22:00 job,
telemetry-narrated, actor=human go required) · ⑤ Week Plan refresh
(low-guilt nudge).

---

## See also

[[02-architecture]] (laws & schema full text) ·
[[01-design-system]] (how features render) ·
[[04-screens-pwa]] · [[05-screens-desktop-widgets]] (where features live) ·
[[06-index]] (MOC)
