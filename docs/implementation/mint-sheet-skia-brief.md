# Brief: rebuild the mint sheet in Expo + Skia

**For the implementing agent.** This is migration phase **M0** of
`docs/plan/v1/10-stack-migration.md` — a go/no-go spike. Build one sheet,
prove it matches, stop. Do not port the rest of the app in this task.

Everything you need is in `preserved/torn-paper-web/`. Read its
`README.md` first; it explains why the surface looks the way it does.

---

## 1. The goal, in one sentence

Render a single mint sheet of torn paper — black torn skin above and
below, coloured paper exposed between, fibrous relief along both cuts —
in `@shopify/react-native-skia`, indistinguishable at a glance from
`preserved/torn-paper-web/renders/mint-390px.png`.

## 2. Inputs — use these files, do not regenerate them

| file | role |
|---|---|
| `assets/tear-a-top.svg`, `tear-a-bottom.svg` | the tear silhouette. A single `<path d="...">`. White = keep paper. |
| `assets/fringe-a-top.png`, `fringe-a-bottom.png` | fibre and relief along the cut. RGBA, **1600×224 px = 800×112 CSS px**, alpha 0 everywhere except the cut. |
| `assets/paper-fibers.prepared.webp` | the paper texture. **Use `.prepared`, never `paper-fibers.webp`.** |
| `assets/tear-metrics.json` | measured material reach per edge; text padding derives from it |

**Do not run or modify `generators/author_tears.py`.** The contours inside
it are hand-drawn point tables; regenerating risks losing them. The PNGs
and SVGs committed here are the approved output.

## 3. Exact values — copy these, do not re-derive

```
Geometry      tear strip      800 × 112 CSS px, tiled horizontally (repeat-x)
              contour range   y ∈ [16, 98] within the strip
              fringe raster   authored at 2× (1600×224), drawn down to 800×112
              text padding    top 100px, bottom 91px   (tear-a)
              measured reach  top 94.0px, bottom 84.5px (tear-a; the padding above
                              is this + ~6px, and must never fall below it)

Colour        page background   #0B0B0C
              mint paper        #A9DCC7
              mint ink          #142B25
              teal accent (ink) #0F766E     short rule under the heading
              skin lip bands    #202024 #1A1A1E #151518 #111114 #0D0D10
                                (5 bands at 1px steps, outermost first)
              skin cast         rgba(0,0,0,0.42) → 0.23 → 0.09 over 28px, INWARD
              sheet seat        0 1px 2px rgba(0,0,0,0.55)

Compositing   paper texture blended over the mint fill with SOFT-LIGHT
```

## 4. Layer order, bottom to top

1. **Page background** — `#0B0B0C` plus its own static grain. Continuous;
   the sheet never paints over it.
2. **Skin bands** — five copies of the tear mask, each inset 1px further,
   painted in the five lip colours outermost-first. This is the torn
   cross-section that makes the stock read as thick rather than as a
   shape cut from a flat field.
3. **Paper** — `#A9DCC7` with `paper-fibers.prepared.webp` tiled over it
   in **soft-light**, the whole thing masked by the tear so paper exists
   only between the two contours.
4. **Cast shadow** — the skin's edge falling *inward* onto the paper,
   28px, three stops. Inward because the skin is the layer on top; a
   sheet casting outward renders the stack upside down.
5. **Fringe** — the two PNGs, drawn at 800×112 CSS px, tiled repeat-x,
   top-aligned and bottom-aligned. **No background colour on this layer**
   — it carries its own alpha and must not cover the skin beneath it.
6. **Content** — heading, accent rule, body text, inside the padding.

## 5. Skia approach

These are the right concepts; **verify exact signatures against the
current `@shopify/react-native-skia` docs** rather than trusting the
spelling here.

- **Tiling** — `ImageShader` with `tx="repeat"`. Everything horizontal
  tiles; nothing stretches. A single mask stretched over a tall sheet
  elongates the contour and the tear stops looking like a tear.
- **The mask** — either `Skia.Path.MakeFromSVGString()` on the path data
  from the SVG, or load the SVG as an image and use it as an alpha mask
  in `<Mask>`. The path route is sharper and scales free; prefer it.
- **soft-light** — a `Group` with `blendMode="softLight"` over the mint
  fill. See trap 2 before choosing any other mode.
- **The fringe** — a plain `<Image>` on top, alpha preserved, no blend
  mode, no tint.
- **Blur** — only for floating glass controls, never for paper. Paper is
  matte and static.

## 6. The traps — each of these was a shipped bug

1. **Never place light relative to the contour.** Light that follows the
   edge *is* an outline, however finely broken up. All relief light
   belongs to discrete fragments inside the fringe PNG — which is already
   baked, so simply do not add any edge glow, stroke, drop-shadow or rim
   of your own along the tear. If the result shows a continuous light line
   along the contour, something is drawing one. Find it and delete it.

2. **`multiply` destroys the palette.** Blending the mid-grey texture with
   `multiply` once rendered mint as `#526B61` and dropped ink contrast
   from 9.81 to 2.58, while every token still measured correct in
   isolation. Only `soft-light`, `overlay` or `normal` are safe against a
   texture centred on mid-grey.

3. **Use the prepared texture.** `paper-fibers.webp` has a mean of 156;
   soft-light is neutral only at 128. Blending the raw file lightens every
   sheet and invalidates the measured contrast.

4. **Do not stretch the tear.** Tile the 800×112 strip. Top and bottom
   keep their natural proportions; only the middle of the sheet flexes.

5. **Text must clear the MATERIAL, not the contour.** The fringe hangs up
   to 14px past the contour. Honour the padding in §3.

6. **Do not scale counts with resolution.** (Only relevant if you touch
   the generator, which you should not.) Doubling a raster's resolution
   doubles its pixels, not the number of things in it.

## 7. Acceptance — measure, do not eyeball

Screenshot the Skia render at 390px wide, 3× DPR, and check numerically.
Eyeballing is how every one of §6 shipped.

| check | pass condition |
|---|---|
| tint | median paper pixel is `#A9DCC7` ± 1 per channel |
| ink contrast | heading/body vs paper ≥ 4.5:1 (WCAG, sRGB-linearised) |
| texture present | luminance std-dev ≥ 3.0 over a window that is **100% paper** (flat paint = 0.00) |
| **no rim** | sampling 1–2 CSS px above the contour: fewer than **10%** of columns exceed luminance 35. The web version measures ~3–5%. Above ~50% you have rebuilt the halo. |
| relief present | within 8 CSS px below the contour, 8–15% of columns exceed luminance 60, in **≥ 10 separate patches** — broken, not continuous |
| text clearance | no glyph pixel within 6 CSS px of any fringe pixel |
| tiling | the contour at x=0 and x=800 match; no visible seam |

A metric that reads the same before and after a change is a broken
metric, not a passing one — see the preserved README for two that fooled
us. Sanity-check any new measurement against a deliberately wrong render.

**Two thresholds in this table were wrong when first written (corrected
2026-10-12 after M0), and the way they were wrong is instructive:**

- *texture* said ≥5 over "the sheet interior". That number came from a
  sample that was not purely paper — a few fringe pixels in the window
  inflate std-dev enormously. Measured over a genuinely 100%-paper
  window the approved web surface reads **3.58**, so the old threshold
  was above what the reference itself achieves. **Select the window for
  purity before you measure, or you are measuring the tear.**
- *relief patches* said 12–18. That band was counted on the 800px ASSET;
  a render counts differently (resolution, and only part of the tile is
  on screen). The web reference reads ~30 plain / ~23 gap-merged. The
  row's substance is that relief is BROKEN, not continuous, so the
  threshold is now a floor rather than a band.

Both were caught because the implementer measured the reference
alongside their own render and reported the mismatch instead of
loosening the number. **Do that.** If your render and the approved
reference fail a row identically, the threshold is the suspect.

## 8. Deliverable

- the Skia mint sheet as one component, assets referenced not inlined
- a screenshot at 390px/3× beside `renders/mint-390px.png`
- the §7 table filled in with actual measured numbers
- a plain statement of anything that could not be matched and why

If the rim check or the tint check fails and cannot be fixed, **say so and
stop**. M0 is a go/no-go gate: a failed spike is a useful result and is
much cheaper than discovering it after 22 routes are ported.
