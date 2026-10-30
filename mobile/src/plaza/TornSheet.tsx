/**
 * TornSheet — the Plaza's one sheet primitive, M2's generalisation of the
 * M0 MintSheet (docs/implementation/PHASE-M-STACK-MIGRATION.md §M2).
 *
 * One sheet of coloured paper exposed where the black skin has been torn
 * away: skin bands above and below, tinted paper with the fibre texture in
 * soft-light between, fibrous relief along both cuts. Layer order, colours
 * and blend modes are the mint brief's §3/§4 values verbatim — nothing
 * here is re-derived.
 *
 * What changed from M0:
 *   - FIVE tints (the section papers) and THREE authored contours. Contour
 *     and fringe are a PAIR per tear — generated from one contour array in
 *     one run of author_tears.py — so this component swaps them together
 *     and accepts nothing else (README #2: tear-b once shipped wearing
 *     tear-a's fringe and read as a misprint).
 *   - tearOffset phases the tiled 800px strip: two sheets on the same
 *     contour tear differently because the strip is seamless and can start
 *     anywhere along its width (torn-paper.css --tear-x).
 *   - The content is NOT drawn here. The sheet renders material only and
 *     lays `children` into the per-tear padding as ordinary RN views —
 *     which is what makes the bubbles, pills and links tappable without a
 *     second hit-target layer.
 *
 * Rule zero of this surface: no glow, stroke, outline, drop-shadow or rim
 * of our own along the tear contour. All relief light belongs to the
 * fringe PNGs, which carry it baked into discrete fragments.
 */

import React, { useMemo, useState } from "react";
import { StyleSheet, Text as RNText, View } from "react-native";
import {
  BlurMask,
  Canvas,
  Fill,
  Group,
  ImageShader,
  LinearGradient,
  Path,
  Rect,
  Skia,
  vec,
} from "@shopify/react-native-skia";
import { FRINGES, PAPER_FIBERS, useSkiaImage } from "./skiaAssets";

import {
  TEAR_A_TOP,
  TEAR_A_BOTTOM,
  TEAR_B_TOP,
  TEAR_B_BOTTOM,
  TEAR_C_TOP,
  TEAR_C_BOTTOM,
} from "../tearContours";
import { ACCENT_INK_OF, PAPER_OF, TEAR_PADDING,  type PaperVariant, type SectionAccent, type TearVariant } from "./model";
import type { ColorToken } from "../theme/tokens";
import { colors, lipBands } from "../theme/tokens";

// ---- colour comes from tokens.ts, never from literals ------------------
// See MintSheet.tsx: this file was bitten twice on the web by a value
// defined in two places. A palette change must stay a token edit.

const LIPS = lipBands.map((token) => colors[token]);
const CAST = [
  colors["--skin-cast-max"],
  colors["--skin-cast-mid"],
  colors["--skin-cast-far"],
];
const CAST_POSITIONS = [0, 0.14, 0.36, 1];
const CAST_DEPTH = 28;

const TEAR_W = 800;
const TEAR_H = 112;
const PAD_X = 25.6; // 1.6rem, torn-paper.css --pad-x

// the fringe pairs and the fibres load ONCE for all sheets (skiaAssets.ts)
const FRINGE_OF: Readonly<Record<TearVariant, { top: number; bottom: number }>> = FRINGES;

// ---- geometry ----------------------------------------------------------

/** The tear strip contour per variant, sampled verbatim from the authored
    SVG point tables (scripts/extract_contours.py — never regenerate). */
export const CONTOURS_OF: Readonly<
  Record<TearVariant, { top: readonly number[]; bottom: readonly number[] }>
> = {
  a: { top: TEAR_A_TOP, bottom: TEAR_A_BOTTOM },
  b: { top: TEAR_B_TOP, bottom: TEAR_B_BOTTOM },
  c: { top: TEAR_C_TOP, bottom: TEAR_C_BOTTOM },
};

/**
 * The contour with the tile phase applied: CSS mask-position /
 * background-position x puts the 800px tile's origin at `phase`, so screen
 * column x reads tile coordinate (x - phase) mod 800. Fractional phases
 * (offsets are whole px today) land on the lower sample — the strip is
 * seamless, endpoints match, so a 1px phase error is invisible.
 */
function tearY(contour: readonly number[], x: number, phase: number): number {
  const i = ((((Math.round(x) - phase) % TEAR_W) + TEAR_W) % TEAR_W);
  return contour[i];
}

/**
 * Skin band k: the tear region with BOTH contours phased by (offset + k)
 * and shifted (∓k) — the mask of a box k px wider than the paper's with
 * its mask re-pinned to that box's edge (torn-paper.css
 * `.torn-section__skin`, --band-x = --tear-x + band*1px). The sliver that
 * survives the paper drawn over it is the torn cross-section of the stock,
 * 1px per band, following every serration — mask-offset, never a stroke.
 *
 * The region must be bounded by BOTH contours: filling a band from one
 * contour to the sheet's far edge paints the OPPOSITE skin zone too, where
 * nothing but the paper was supposed to cover it (that shipped in M0 and
 * read as a 32-luminance sheet-wide rim until the pixel columns caught it).
 */
function bandRegion(
  top: readonly number[],
  bottom: readonly number[],
  width: number,
  height: number,
  phase: number,
  k: number,
) {
  const path = Skia.PathBuilder.Make();
  path.moveTo(0, tearY(top, 0, phase) - k);
  for (let x = 1; x <= width; x++) {
    path.lineTo(x, tearY(top, x, phase) - k);
  }
  for (let x = width; x >= 0; x--) {
    path.lineTo(x, height - TEAR_H + tearY(bottom, x, phase) + k);
  }
  path.close();
  return path.build();
}

export interface TornSheetProps {
  /** Tint of the paper — the section's identity for life. */
  variant: PaperVariant;
  /** Which authored contour to tear with, fringe swapped with it. */
  tear: TearVariant;
  /** Phase into the tiled tear strip, px (torn-paper.css --tear-x). */
  tearOffset?: number;
  /** Sheet placement on screen: skins stack, each later sheet rides up over
      the previous one's bottom tear (plazaSheetOverlap). */
  overlapMarginTop?: number;
  /**
   * The hue-law accent, drawn as the short rule under the heading — kept
   * HERE so the plaza cannot hang it anywhere but under its sheet's title,
   * painted from the -ink pair (the raw accent vanishes on paper).
   */
  accent?: SectionAccent;
  title: string;
  children?: React.ReactNode;
  /** Capture-harness hook: reports the sheet's laid-out box (CSS px, y is
      relative to the Plaza column) so the measured harness can cross-check
      its located sheet tops against the layout the app itself committed. */
  onGeometry?: (title: string, box: { y: number; h: number; w: number }) => void;
}

export function TornSheet({
  variant,
  tear,
  tearOffset = 0,
  overlapMarginTop = 0,
  accent,
  title,
  children,
  onGeometry,
}: TornSheetProps) {
  // The sheet is as wide as its column and as tall as its content plus the
  // per-tear padding; onLayout is what marries the RN flow layout to the
  // Skia geometry underneath it.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  const pad = TEAR_PADDING[tear];
  const paperToken = PAPER_OF[variant].paper;
  const inkToken = PAPER_OF[variant].ink;
  const paper = colors[paperToken];
  const ink = colors[inkToken];

  const fringe = useSkiaImage(FRINGE_OF[tear].top);
  const fringeBottom = useSkiaImage(FRINGE_OF[tear].bottom);
  const fibers = useSkiaImage(PAPER_FIBERS);

  // everything horizontal repeats; the tile is 800px wide and phones are
  // narrower, but the offset can push the first tile's start past the left
  // edge, so draw one extra tile's worth of fringe on each side
  const fringeX = ((tearOffset % TEAR_W) + TEAR_W) % TEAR_W;

  const paths = useMemo(() => {
    if (!box) return null;
    const { w, h } = box;
    const phase = ((tearOffset % TEAR_W) + TEAR_W) % TEAR_W;
    const contours = CONTOURS_OF[tear];
    // bands, outermost (k=5) first, innermost against the paper last
    const bands = [5, 4, 3, 2, 1].map((k) => ({
      color: LIPS[k - 1],
      region: bandRegion(contours.top, contours.bottom, w, h, phase + k, k),
    }));
    const paperRegion = bandRegion(contours.top, contours.bottom, w, h, phase, 0);
    return { bands, paperRegion };
  }, [box, tear, tearOffset]);

  return (
    <View
      onLayout={(e) => {
        const { x: _x, y, width, height } = e.nativeEvent.layout;
        onGeometry?.(title, { y, h: height, w: width });
        if (!box || box.w !== width || box.h !== height) setBox({ w: width, h: height });
      }}
      style={{
        marginTop: overlapMarginTop,
        paddingTop: pad.top,
        paddingBottom: pad.bottom,
      }}
    >
      <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
        {box && paths ? (
          <>
            {/* the sheet's seat: 0 1px 2px rgba(0,0,0,0.55) — barely proud */}
            <Path path={paths.paperRegion} color="rgba(0, 0, 0, 0.55)" transform={[{ translateY: 1 }]}>
              <BlurMask blur={1} style="normal" />
            </Path>

            {/* 2. skin bands, outermost first, innermost against the paper */}
            {paths.bands.map((band, i) => (
              <Path key={i} path={band.region} color={band.color} />
            ))}

            {/* 3. paper — tint + fibre texture in soft-light, cut by the
                   tear. soft-light is neutral at the texture's mid-grey;
                   multiply once rendered mint as #526B61 (brief trap 2). */}
            <Group clip={paths.paperRegion}>
              <Fill color={paper} />
              <Group blendMode="softLight">
                <Fill>
                  <ImageShader
                    image={fibers}
                    fit="fill"
                    rect={{ x: 0, y: 0, width: 320, height: 320 }}
                    tx="repeat"
                    ty="repeat"
                  />
                </Fill>
              </Group>

              {/* 4. cast shadow — the skin's edge falling INWARD onto the
                     paper; a sheet casting outward renders the stack
                     upside down (01 §2 placement ruling). */}
              <Rect x={0} y={0} width={box.w} height={CAST_DEPTH}>
                <LinearGradient
                  start={vec(0, 0)}
                  end={vec(0, CAST_DEPTH)}
                  colors={[...CAST, "rgba(0, 0, 0, 0)"]}
                  positions={CAST_POSITIONS}
                />
              </Rect>
              <Rect x={0} y={box.h - CAST_DEPTH} width={box.w} height={CAST_DEPTH}>
                <LinearGradient
                  start={vec(0, box.h)}
                  end={vec(0, box.h - CAST_DEPTH)}
                  colors={[...CAST, "rgba(0, 0, 0, 0)"]}
                  positions={CAST_POSITIONS}
                />
              </Rect>
            </Group>

            {/* 5. fringe — the pair of the mask, own alpha, no blend, no
                   tint. It must never carry a background colour: it paints
                   over neither the skin nor the paper (brief §4.5). Tiled
                   repeat-x at 1:1, never stretched (brief trap 4); the
                   phase matches the paper's --tear-x. */}
            <Rect x={0} y={0} width={box.w} height={TEAR_H}>
              <ImageShader
                image={fringe}
                fit="fill"
                rect={{ x: fringeX, y: 0, width: TEAR_W, height: TEAR_H }}
                tx="repeat"
                ty="repeat"
              />
            </Rect>
            <Rect x={0} y={box.h - TEAR_H} width={box.w} height={TEAR_H}>
              <ImageShader
                image={fringeBottom}
                fit="fill"
                rect={{ x: fringeX, y: box.h - TEAR_H, width: TEAR_W, height: TEAR_H }}
                tx="repeat"
                ty="repeat"
              />
            </Rect>
          </>
        ) : null}
      </Canvas>

      {/* 6. content, inside the padding, above everything but the fringe
             — the padding clears the tear's MATERIAL (tear-metrics.json
             + 6px), so content and fringe never share pixels. */}
      <View style={{ paddingHorizontal: PAD_X }}>
        <RNText
          allowFontScaling={false}
          accessibilityRole="header"
          style={[styles.heading, { color: ink }]}
        >
          {title}
        </RNText>
        {accent ? <AccentRule token={ACCENT_INK_OF[accent]} /> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    // torn-paper.css .torn-section__heading:
    // margin 0 0 0.55rem; 0.8125rem, weight 600, 0.18em, uppercase
    marginBottom: 8.8,
    fontFamily: "IBMPlexMono_600SemiBold",
    fontSize: 13,
    letterSpacing: 13 * 0.18,
    textTransform: "uppercase",
  },
  accent: {
    // .torn-section__accent: width 2.25rem, height 2px,
    // margin -0.2rem 0 0.7rem, radius 1px
    width: 36,
    height: 2,
    marginTop: -3.2,
    marginBottom: 11.2,
    borderRadius: 1,
  },
});

/** The hue-law accent: a short mark under the heading, INSIDE the content
    box. The earlier web form was a 3px rule at the paper's edge running
    its full height — that is a border, it sits on the torn perimeter, and
    it fights the tear for the eye (torn-paper.css .torn-section__accent). */
export function AccentRule({ token }: { token: ColorToken }) {
  return <View aria-hidden style={[styles.accent, { backgroundColor: colors[token] }]} />;
}
