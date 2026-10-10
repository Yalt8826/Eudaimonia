---
project: Eudaimonia
doc: Design System v2 — "Matte & Torn"
owner: praxis
status: measured + ratified (2026-10-09); amended 2026-10-10 — section
  tints resampled from the ratified mockup (§1), self-glass law generalised
  from widgets to tinted sheets (§5), L0 texture ceiling raised to 8% (§2),
  TornSheet cuts its tear with a raster mask rather than a clip path (§2 L2);
  supersedes v1 Aurora
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
| cream (base) | `#F3EDDF` | 12.43 | **reading surfaces only** — reviews, goals, answered questions |
| mint | `#A0D2BC` | 8.59 | Plaza · today's plan |
| sky | `#94BDE9` | 7.40 | Plaza · waiting on |
| blush | `#F1AC9F` | 7.70 | Plaza · habits |
| butter | `#F0CB89` | 9.40 | Plaza · yesterday |
| violet | `#A79BE5` | 5.85 | Plaza · agents (sixth tint, plum hue family) |

**Two tiers, amended 2026-10-10** (section tints resampled from the ratified
mockup; values recomputed, not transcribed). The surfaces do different work,
so they get different grounds:

- **Section tints — saturated.** Glanced at, a few lines each. They carry
  the Plaza's section identity, and each section owns its tint for life.
- **Reading tint — cream, pale.** The weekly review and the goals horizon
  carry 500+ words, where a saturated ground fatigues. Cream keeps its
  original value and never joins the section rotation.

The tints formerly mapped to task workflow states (doing/todo/done/planned).
That mapping had no surface yet; section identity does, and the tint law
already names both as legitimate categories. When a task board needs tints,
it takes its own set rather than borrowing the Plaza's.

**Amendment 2026-10-10 (mockup-ratified):** a sixth tint, violet, joins the
table as the AGENTS section's fixed paper — plum's hue family on paper, the
visual counterpart of "agents act". Its ink CR (6.85) is the paused-glass
tier: comfortably ≥ 4.5, knowingly below the warm-paper 12s; body copy there
runs at reading size and weight, never long-form. The Plaza's section→tint
map is fixed for each section's life: plan=mint · waiting-on=sky ·
habits=blush · yesterday=butter · agents=violet; everything else defaults
cream. **Agent-state dot ruling (same amendment):** "needs input" renders
paused-amber — red stays system-failure-only; transient agent activity
("processing…") renders the plum ✦ activity mark, never a state dot. State
dots remain reserved for real liveness (alive/dead/paused).

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

**L0 — the matte skin.** `#0B0B0C` + static texture. Everything not listed
below lives here. **Amended 2026-10-10:** the ceiling was ≤2% when the skin
was a flat field with noise over it; the ratified mockup reads as crumpled
black stock, which needs a coarse fold scale (lit for relief) as well as
fine tooth. Ceiling is **≤8% per layer**, and the asset carries exactly
two scales. Still static, always — gate 4 is a plain string match, so even
naming an animation construct in a comment trips it.

**Both layers are zero-mean, which is what keeps the skin black.**
`feDiffuseLighting` returns `sin(elevation)` on flat ground — 0.848, not
0.5 — so a transfer centred on 0.5 lifts the whole field: the skin rendered
at **#1C** against a `#0B0B0C` base, visibly washed beside the reference.
Each layer now maps its own flat value to black, so flat ground contributes
nothing over a near-black base and only ridges tilted into the light carry
any. Measured after the fix: mean **#11**, against the reference's **#10**.

**Matched to the reference by measurement, not by eye.** Sampling an open
black patch of the ratified render, in CSS pixels, gives **mean 12.5** and
**std 4.6 / 3.5 / 2.8 / 2.6** across successive 2× downsamples — a *fine
dense crinkle*, close-grained and nearly black, not big soft folds. Earlier
passes built 80px folds at std 14 and read as lighting on a grey field; the
character was wrong before the amplitude was. The asset now carries a
dominant crinkle at the reference's own scale, a whisper of broad shading
beneath it (without which the texture dies under downsampling faster than
the reference does), and fine tooth over both: **mean 13.7, std 4.4 / 3.6 /
2.7 / 2.2**. Opacities ≤8% per layer.

**Both layers are zero-mean, which is what keeps the skin black.**
`feDiffuseLighting` returns `sin(elevation)` on flat ground — 0.848, not
0.5 — so a transfer centred on 0.5 lifts the whole field: the skin rendered
at **#1C** against a `#0B0B0C` base, visibly washed. Each layer now maps its
own flat value to black.

**The only text on bare skin is the Plaza header**, and it rides a dark
scrim (`theme.css` body) rather than capping the texture. The reference has
the same darker top.

**Depth at the tear is measured too.** Sampling straight down from a torn
edge into the paper below the reference gives a shadow of **42% at the
edge, decaying to nothing by ~28px** (+0px 57.5% of far paper · +4px 76.9%
· +10px 91.4% · +20px 97.7%) — a tight contact shadow, not a broad wash. It
runs **inward**: the skin is the top layer and the paper is revealed
beneath it, so a sheet casting *outward* onto the skin would render the
stack upside down. The sheet keeps only a slight seat.

**The skin is THICK stock, and a tear through thick stock shows its
cross-section.** Walking up from the paper into the black in the reference,
luminance runs **72 at 2px, 41 at 4px, 17 at 6px**, then the body's ~16:
a bright narrow cut face catching light, falling into the dark body within
about six pixels. That band is the whole reason the reference reads as
thick paper rather than as a shape cut out of a flat field — a single flat
rim is too dark and too even to carry it.

So the rim is **three graded bands** (`--skin-lip-1..3`, lightest against
the paper), each cut by the *same* tear so the cross-section follows every
serration. Warm-neutral, never white: torn black card shows dark fibre.

Two mechanics this depends on, both learned by rendering it wrong first:

- **Every band must tile the tear at the same horizontal phase.** Each
  band's box is a few px wider than the paper's, and `mask-position` is
  measured from that box's own origin — so without adding the inset back,
  the bands tile at different phases, their serrations stop lining up, and
  four misaligned copies read as a grey haze instead of a cut face.
- **The mask's own fray must stay tight** (~1px). Four bands stack on one
  mask, so any softness in it is paid for four times over.

The tear itself needs both ends of the spectrum: big scalloped waves
swinging it 20–30px *and* sharp teeth a few px across riding on them, with
fibres standing proud in places and notches bitten in elsewhere at heavily
varied sizes. Weighting only the low octaves gives a smooth ribbon; only
the high ones gives a straight band with a frayed hairline; wisps that only
ever push outward give an even scallop.

*(A pale fibre core along the tear was tried and cut: real torn stock shows
it, but at this scale on these tints it read as an outline rather than as
fibre.)*

### 2a. Sheets are paper, controls are glass (amended 2026-10-10)

The one-line philosophy read *glass for touching, paper for reading*, and
04 specced the Plaza as glass cards. The ratified mockup makes every Plaza
section a torn sheet, so the line is refined rather than reversed:

> **Sheets are paper. Controls are glass.**

Both halves keep their meaning, and the mockup already obeys it — the wake
chip, the capture FAB, the settings bubble and the nav cluster are all
still glass sitting *on* paper. What moved is the surface a *section* is
made of, not the surface a *tap target* is made of.

Two things fall out, both good:

- **The blur budget gets easier, not harder.** Paper carries no blur, so a
  Plaza of five sheets runs zero live blur; the ≤1 ceiling (law 9) now has
  headroom on the busiest screen in the app.
- **Reading surfaces stay distinct** by tint, not by tier: the review and
  the goals horizon are the pale cream ground, the Plaza's sections the
  saturated ones (§1).

The torn edge is a raster alpha mask, not a `clip-path` polygon. Paper
separates along its fibres — a soft multi-scale boundary with strands
pulled proud of the tear — and a polygon reads as a sawtooth at any vertex
count. The masks are generated and committed by
`scripts/gen_torn_edges.py` (seamless by construction: every octave is an
integer-frequency sinusoid over the strip width), tiled horizontally so a
sheet's height never stretches its edge. The fringe is the same tear,
inset a few pixels behind the paper in `--bg`, so the dark rim *follows*
the tear instead of outlining it — the placement ruling, now literal.

## 3. Navigation — the bubble cluster

Floating glass bubbles, bottom-right, arranged as an **organic overlapping
cluster** (mockup-ratified 2026-10-10): four dark-glass bubbles rising from
the big teal **＋ capture FAB** that anchors the cluster's corner — the FAB
is part of the cluster, not a separate floating button. Icons only; tap
More (⋯) expands the full route sheet (two-tap law preserved). Active route
= teal ring. Position: bottom-right default, **position setting** (bottom-
center option) ships with it — one CSS variable. Never on the **wake route**
(hard-mode law: bare, full-bleed teal, zero chrome — unchanged). Desktop
wide layout offers the same bubbles docked left as a *setting*, never fixed
chrome over content. The cluster carries the screen's one live blur layer
on its expanded sheet; the bubbles themselves are static glass fills.

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

**Generalised to tinted sheets, 2026-10-10.** A saturated section tint is
the same problem as an unknown wallpaper: the paper state pair was
calibrated on cream and falls under the 3.0 non-text floor on the section
grounds — alive measures **2.26** on mint and **1.53** on violet (vs 3.26 on
cream). Liveness would be the least readable thing on a screen whose whole
thesis is that degradation must be visible.

So **every state dot on a tinted sheet sits in its own well**: a small tear
back down to the matte skin, which is a calibrated surface, letting the dot
carry the **glass** pair — alive 6.85 · dead 5.19 · paused 6.89 · dormant
6.15. No floor was softened and no tint was paled; the law that already
existed for widgets simply reaches one surface further. Enforced by
`contrast.test.ts`, which asserts both halves: that the paper pair genuinely
fails on these grounds, and that the well clears the floor.

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
