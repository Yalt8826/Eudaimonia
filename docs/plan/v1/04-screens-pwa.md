---
project: Eudaimonia
doc: Screens v1 — Phone (PWA, single-route SPA)
owner: praxis (design system: 01-design-system.md)
status: spec'd for build (2026-10-08); amended 2026-10-09 — `/mail`
  added to the route map and the More sheet (feature 12 had a screen in
  03 but no route here; it ships P5)
---

# Screens — Phone (PWA)

Stack: single React PWA, installed to homescreen. Dark **Matte & Torn** (v2) default.
Route depth: the plaza is `/`, everything else two taps deep. One blurred
layer per screen (blur budget law). Every strip carries a coverage line.

## Route map

```
/                    Plaza (Today)
/inbox               Waiting-on inbox
/habits/wake         Wake screen (hard-mode, precached)
/week/[iso]          Weekly review (paper tier)
/questions           Open Questions
/timeline            Activity timeline
/reading             Reading queue (full)
/meals               Nutrition detail (fold drawer for full day)
/agents              Agents screen (+ assignments tab)
/server              Server screen
/capture             Capture compose (also share-target)
/notes               Notes (→ Obsidian)
/mail                Email triage (recall-first; ships P5)
/projects            Projects board (v1.1) + /projects/[id]
/goals               Goals horizon (v1.1, paper tier)
/routine             Routine day detail (v1.1)
/chat                Agent console (v1.1) + /chat/[profile]
/settings            Palette picker, widget tokens, sources health
```

## `/` — Plaza (home, Noesis)

Purpose: replace the 07:00 briefing with a place. Zero input required.
Renders fully when sources are dead.

```
┌──────────────────────────────────────────────┐
│ Today · Wed Oct 8            ⚙  ＋ capture   │  ← mono date, muted
│                                              │
│ ╔════════════════════════════════════════╗   │
│ ║ TODAY'S PLAN                           ║   │  ← glass, teal left-rule
│ ║ dMAT 3:00 · GRE 3:45–6:45 · Gym 7:00   ║   │     (from Week Plan)
│ ║ plan stale 38 days ⚠                   ║   │  ← paused-amber hint
│ ╚════════════════════════════════════════╝   │
│                                              │
│ ┌ WAITING ON ──────────────────────── (3) ┐  │  ← the nagger; badge amber
│ │ reply APS India · since Aug 24    [→]   │  │     tap → /inbox
│ │ 2 kanban cards parked on you      [→]   │  │
│ └─────────────────────────────────────────┘  │
│                                              │
│ WAKE ● 4 of 7        [ tap when you wake ]   │  ← habit row; teal chip;
│                                              │    deep-links /habits/wake
│ NUTRITION · 0 of 7 · last logged Aug 16     │  ← dormancy rendered plain
│ READING · 80 queued · digest paused Oct 2 ●  │  ← state dot D29922
│                                              │
│ YESTERDAY                                    │
│ reports 1 of last 7 · Oct 2 via debrief      │  ← coverage honesty, mono
│ ─ narrated by Noesis (chat) ──────── ● plu  │  ← plum = agent attribution
│                                              │
│ AGENTS · zetesis 🔴 repair · 3 crons paused  │  → /agents
└──────────────────────────────────────────────┘
```

Interactions: pull-to-refresh only (no polling spinners); every strip is a
two-tap portal; `＋ capture` floats bottom-right (teal, the one FAB).

## `/habits/wake` — Wake screen (hard-mode law)

Opens from alarm-hour taps: **no nav bar, no header, no animation.**
Full-bleed teal surface, one giant tap target:

```
┌──────────────────────────────────────────────┐
│                                              │
│                                              │
│              GOOD MORNING                    │
│              07:14 tap time                  │   ← client clock, pre-filled
│                                              │
│          ╔──────────────────────────╗        │
│          ║        I'M AWAKE         ║        │   ← 100% width, 96px tall
│          ╚──────────────────────────╝        │
│                                              │
│    woke earlier? log ~recall instead         │   ← muted, 40px target
│                                              │
└──────────────────────────────────────────────┘
```

Tap → local queue → POST. Offline: queues silently, "will sync" appears
after the tap — never blocks. Recall path opens a minute pad, value
renders `~` forever.

## `/inbox` — Waiting-on

Two tabs (Owed by me / Owed to me), rows sorted by age: title, since-date,
source chip (human/kanban/agent). Swipe or tap: **done · roll · drop** —
three text buttons, no icons, no confirm modals (a reply you already sent
needs no "are you sure"). Resolutions emit app-write events; drop asks a
one-line reason only the first time per source.

## `/week/[iso]` — Weekly review (paper tier)

The one document, rendered on `--surface-reading` (blur off), IBM Plex
Serif, 65ch measure. Structure = the mechanical 8 sections; coverage block
first as status rows with fixed state dots; narrated sections carry the
plum left-rule + "assembled by clio · provenance" footer. "Export to
vault" button → staged write-back (Obsidian dialect). A numeral mismatch
can never render: the gate rejects before paint.

## `/reading`, `/meals`, `/questions`, `/timeline`

- **Reading:** cards (title, one-line why, edition date, arXiv tag), flow
  new→skimmed→digested→dismissed as a horizontal 4-stop stepper per card;
  1–5 rating = tap 1–5 on the card (staged). Digest liveness banner pinned
  top when not alive.
- **Meals:** day cards (estimates marked `~`), fold-out full day table;
  "log a meal" → /capture prefilled `#meal`.
- **Questions:** list; open → picked_up (plum, agent name) → answered
  (brief renders on paper tier, provenance footer).
- **Timeline:** filter chips (all / agents / kanban / services / docs),
  vertical event feed from the spine, mono timestamps. This is the "what
  did I actually do" answer.

## `/mail` — Email triage (recall-first, P5)

Default-show is the layout, not a setting (law 10): every envelope in the
trailing window renders in the main list. Agent-flagged-ignorable mail
folds into a thin fold-drawer pinned at the bottom — one line ("312
folded · subscriptions"), one tap to open, every folded mail still
openable from it (two-tap law). A folded row always renders *why*
("folded: list-unsubscribe"); a corrected row marks the human override.
One tap folds or unfolds anything, and corrections tune the classifier.
Per-account coverage lines ride the shared view. With the classifier
dead or absent, everything renders in the main list — no tier reads as
show. Plaza carries only the count badge (paused-amber, the one nagger).

## `/agents` + `/server`

- **Agents:** one row per profile — name, state dot (alive/dead/paused +
  reason: "digest dead since Sep 22 — free-model expiry"), last-run time
  (mono), invocation count this week; Multica tasks section below
  (read-through). Tapping a dead row shows its remediation hint.
- **Server:** containers + units as status rows (fixed state colors),
  sparklines (CPU/RAM, 24h), restart counts; everything read-only. A
  restart button exists nowhere in v0 — by law.

## `/capture` — compose + share target

One textarea (or shared photo), triage chips auto-suggested, "Send" →
`agent_invoke` triage → lands as task/question/loop/note/meal. Shows triage
result inline when it returns; queue-and-forget when offline.

## Global chrome

Bottom nav, 5 slots: **Plaza · Inbox · ＋ · Week · More** (More = sheet
with questions/timeline/reading/meals/mail/agents/server/notes/projects/goals/routine/chat/settings
— two-tap law satisfied). Status dots anywhere = the three fixed state colors, never
accents. Behavioral dormancy (nutrition strip today) renders muted, not red.
Splash: none (wake route can't afford it; consistency wins).

## See also

[[01-design-system]] (tokens, blur budget, dormancy rule) ·
[[03-feature-list]] (what each screen's features do) ·
[[05-screens-desktop-widgets]] (PC + widget counterparts) ·
[[06-index]] (per-screen color table)
