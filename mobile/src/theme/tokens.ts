/**
 * Eudaimonia theme tokens — Matte & Torn v2 (docs/plan/v1/01-design-system.md §1).
 *
 * Ported from client/src/theme.css at M1: same names, same comments, same
 * measured ratios. Where the web value is a CSS construct with no RN
 * equivalent (rem lengths, the inset shorthand, a linear-gradient stack),
 * the CSS line is kept in the comment and the RN-usable number sits beside
 * it at 1rem = 16 CSS px = 1 dp.
 *
 * This is the ONLY file allowed to contain accent/state hex literals
 * (EXECUTION.md §4 grep job 2). Components reference tokens only, so a
 * palette flip stays a token edit, never a redesign (01 v2 §7).
 */

/** Every colour token name, as it reads in theme.css. */
export type ColorToken =
  | "--bg"
  | "--text"
  | "--muted"
  | "--accent-1"
  | "--accent-2"
  | "--accent-2-ink"
  | "--accent-1-ink"
  | "--glass-fill"
  | "--glass-border"
  | "--scrim"
  | "--paper-cream"
  | "--paper-mint"
  | "--paper-sky"
  | "--paper-blush"
  | "--paper-butter"
  | "--paper-violet"
  | "--paper-ink"
  | "--sheet-mint"
  | "--sheet-mint-ink"
  | "--sheet-sky"
  | "--sheet-sky-ink"
  | "--sheet-blush"
  | "--sheet-blush-ink"
  | "--sheet-butter"
  | "--sheet-butter-ink"
  | "--sheet-lavender"
  | "--sheet-lavender-ink"
  | "--alive-glass"
  | "--alive-paper"
  | "--dead-glass"
  | "--dead-paper"
  | "--paused-glass"
  | "--paused-paper"
  | "--bubble-veil"
  | "--skin-lip-1"
  | "--skin-lip-2"
  | "--skin-lip-3"
  | "--skin-lip-4"
  | "--skin-lip-5"
  | "--skin-cast-max"
  | "--skin-cast-mid"
  | "--skin-cast-far";

/** The default Matte & Torn dark palette — theme.css `:root`, verbatim. */
export const colors: Readonly<Record<ColorToken, string>> = {
  /* base + ink (01 §1) */
  "--bg": "#0B0B0C",
  "--text": "#EDEDEA",
  "--muted": "#9A9A94",
  /* accents — you act / agents act (hue law, 01 §4) */
  "--accent-1": "#2DD4BF",
  "--accent-2": "#B872F2",
  "--accent-2-ink": "#7E22CE", /* plum's paper pair (5.98 on cream, 3.55 on lavender) */
  "--accent-1-ink": "#0F766E", /* teal's paper pair (3.58 on mint) */
  /* The raw accents are for glass and the black skin ONLY. On their own
     section paper they vanish: --accent-1 measures 1.22 on mint and
     --accent-2 measures 1.59 on lavender, against a 3.0 non-text floor.
     An accent painted onto a sheet uses the -ink pair, and the pairing is
     asserted in contrast.test.ts rather than left to whoever edits next. */
  /* glass — touching only (01 §2 L1) */
  "--glass-fill": "rgba(255,255,255,0.06)",
  "--glass-border": "rgba(255,255,255,0.10)", /* 1px */
  "--scrim": "rgba(0,0,0,0.55)",
  /* torn-paper under-layer (01 §1) — tint is taxonomy, never valence.
     Section identity on the Plaza (amendment 2026-10-10, mockup-ratified):
     plan=mint · waiting-on=sky · habits=blush · yesterday=butter ·
     agents=violet — each section owns its tint for life.

     Two tiers, because the surfaces do different work:
       SECTION tints (saturated) — glanced at, a few lines each. Sampled
         from the ratified mockup and measured against --paper-ink below.
       READING tint (cream, pale) — the weekly review and goals carry 500+
         words, where a saturated ground fatigues. Cream stays as measured
         in 01 §1 and never joins the section rotation.
     All six clear the >=4.5 ink floor (01 v2 §7 gate 1); computed, not
     transcribed, by src/theme/contrast.test.ts. */
  "--paper-cream": "#F3EDDF", /* 12.43 — reading surfaces only */
  "--paper-mint": "#A0D2BC", /*  8.59 — today's plan */
  "--paper-sky": "#94BDE9", /*  7.40 — waiting on */
  "--paper-blush": "#F1AC9F", /*  7.70 — habits */
  "--paper-butter": "#F0CB89", /*  9.40 — yesterday */
  "--paper-violet": "#A79BE5", /*  5.85 — agents (sixth tint, plum hue family) */
  "--paper-ink": "#2B2926",

  /* ---- Spec palette (implementation spec §2.1), adopted 2026-10-10 ----
     Five section papers, each with its OWN ink rather than sharing one
     neutral. Every pair measured before adoption; all clear the 4.5 text
     floor with room:
       plan 9.81 · waiting 8.60 · habits 7.73 · yesterday 9.98 · agents 8.02
     The sheets keep their section identity for life (tint-as-taxonomy). */
  "--sheet-mint": "#A9DCC7",
  "--sheet-mint-ink": "#142B25",
  "--sheet-sky": "#A9CBEF",
  "--sheet-sky-ink": "#192B3B",
  "--sheet-blush": "#F0A99B",
  "--sheet-blush-ink": "#38211E",
  "--sheet-butter": "#F2D28D",
  "--sheet-butter-ink": "#332713",
  "--sheet-lavender": "#C3AEF3",
  "--sheet-lavender-ink": "#281C40",

  /* The skin's torn cross-section. Thick stock shows its own thickness
     along a tear: a lit cut face against the paper falling into the dark
     body within a few px. Measured off the reference (luminance 72 at 2px,
     41 at 4px, 17 at 6px). NOT white — torn black card shows dark fibre. */

  /* state colors — two calibrated pairs, same hue per surface (01 §1) */
  "--alive-glass": "#3FB950",
  "--alive-paper": "#27963C",
  "--dead-glass": "#F85149",
  "--dead-paper": "#D64545",
  "--paused-glass": "#D29922",
  "--paused-paper": "#A16207",
  /* dormant: --muted on every surface — never a state hue (01 §1).
     Behavioral dormancy renders in the muted tier everywhere; red is
     reserved for system failure a human must fix, so no --dormant-*
     token exists by design. */

  /* The skin's lip bands and cast shadows, dark-tier. See geometry.lipBands
     for how the five lips are consumed. */

  /* the dot well — self-glass law (01 §5), generalised from widgets to
     tinted sheets (amendment 2026-10-10). A widget floats on arbitrary
     wallpaper where no ink-pair is calibrated, so it renders its own glass
     chip behind every state-critical dot. A saturated section tint is the
     same problem: the PAPER state pair was calibrated on cream and falls
     under the 3.0 non-text floor on these grounds (alive 2.26 on mint,
     1.53 on violet — measured 2026-10-10). The well is a small tear back
     down to the matte skin, so the dot carries the GLASS pair on its
     calibrated surface: alive 6.85 · dead 5.19 · paused 6.89 · dormant
     6.15. Liveness stays truthful on any tint, and no floor was softened.
     Composites to exactly the glass surface the contrast suite measures:
     --glass-fill over --bg. */
  "--bubble-veil": "rgba(11, 11, 12, 0.62)",

  /* The bubbles float over BOTH the black skin and the coloured sheets, so
     --glass-fill alone is not enough to sit an icon on: white-on-glass
     measures 14.88 over the skin but 1.22 over butter, because the fill is
     6% white and the paper underneath is doing all the work. This dark
     veil goes UNDER the fill so the bubble composites to roughly the same
     surface wherever it floats — the self-glass law (01 §5) applied to a
     thing that moves instead of a thing that sits still.

     0.62 is the lowest alpha that clears 4.5 on all five sheets (butter,
     the lightest, measures 5.21); it stays translucent enough that the
     blurred colour still reads through. contrast.test.ts holds it. */

  /* torn-paper primitive defaults (01 §2 L2) */

  /* The torn edge of THICK stock, which is a cross-section, not a line.
     Five bands, cut by the SAME tear so the cross-section follows every
     serration, graded from the band against the paper down into the body.
     Warm-neutral, not white: torn black card shows dark fibre.

     THESE BANDS ARE THE MASK OFFSET BY 1-5px, so they follow the contour
     exactly and whatever luminance they carry becomes a rim along the
     ENTIRE tear. That is the one thing a torn edge must not have, and it
     is worth knowing how the measurement went, because it cost three
     wrong answers:

       #6E6E74 · #45454A · #232327   a 3px rim at luminance 110 / 69 / 35
                                     on 100% of columns (measured with the
                                     fringe layer disabled, which is the
                                     only way to attribute it)
       this ramp                     32 / 26 / 21 / 17 / 13

     The step is still there, so the stock still reads thick. What carries
     the LIGHT is the fringe's relief, which is attached to discrete
     fragments and so cannot trace the tear.

     Before raising these, profile the rim (scripts/rim.py). Do NOT anchor
     a metric on "the first mint pixel": this tear is ragged enough that
     such a window sits on its own antialiasing and reads ~98% on every
     build, which is how a rim survived three passes that each claimed to
     have removed it. */
  "--skin-lip-1": "#202024", /* against the paper — the lit cut face */
  "--skin-lip-2": "#1A1A1E",
  "--skin-lip-3": "#151518",
  "--skin-lip-4": "#111114",
  "--skin-lip-5": "#0D0D10", /* falling into the body */
  "--skin-cast-max": "rgba(0, 0, 0, 0.42)",
  "--skin-cast-mid": "rgba(0, 0, 0, 0.23)",
  "--skin-cast-far": "rgba(0, 0, 0, 0.09)",
};

/** The lip bands in tear order (skin-lip-1 … skin-lip-5). */
export const lipBands: readonly ColorToken[] = [
  "--skin-lip-1",
  "--skin-lip-2",
  "--skin-lip-3",
  "--skin-lip-4",
  "--skin-lip-5",
];

/**
 * The dot well — theme.css `--dot-well`:
 *
 *   linear-gradient(var(--glass-fill), var(--glass-fill)), var(--bg)
 *
 * RN has no CSS shorthand for the stack; the well is the two layers in
 * order, and composites to exactly the glass surface the contrast suite
 * measures (glass-fill over bg). Renderers that can draw the stack take
 * both layers; flat renderers take `dotWellComposite()`.
 */
export const dotWell: Readonly<{ fill: string; base: string }> = {
  fill: colors["--glass-fill"],
  base: colors["--bg"],
};

/**
 * Geometry, in CSS px = dp (1rem = 16 CSS px). The theme.css value sits in
 * each comment so the two representations can be checked against each other.
 */
export const geometry = {
  /* --fringe-w: 1.25rem; ragged fringe width; text padding >= fringe */
  fringeW: 20,

  /* --torn-rotation: -0.4deg; static, <= 1deg */
  tornRotation: -0.4,

  /* --skin-cast-depth: 28px.
     Depth at the tear, measured off the ratified reference render rather
     than guessed. Sampling straight down from a torn edge into the paper
     below gives a shadow of 42% at the edge, decaying to nothing by ~28px:
       +0px 57.5% of far paper · +4px 76.9% · +10px 91.4% · +20px 97.7%
     That is a tight contact shadow, not the broad 55%/49px wash a first
     pass assumed.

     It runs INWARD because the skin is the top layer and the paper is
     revealed beneath it (01 §2 placement ruling). A sheet casting outward
     onto the skin would render the stack upside down. */
  skinCastDepth: 28,

  /* --sheet-seat: 0 1px 2px rgba(0, 0, 0, 0.55).
     The sheet barely sits proud at all — in the reference the paper is
     BELOW the skin, so there is almost nothing to cast outward. */
  sheetSeat: { elevation: 2, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2, shadowColor: "rgba(0, 0, 0, 0.55)" },

  /* --nav-cluster-inset: auto 0.75rem 0.75rem auto (inset shorthand:
     top right bottom left). Bottom-RIGHT, anchored by the ＋ capture FAB
     in the corner. 0.75rem hugs the screen edge while keeping the bubbles
     off it.

     This token said bottom-LEFT for a full round AFTER a commit claimed it
     had been flipped right: the edit silently did not apply and nothing
     checked, so the cluster sat in the wrong corner unnoticed.
     BubbleCluster.test.tsx now asserts `left` is auto. */
  navClusterInset: { top: null, right: 12, bottom: 12, left: null },

  /* .plaza-sheet + .plaza-sheet { margin-top: -4.5rem; }
     How far each sheet rides up into the one above it. The black between
     two sheets is one band of torn skin, not a gutter between cards, and
     at -1.15rem it measured ~104px — more black than the design wants.
     Each extra pixel of overlap removes a pixel of that band; -4.5rem
     lands it near 50px. Raising this further starts to bury one sheet's
     bottom tear under the next sheet's top tear. */
  plazaSheetOverlap: -72,
} as const;

/**
 * The Obsidian-dialect callout mapping (v1 §6 contract; 01 §2 end):
 * [!success] alive · [!failure] dead (system failure only) ·
 * [!warning] paused · neutral [!note] behavioral dormancy (muted tier).
 * The same four on torn paper use the state ink-pairs, one hue per surface.
 */
export const calloutGlass: Readonly<Record<"success" | "failure" | "warning" | "note", ColorToken>> = {
  success: "--alive-glass",
  failure: "--dead-glass",
  warning: "--paused-glass",
  note: "--muted",
};

export const calloutPaper: Readonly<Record<"success" | "failure" | "warning" | "note", ColorToken>> = {
  success: "--alive-paper",
  failure: "--dead-paper",
  warning: "--paused-paper",
  note: "--muted",
};

/* ---- v1 Aurora — picker entry (01 v2 §7 gate 5) ---------------------------
   Tokens copied VERBATIM from docs/plan/v1/archive-v1-aurora.md §1
   (provenance law: v1 survives as history, not as a redesign). Flipping is
   an attribute swap — zero component edits. State colors are
   palette-invariant and do NOT flip with the picker (v1 §1); the paper
   tints are a v2 surface and carry over unchanged. --paper-fill exists
   only in this block (it is a v1 surface; blur is off), so the aurora
   palette carries its own name set. */
export type AuroraToken =
  | "--bg"
  | "--text"
  | "--muted"
  | "--accent-1"
  | "--accent-2"
  | "--glass-fill"
  | "--glass-border"
  | "--paper-fill"
  | "--scrim";

export const aurora: Readonly<Record<AuroraToken, string>> = {
  "--bg": "#081217",
  "--text": "#E2EFF1",
  "--muted": "#8FA8AD",
  "--accent-1": "#2DD4BF",
  "--accent-2": "#A78BFA", /* violet = agents act */
  "--glass-fill": "rgba(255,255,255,0.06)",
  "--glass-border": "rgba(255,255,255,0.10)", /* 1px */
  "--paper-fill": "rgba(255,255,255,0.13)", /* blur off (v1 §2) */
  "--scrim": "rgba(4,10,12,0.55)",
};

/* Body: font-family: "IBM Plex Sans", system-ui, sans-serif.
   The typeface rides @expo-google-fonts/ibm-plex-sans; these are the
   loaded face names, consumed once fonts finish loading in _layout. */
export const fontFamily = {
  regular: "IBMPlexSans_400Regular",
  bold: "IBMPlexSans_700Bold",
} as const;

/* ---- the matte skin (01 §2 L0) ------------------------------------------
   Matte textured black: --bg + static texture, never animated (gate 4).
   The ceiling was 2% when the skin was a flat field; the ratified mockup
   (2026-10-10) reads as crumpled black stock, which needs a coarse fold
   scale as well as fine tooth. Amended ceiling: <= 8% per layer, still
   well under what interferes with body text (01 §2 L0). The texture
   dresses the black skin only — glass and paper layers opt out. */
export const skinTextureCeilingPerLayer = 0.08;

/* The header scrim — theme.css `body` background-image, first layer:
     linear-gradient(180deg, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0) 320px)
   A dark scrim over the top of the skin, then the texture beneath it.
   The scrim is what lets the texture be strong: the Plaza header is the
   only text in the app that sits on bare skin, so rather than cap the
   crumple at whatever the header can survive, the header gets its own
   darker ground and the skin is free to carry real relief everywhere
   else. The reference render has the same darker top. Both static. */
export const headerScrim = {
  color: "rgba(0, 0, 0, 0.72)",
  fadeByPx: 320,
} as const;
