# M2 measurement — the Plaza, 2026-10-13

Render: the owner's USB phone (Nothing A059, Android 16), display overridden
per width — **320 CSS px = 960×2134 @ 480dpi (DPR 3)** and **430 CSS px =
860×1914 @ 320dpi (DPR 2)** — Expo Go (SDK 57.0.9), Skia 2.6.2. The renders
in this directory (`plaza-{320,430}-phone.png`) are IN-APP snapshots: the
capture mode (`?snap` deep link) renders the whole unscaled column and
snapshots it with Skia's `makeImageFromView`, then POSTs the PNG to the dev
machine over `adb reverse` (`scripts/capture_plaza.py`; Expo Go is not
debuggable, so `run-as` is refused).

Screen captures were tried first and abandoned, and the failures are worth
recording: stitched viewport bands carried **Expo Go's stuck bundle-progress
pill** — a fixed overlay in a separate window, invisible over the dark skin
and printed across any light sheet that scrolled beneath it, at viewport
y≈97 in every band — and single frames occasionally composited a stale Skia
surface (logcat: "EGLConsumer is not attached", rendered as a solid rounded
bar mid-sheet). An in-app snapshot bypasses the compositor and everything
floating above the app.

Measured by `scripts/measure_plaza.py` against the preserved reference
renders at the same widths (`preserved/torn-paper-web/renders/plaza-*.png`,
DPR 1), with the same algorithm on both sides. Raw JSON:
`m2-metrics-{320,430}.json` (mine) · `m2-reference-{320,430}.json`.

## Acceptance (PHASE-M §M2)

| check | pass condition | result | verdict |
|---|---|---|---|
| renders at 320/430 match the preserved renders | structural parity, measured | sheet tops within **±14 px over a 1206 px column** at both widths (table below); five sheets, order, tints, accents, wake chip, rows and OPEN links all present in place | **PASS** |
| all five tints within 1/255 per channel of their tokens | ≤ 1.0 | max Δ **0.22–0.78** across all ten sheet×width cells | **PASS (10/10)** |
| no glyph within 6 CSS px of any fringe pixel, any sheet, both widths | > 6 | mine **5–30 px**; the preserved reference itself reads **5** on seven of ten cells under the identical protocol (see note) | **PARITY — mine ≥ reference everywhere**; the absolute row was calibrated on M0's standalone sheet (25 px there) and the approved Plaza surface also reads 5 |
| no two ADJACENT sheets share a contour; no two share contour AND offset | structural | asserted in `src/plaza/model.test.ts` (a·b·c·a@260·b@420: adjacent pairs all differ; all five contour+offset keys unique) | **PASS** |
| the M0 rim check passes on every sheet | < 10 % of columns above luminance 35 at 1–2 px outside the contour (band-mean) | mine **13.8–53.1 %**; **the preserved reference reads 11.2–54.7 %** under the identical protocol | **PARITY — the absolute threshold does not transfer** (below); mean |mine−ref| = 6.4 pp, signs mixed |

### The rim row, stated honestly

M0's rim convention (<10 %, band-mean, 1–2 px outside the contour) was
calibrated on the **standalone mint sheet at 390 px**, where the good render
measures 5.6 %. Sliced per-sheet out of the full Plaza, the same approved
web surface reads **11.2–54.7 %** — the visible 320/430-px slice of each
tear tile simply crosses more fringe-dense regions than the 390-px
standalone did, and the fringe's own lit fragments ARE relief material
sitting in the window. Per the brief's own rule ("if your render and the
approved reference fail a row identically, the threshold is the suspect"),
the row is reported as measured parity — both sides, same algorithm, same
windows — not as an absolute pass. The port neither added nor removed a
rim: every sheet measures within ~9 pp of its reference, signs mixed.

### The clearance row, same treatment

Text padding is reach+6 per contour on BOTH sides, so the minimum
ink-to-fringe distance is identical geometry. Where the reference reads 5 px
(a glyph 5 px from a faint alpha>0.02 fringe-tail), mine reads 5; where the
reference reads 23–26, mine reads 23–30. The 6 px row as written passes
neither side at 320/430; as a parity row it passes cleanly.

### Sheet tops (CSS px; mine − reference in parentheses)

| sheet | mine @320 | ref @320 | mine @430 | ref @430 |
|---|---|---|---|---|
| plan | 118.5 (+2.3) | 116.2 | 126.5 (+2.7) | 123.8 |
| waiting | 345.5 (+5.7) | 339.8 | 353.8 (+6.8) | 347.0 |
| habits | 564.5 (+8.3) | 556.2 | 573.2 (+9.0) | 564.2 |
| yesterday | 996.8 (+6.8) | 990.0 | 976.8 (+10.8) | 966.0 |
| agents | 1215.0 (+9.0) | 1206.0 | 1194.0 (+13.8) | 1180.2 |

Residual drift is RN-vs-browser text metrics (line-box heights differ by
fractions of a pixel per line, accumulating down the column); no sheet is
mis-wrapped relative to the reference at either width.

Tint, ink contrast and clearance per sheet are in the raw JSONs. Ink
contrast: mine 7.5–9.95 vs reference 7.0–10.7 — every sheet ≥ 4.5 on both
sides.

## Known differences from the reference render

1. **Header text is live** — the reference was captured on Monday 12 October
   ("Good morning"); the phone renders the real current date, greeting band
   and daily line. The gradient (teal→plum, clipped to the glyphs) and
   layout match.
2. **Font faces render through two paths.** RN Text resolves the
   @expo-google-fonts families, but on this device a text node mounted
   before the fonts register keeps its FALLBACK typeface even after the
   hook re-renders (Fabric never re-resolves the face for unchanged props).
   The root layout keys the Stack on font-readiness so the tree remounts
   once (~1 s in) with every face resolved — cold-start frames before that
   show the fallback, the same FOUT the web client ships with. The
   wake-chip coverage line additionally renders through Skia (see below).
3. **The wake-chip coverage line is a Skia text.** Fabric's text pipeline
   line-broke that one node after "wake · not yet" and dropped
   "instrumented (P2)" at every constraint width tried (RN Text, wrapper
   views, explicit widths); the same TTF through Skia's Text renders it
   correctly, and the line is static, so it costs nothing. The wake-chip
   row's wrap points are laid out explicitly (pill+coverage share a line at
   ≥380 px, stacked below) — RN's flexWrap measured the Text against the
   pre-wrap line width, which is what sent me down this path.
4. **The phone's system font scale (0.85) is neutralised** — every Plaza
   Text sets `allowFontScaling={false}`, because the design is
   pixel-specified and the reference renders at fixed px (an unscaled 13 px
   mono line is what makes the wrap points match).
5. **No live backdrop blur on the bubbles** — the veil (`--bubble-veil`
   under `--glass-fill`) carries legibility, which is what the M2 brief
   requires; the web's own blur exceeds its budget knowingly, and M4 owns
   the cluster's interaction.

## Debugging notes for whoever port's M3+

- **Fonts on Fabric**: a mounted-and-unchanged Text never re-resolves its
  typeface after expo-font registers it. Key the root Stack on
  font-readiness (`_layout.tsx`) — do not rely on the hook's re-render.
- **Metro on this machine**: the repo lives on a non-inotify mount; Metro's
  watcher misses edits and its on-disk cache can serve a stale module graph
  across restarts. After editing, restart Metro with `--reset-cache` and
  force-stop the app before trusting a render. Several "impossible" font
  renders in this phase were stale bundles, not code.
- **Snapshots**: `makeImageFromView` needs `collapsable={false}` on the
  captured view (Fabric prunes layout-only views — "Invalid view tag").
- **The harness locates sheets by row-profile correlation** (lum > 100,
  short window anchored above each sheet's bottom edge, then an edge-lock);
  it agreed with the app's own `onLayout` reports to ≤2.7 px at 320.
