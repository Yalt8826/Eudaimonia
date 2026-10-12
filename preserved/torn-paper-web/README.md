# Torn-paper surface — the web implementation, preserved

A complete, working copy of the torn-paper design as it shipped on the
React/CSS web client, taken at commit `c0740e8` (2026-10-12) before the
Expo migration.

**These are COPIES, not moves.** The web client still references the
originals and still runs. That is deliberate: during the port the web app
is the reference render, and "does the Skia version match?" is a question
you can only answer by looking at both. Delete this directory when Expo
reaches parity and is approved — not before.

## What is here

| path | what it is |
|---|---|
| `assets/tear-{a,b,c}-{top,bottom}.svg` | the authored tear silhouettes — **hand-drawn point tables**, not procedural |
| `assets/fringe-{a,b,c}-{top,bottom}.png` | the fibre and relief along each cut, 2× scale, RGBA |
| `assets/paper-fibers.webp` | the supplied paper artwork (source, untouched) |
| `assets/paper-fibers.prepared.webp` | the same, re-centred on mid-grey — **use this one** |
| `assets/tear-metrics.json` | how deep each edge's material reaches; text padding derives from it |
| `generators/author_tears.py` | emits every SVG, every fringe PNG, and the metrics. **The single source of truth.** |
| `generators/prepare_paper_texture.py` | re-centres the supplied texture on #808080 |
| `component/` | the React components, CSS, and their tests |
| `tokens/theme.css` | the full palette, with every measured contrast ratio in comments |
| `tokens/contrast.test.ts` | the contrast suite — pure maths, ports to any stack unchanged |
| `renders/` | reference screenshots at 320/390/430px plus 4× edge crops |

## What actually matters if you rebuild this

The files are replaceable. This list is not — every line of it was paid
for with a wrong render.

1. **The contours are hand-authored and must never be regenerated.**
   `TEAR_A_TOP` and friends in `author_tears.py` are point tables placed
   one lobe at a time. Earlier versions summed sinusoids; summing octaves
   gives a *wave* however many you stack — periodic spacing, every crest
   like its neighbours — and it reads as decorative, not torn. If you port
   the generator, port the tables verbatim.

2. **The mask and the fringe are a PAIR.** Both are generated from one
   contour array in one run. A fringe drawn independently drifts along the
   edge and reads as a stamped-on strip. tear-b once shipped overriding the
   mask without the fringe; it wore tear-a's material on its own
   silhouette.

3. **Light must never be placed relative to the contour.** This is the
   single most important rule here. Light placed relative to the edge
   *follows* the edge, which is an outline however finely you break it up.
   All light belongs to discrete fragments: ~11% of columns, in ~14
   patches, median gap 21 CSS px. Chips stay dark — a highlight on a 3px
   chip is a bright dot, and a row of bright dots is the outline again.

4. **Anything that traces the contour becomes a rim.** The skin's lip
   bands are the mask offset by 1–5px, so whatever luminance they carry
   draws a line along the whole tear. At #6E6E74 that was a 3px rim on
   **100%** of columns. They are held under luminance 40 by a test.

5. **soft-light is neutral only at mid-grey.** The supplied texture means
   156, so blended raw it lightens every sheet and shifts the palette the
   ink contrast was measured from. `multiply` is worse: it once rendered
   mint as #526B61 and dropped ink contrast from 9.81 to 2.58 while every
   token still measured fine.

6. **Text clears the MATERIAL, not the contour.** Fringe clumps hang up to
   14px past the contour. `tear-metrics.json` carries the measured reach
   per edge; padding is that plus ~6px.

7. **Author rasters at 2×.** At 1:1 a 3× phone upscales the fringe and the
   fine fibre — the smallest and most load-bearing detail — smears into
   exactly the look the whole exercise was fighting.

## How this was built, which matters more than what was built

Every visual claim here was **measured, not eyeballed**, and that
discipline is why it converged. Sample the render numerically, change one
thing, re-render, re-measure. It caught defects that looking could not:
the mint tint collapsing under `multiply`, a 2px grey rim present on 98%
of columns, fringe density silently doubling when a raster was scaled.

It also caught three *bad measurements*. Twice a metric anchored on "the
first mint pixel" read ~98% on every build, because a tear this ragged has
partial-coverage pixels several px deep and the window sat on the
contour's own antialiasing. **If a metric reads the same before and after
a change, suspect the metric before you suspect the change.**

And twice a token edit silently did not apply while the comment above it
claimed otherwise — once `--skin-lip-*` (duplicated in the same rule, the
later winning), once `--nav-cluster-inset`. Both cost real time. Hence the
standing rule in this codebase: **a value a comment asserts gets a test.**

## Porting notes for Skia

`author_tears.py` does not need to change. It emits SVG paths and RGBA
PNGs; Skia consumes both. What changes is only the compositing layer:

| CSS here | Skia equivalent to reach for |
|---|---|
| `mask-image` + `mask-repeat: repeat-x` | `<Mask>` with a repeating `ImageShader` (`tx="repeat"`) |
| `background-blend-mode: soft-light` | a `Group` with `blendMode="softLight"` |
| `backdrop-filter: blur()` | `BackdropFilter` / `<Blur>` inside a `<BackdropBlur>` |
| tiled fibre texture | `ImageShader` with `tx`/`ty` repeat |
| the fringe PNG overlay | a plain `<Image>` above both layers, alpha intact |

Verify the exact API shapes against the current `@shopify/react-native-skia`
docs — the names above are the right concepts, not a guaranteed signature.

Skia runs on web through CanvasKit, so one renderer can serve phone and
the desktop console — which is a better position than this CSS version
ever had.
