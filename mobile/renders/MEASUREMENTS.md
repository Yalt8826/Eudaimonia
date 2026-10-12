# M0 measurement — Skia mint sheet, 2026-10-12

Render: Android emulator (API 36), 1170×2532 @ 480dpi = 390 CSS px at 3× DPR,
Expo Go (SDK 57), `@shopify/react-native-skia` 2.6.2. Screenshot:
`skia-mint-390px@3x.png` (native) / `skia-mint-390px.png` (1× downscale).
Measured by `scripts/measure_sheet.py`; raw JSON in `measured-metrics.json`.

Every metric was CALIBRATED on the live web client first — served locally,
screenshot at the same 390px/3× DPR through the same Chromium family the web
target — because a metric that misreads the good reference is a broken metric,
not a passing one (preserved README, "three bad measurements"). The web
reference's own numbers are in the third column below.

## Acceptance table (brief §7)

| check | pass condition | M0 Skia render | web reference @3× | verdict |
|---|---|---|---|---|
| tint | median paper = #A9DCC7 ± 1/channel | (168.67, 219.67, 198.56) — Δ −0.33/−0.33/−0.44 | Δ −0.44/channel | **PASS** |
| ink contrast | ≥ 4.5:1 (WCAG, sRGB-linearised) | **9.0:1** (ink 25.3,49.3,42.8 on paper 168.7,219.7,198.6) | 9.69:1 | **PASS** |
| texture present | luminance std-dev ≥ 5 over sheet interior | **4.55** physical px (3.09 CSS-pooled) | **4.71** (3.21 pooled) | **FAIL — but the web reference fails the same row** (see below) |
| no rim | <10% of columns >35 at 1–2 CSS px outside the contour | top **5.6%**, bottom **5.9%** (strict max variant 15.1/16.2) | top 2.1% (strict 11.3) | **PASS** |
| relief present | 8–15% of columns >60 within 8px, in ~12–18 patches, broken | **14.1%** top / **14.1%** bottom; patches 31/34 plain, 19/21 gap-merged | 8.2%, 30 plain, 23 merged | pct **PASS**; patch band **FAIL — the reference misses it too** (see below) |
| text clearance | no glyph pixel within 6 CSS px of any fringe pixel | **25px** | 24px | **PASS** |
| tiling | contour at x=0 = x=800; no seam | endpoints equal (Δ 0.0, both contours); 390px viewport shows one 800px tile (no seam on screen — same as the web at 390px); contour locator recovers the sheet offset 139.5px vs the true 140.0 → rendered contour at 1:1 scale, no stretch | endpoints Δ 0.0 | **PASS** |

**5 of 7 rows pass outright.** The two that do not are reported, not loosened:

- **texture ≥5**: the approved web surface itself measures **4.71** under the
  brief's own 3× protocol — the threshold sits just above what the reference
  achieves. The metric is not broken: the deliberate flat-paint render
  (`sanity-flat.png`) measures **0.00** and the tint on that render reads the
  token exactly, so the check separates "flat" from "textured" perfectly. My
  render (4.55) is within 0.16 of the reference (4.71).
- **relief patches 12–18**: with plain run-counting at 3× the web reference
  reads **30** patches (23 with ≤2px gaps merged) — outside the brief's band
  under both counting conventions tried. My render reads **31/34** (19/21
  merged) — a match with the reference, not with the band. The row's substance
  (relief is BROKEN, not continuous) is demonstrated on both: a rebuilt halo
  reads ~80–95% of columns in 1–3 merged patches (`sanity-rim-stroke.png`).

## Metric-sanity evidence (deliberately wrong renders)

Per the brief: any new measurement must be shown to fail on a wrong render.

| render | what it breaks | measured result |
|---|---|---|
| `sanity-multiply.png` | soft-light → multiply | no mint region detectable at all; paper measures (87,113,102) ≈ the documented #526B61 bug, reproduced on Skia |
| `sanity-flat.png` | fibre texture removed | texture std-dev **0.00** (vs 4.55), tint Δ 0.0 — check works |
| `sanity-rim-stroke.png` | 1.5px #6E6E74 stroke traced on the contour (the forbidden rim) | rim **79.7%** top / 72.1% bottom; relief 93.8%/94.9% in 1–3 merged patches — the halo signature |
| `sanity-nofringe.png` | fringe layers removed | rim 24.9%/23.3%, relief 42.6%/44.4% — the exposed paper edge floods both windows |

## Protocol notes (what was calibrated, and why)

- The rim/relief windows anchor on the KNOWN contour from the SVG point
  tables (parsed by the script), never on "the first mint pixel" — the
  antialiasing trap that fooled the web team twice.
- Rim convention: the column's MEAN luminance over the two rows 1–2px outside
  the contour. Per-column max reads 11–14% on the good web render (mask AA
  bleeds a third of a pixel up at fractional contour positions); the band-mean
  reproduces the documented "~3–5%" (2.1% here). Both variants are reported.
- Relief convention: mean-pooled luminance >60, window stopping 0.5px short of
  the contour (the contour's own AA row otherwise qualifies every column).
- Web reference for calibration is the LIVE client (v3 `TornSheet.tsx`,
  3 lip bands at 2px steps, post-`a40066f`), NOT the preserved v2
  `TornPaperSection.tsx` (5 bands at 1px) that the brief's §3 values
  document. The preserved copy and the live app diverged on 2026-10-10
  (commit `a40066f` reverted the Plaza to the older component). **M0 builds
  the brief's v2 spec**; rim/relief comparisons above are therefore against a
  slightly different (smoother-ramped) skin. The v2 spec as-built measures
  5.6% rim — inside the brief's <10% with margin.

## Known differences from the reference render

1. The reference `mint-390px.png` is the whole Plaza (header, three sheets,
   nav cluster); M0 is ONE sheet by scope — no header, no nav, no other
   sheets. The comparison target is the sheet surface itself.
2. M0's sheet sits at y=140 with height 480 (single-sheet layout), not the
   Plaza's stacked position.
3. "OPEN >" is Plaza content, not brief §4 layer 6 — not rendered.
4. IBM Plex Mono/Sans are bundled via @expo-google-fonts; metrics/wraps match
   the web at 390px.
5. The Expo Go dev-menu gear is visible top-right in the screenshot — Expo
   Go chrome, not app surface; it sits outside every measurement window.
