---
project: Eudaimonia
doc: Design System v2 — "Matte & Torn"
owner: praxis
status: measured + ratified (2026-10-09); supersedes v1 Aurora
supersedes: v1 Aurora (kept verbatim as [[archive-v1-aurora]] — provenance law)
---

# Eudaimonia Design System v2 — Matte & Torn

One line of philosophy: **a matte black skin that tears open over light
paper. Glass for touching, paper for reading, hue for meaning.**

Change log v1→v2 (everything else carries over):

| | v1 Aurora | v2 Matte & Torn |
|---|---|---|
| Base | `#081217` blue-black + 6% glass everywhere | **matte textured black `#0B0B0C`** — glass reserved for buttons/bubbles/chips |
| Accents | teal + violet | **teal + Deep Plum Purple** (violet retired to v1 archive) |
| Reading surfaces | "paper tier" = opaque glass fill | **torn-paper under-layer** — the black skin tears open over light sheets |
| Nav | fixed bottom bar | **floating bubble cluster, bottom-right** (position setting), wake screen bare |
| State colors | one pair (dark surfaces) | **calibrated ink-pairs**: dark-on-glass + dark-on-paper |
| Laws | 12 | same 12 + tint-valence, widget self-glass, lexical gate |

## 1. Palette (all values measured 2026-10-09, matte glass = white @6% over `#0B0B0C`)

| Token | Hex | Measured | Role |
|---|---|---|---|
| `--bg` | `#0B0B0C` | — | matte textured black (static grain asset, ≤2% opacity, never animated) |
| `--text` | `#EDEDEA` | 14.83 on glass | primary ink on dark |
| `--muted` | `#9A9A94` | 6.15 on glass | captions, coverage lines |
| `--accent-1` (teal) | `#2DD4BF` | 9.34 glass | **you act**: buttons, links, ticks, taps, nav-active |
| `--accent-2` (plum) | `#B872F2` | 5.57 glass · 6.30 ink-on-fill · 1.42 vs teal | **agents act**: narrated markers, agent chat, provenance hints |
| `--accent-2-ink` (plum on paper) | `#7E22CE` | 5.98 on cream | plum's paper pair — the ladder's deep stops fail on glass but excel on paper (measured) |
| `--glass-fill` | `rgba(255,255,255,0.06)` | — | buttons, bubbles, chips only |
| `--glass-border` | `rgba(255,255,255,0.10)` | — | 1px |
| `--scrim` | `rgba(0,0,0,0.55)` | — | sheets |

Retired plum ladder, for the record: `#7E22CE` 2.49 ✗ · `#9333EA` 3.23 ✗ ·
`#A855F7` 4.40 ✗ (0.1 short) · `#B872F2` ✓ · `#C084FC` ✓ (spare headroom).
"Deep Plum" is honored by the *paper* stop `#7E22CE` and by plum-on-dark
usage as fills/borders — accent **text** on glass uses the measured `#B872F2`.

### Paper tints (the torn under-layer) — warm dark ink `#2B2926`

| Tint | Hex | Ink CR | Section identity |
|---|---|---|---|
| cream (base) | `#F3EDDF` | 12.43 | reviews, questions, any default sheet |
| mint | `#E3EEE3` | 12.16 | tasks · doing |
| sky | `#E2EDF4` | 12.19 | tasks · todo |
| blush | `#F6E7E3` | 12.06 | tasks · done |
| butter | `#F5EFD8` | 12.58 | tasks · planned |

**Tint is taxonomy, never valence** (ratified): tints encode *category*
(workflow state, section identity) — never performance judgment. An
over-target day never earns a different tint; day quality differentiates by
ink weight and `~` marks only. Section tint is fixed for the section's
life; if wellness ever needs a sheet, it takes cream, always.

### State colors — two calibrated pairs (same hue meaning, ink per surface)

| State | on glass (≥4.5) | on paper (≥3.0 non-text) |
|---|---|---|
| alive | `#3FB950` (6.85) | `#27963C` (3.26) |
| dead | `#F85149` (5.19) | `#D64545` (3.75) |
| paused | `#D29922` (6.89) | `#A16207` (4.22) |
| dormant | muted gray — never a state hue | muted gray — never a state hue |

Behavioral dormancy renders muted on every surface (dormancy law); red is
reserved for system failure a human must fix.

## 2. Surfaces — three layers, one stack

**L0 — the matte skin.** `#0B0B0C` + static grain (SVG noise, ≤2%).
Everything not listed below lives here. **Per the user's placement ruling,
torn paper sits *under* this skin**: sheets are revealed where the black
tears away, so the ragged fringe is the black layer's own edge — dark
fringe framing light paper, never paper edges floating on black.

**L1 — glass, for touching only.** Buttons, nav bubbles, chips, sheet
handles: `--glass-fill` + 1px border + `blur(14px) saturate(140%)`,
radius 16. The blur budget gets *easier*: glass exists only on interactive
elements, so most screens run zero live blur. One blurred layer per screen
remains the ceiling; behind long lists, static fill.

**L2 — torn paper, for reading.** One shared primitive (`TornSheet`):
ragged `clip-path`/mask set, tint prop, and two calibrated variables —
`--fringe-w` with **text padding ≥ fringe width** (fringe exclusion zone)
and grain **lighter than the skin's, static**. Rotation ≤1°, static.
Shadow flat; torn paper never glows. Calibration surfaces: the **weekly
review** (longest text — if 500+ words read comfortably there, every sheet
is fine) and **nutrition detail** (densest table-on-paper).

Obsidian exports keep the dialect; callouts may style as torn slips in
`theme.css` — same four-state mapping (success / failure(system-only) /
warning / neutral-note for dormancy).

## 3. Navigation — the bubble cluster

Floating glass bubbles, bottom-right, icons only (5 primary: Plaza ·
Inbox · ＋capture · Week · More); press-and-hold or tap-the-⋯ expands the
full route sheet (two-tap law preserved). Active route = teal ring.
Position: bottom-right default, **position setting** (bottom-center option)
ships with it — one CSS variable. Never on the **wake route** (hard-mode
law: bare, full-bleed teal, zero chrome — unchanged). Desktop wide layout
offers the same bubbles docked left as a *setting*, never fixed chrome over
content.

## 4. Hue law (wording unchanged, re-inked)

Hues encode **provenance, action, and state — never data, never valence.**
Teal = your action; plum = agent speech — `agent-write` renders
`--accent-2` on glass, `--accent-2-ink` on paper; `app-write`/`source-read`
render teal. Green/red/amber/muted = system state only. Data differentiates
by weight and mono styling. Tint encodes category only. The lexical gate
(draft gate #4) bans "streak"/"scoreboard" from narrated prose; this law
bans their visual equivalent.

## 5. Widget law (new, ratified)

Widgets float on arbitrary wallpapers where no ink-pair is calibrated — so
**the widget renders its own glass chip behind every state-critical dot**
(self-glass law; mockup 18 already does this — now it's required) and
`/widgets.json` ships both ink-pairs alongside the palette tokens.
Liveness stays truthful on any wallpaper.

## 6. What did not change

Type (Plex Sans/Serif/Mono, 13/15/17/22/28, 60–70ch measure, lh ≥1.6),
motion rules (150–200ms, no entrance animation on wake,
`prefers-reduced-motion`), 4px grid + radius scale, component roles
(strip cards, coverage lines, habit chips, fold drawer, waiting-on badge),
Obsidian dialect, hard-mode wake spec, offline SW queue, and every
behavioral law: no streaks · dormancy muted · coverage honesty · `~`
estimates · freshness≠success · single-writer states · two-pass
verification · hue-never-carries-data.

## 7. Gates for `theme.css` (P0)

1. Contrast lint: every text/ink pair re-verified ≥4.5 (dark text tier) /
   ≥3.0 non-text (paper dots); lint fails the build on drift.
2. All ink-pairs present as token pairs: state × {glass, paper}, plum ×
   {glass, paper}.
3. `TornSheet` primitive exposes `--fringe-w`, grain opacity, tint props;
   fringe-exclusion asserted in the review-mock render.
4. Grain assets static (no animation frames); blur-budget grep: ≤1
   `backdrop-filter` per screen bundle.
5. Palette picker ships v2 default; v1 Aurora remains a picker entry
   (tokens preserved in [[archive-v1-aurora]]).

## See also

[[02-architecture]] (laws & schema that consume these tokens) ·
[[03-feature-list]] · [[04-screens-pwa]] ·
[[05-screens-desktop-widgets]] · [[06-index]] (per-screen color table,
MOC) · [[07-life-layer]] · [[08-agent-console]] ·
[[09-weekly-review-format]] · [[archive-v1-aurora]] (v1, verbatim history)
