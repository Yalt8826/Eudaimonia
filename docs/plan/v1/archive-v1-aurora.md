---
project: Eudaimonia
doc: Design System v1 — "Aurora"
owner: praxis
status: measured + ratified (2026-10-08)
supersedes: palette shortlist of 2026-10-06
---

# Eudaimonia Design System v1 — Aurora

Dark glassmorphism + paper reading tier. One line of philosophy: **glass for
glancing, paper for reading, color for meaning.**

## 1. Palette decision

User picked **teal + violet**. Those two accents are fused onto the DeepSea
base as a new palette: **Aurora** (default).

**Dual-accent role law (the rule that makes two accents mean something):**

| Accent | Hex | Means | Used for |
|---|---|---|---|
| **Teal** (interactive) | `#2DD4BF` | *things you do* | primary buttons, links, active nav, habit chips, tap targets, focus rings |
| **Violet** (reflective) | `#A78BFA` | *things agents do* | narrated-layer markers, agent attribution, question pickups, provenance hints, capture-triage affordances |

Base + ink:

| Token | Hex | Notes |
|---|---|---|
| `--bg` | `#081217` | near-OLED blue-black |
| `--text` | `#E2EFF1` | |
| `--muted` | `#8FA8AD` | captions, coverage lines |
| `--glass-fill` | `rgba(255,255,255,0.06)` | + blur recipe below |
| `--glass-border` | `rgba(255,255,255,0.10)` | 1px |
| `--paper-fill` | `rgba(255,255,255,0.13)` | blur **off** |
| `--scrim` | `rgba(4,10,12,0.55)` | modals, sheets |

**Fixed semantic state colors — palette-invariant across all six themes:**

| State | Hex | |
|---|---|---|
| alive | `#3FB950` | |
| dead | `#F85149` | |
| paused | `#D29922` | |

### Measured contrast (WCAG, composite over fills — 2026-10-08)

| Pair | CR | |
|---|---|---|
| text / glass | 14.06 | AAA |
| muted / glass | 6.59 | AA |
| teal / glass | 8.88 | AAA |
| violet / glass | 6.08 | AA |
| paused / glass | 6.55 | AA |
| text / paper | 11.29 | AAA |
| muted / paper | 5.30 | AA |
| violet / paper | 4.88 | AA |
| teal / paper | 7.14 | AAA |
| ink-on-violet (btn) | 6.96 | AAA |
| ink-on-teal (btn) | 10.17 | AAA |

All ≥ 4.5. Nothing renders below AA on any surface.

### Shipped alternatives (picker, all previously verified @ 6% glass + 13% paper)

| Name | bg | accent | one-liner |
|---|---|---|---|
| **Aurora** (default) | `#081217` | teal + violet | the fusion you chose |
| Agora | `#0B0F14` | `#4CC9F0` | technical cyan |
| Elysian | `#0D0B14` | `#A78BFA` | calm violet |
| Ember | `#101214` | `#FF8C5A` | warm orange |
| Nocturne | `#120D10` | `#F472B6` | soft pink |
| DeepSea | `#081217` | `#2DD4BF` | Aurora's base, single accent |

Flipping is free; picker ships P0. State colors never move.

## 2. Surfaces & the blur budget

- **Glass tier** (chips, strips, tiles, nav): `backdrop-filter: blur(14px) saturate(140%)` over `--glass-fill`, 1px border, radius 16.
- **Paper tier** (Sunday review, questions, any 300+ word surface): `--paper-fill`, **blur off**, radius 12. Blur behind body text measurably hurts comprehension; reading surfaces opt out.
- **Blur budget law: one backdrop-filter layer per screen.** Behind long lists (inbox, reading queue) the glass is a static fill — no live blur. A 07:00 app cannot stutter.
- **Hard-mode rule** (wake screen): no navigation, route precached, one full-bleed teal target, timestamp pre-filled from client clock, sub-2s cold-start, offline queue via service worker (`ts` = tap time, `ingested_at` = retry time).

## 3. Type

- UI: **IBM Plex Sans** · Paper/reading: **IBM Plex Serif** · Mono (coverage lines, IDs, code): **IBM Plex Mono**. Self-hosted woff2, OFL.
- Ramp: 13 / 15 / 17 / 22 / 28 px. Body 15–17px, line-height ≥ 1.6, measure 60–70ch on paper tier. Review renders at reading size, never dashboard size.

## 4. Grid, radius, motion, icons

- Spacing 4px grid. Radius: 8 (chips) / 12 (paper) / 16 (glass cards) / 24 (sheets).
- Motion: 150–200ms ease-out, opacity+transform only. **No entrance animation on the wake route.** Respect `prefers-reduced-motion` everywhere.
- Icons: Lucide, 1.5px stroke. One icon set, tinted by accent role.

## 5. Component recipes (tokens only, zero new deps)

| Component | Spec |
|---|---|
| Strip card | glass tier, radius 16, header row (icon + title + coverage line right-aligned mono muted) |
| Coverage line | mono 13px muted: `digest · dead since Sep 22` + state dot in fixed state color |
| Habit chip | glass pill; fill = teal @ 18% when done today, teal border on due; recall values render `~` prefix |
| Primary button | teal fill, ink `#081217` text; secondary = teal border, teal text |
| Agent marker | violet dot / violet left-border 2px on narrated sections, agent-attributed cards |
| Fold drawer (email ignorable) | glass tier, muted text, collapsed by default — default-show law |
| Waiting-on tile | the only tile with a badge; badge = paused-amber when >0 (nagging allowed here alone) |
| Waiting-on actions | done / roll / drop — three text buttons, no icons, one tap each |

## 6. Cross-surface contracts

- **`/widgets.json`** ships the active palette's tokens + `age_minutes`; KWGT presets and the Hermes-desktop panel render from the same source of truth. Widgets are read-only doors.
- **Obsidian dialect** (exports): YAML frontmatter (`week`, `layer`, `generated_at`, per-source coverage counts) so Dataview queries reviews; coverage block as callout — `[!success]` alive / `[!failure]` dead (system failure only) / `[!warning]` paused / neutral `[!note]` for behavioral dormancy (muted tier; remediation hint carries the action; a lapsed habit never renders dead-red) — reusing the fixed state colors in theme CSS; carry-forward as `- [ ]` tasks; wikilinks to daily notes. Reviews are first-class vault citizens.
- **Tailnet-only, no auth layer.** Dark theme is the only theme.

## 7. Files this system governs

Every screen doc in this folder renders from these tokens. Screen specs
reference tokens by name (`--accent-2`, `--surface-reading`) — never raw hex,
so a palette flip is a token edit, not a redesign.
Aliases: `--accent-1` = teal (you act) · `--accent-2` = violet (agents act) ·
`--surface-reading` = the paper tier (fill var `--paper-fill`, blur off).

**Dormancy is not a state color.** Behavioral-class silence (meals,
wake-taps) renders in the **muted tier** — neutral callout in Obsidian
exports, muted dot in UI — never dead-red. Red is reserved for *system*
failure a human must fix; a lapsed habit gets information plus its
remediation hint ("wake-tap is the designated restart · send today's
meals"), not an alarm. Same taxonomy note: **accent color renders
provenance, not parallel state** — `agent-write` renders violet,
`app-write`/`source-read` render teal, everywhere origin is shown.

## See also

[[02-architecture]] (laws & schema that consume these tokens) ·
[[04-screens-pwa]] · [[05-screens-desktop-widgets]] (token consumers) ·
- [[06-index]] (per-screen color table, MOC)

**Hue discipline (render law, binding on prompts and UI alike):** accent
hues encode *provenance, action, and state* — never data series, never
value categories. Data differentiates by weight and mono styling. Where an
older doc line contradicts this (e.g. a data series colored teal/violet),
this paragraph governs.
