/**
 * MintSheet — migration phase M0 (docs/implementation/mint-sheet-skia-brief.md).
 *
 * One sheet of torn paper in @shopify/react-native-skia: black skin above
 * and below, mint paper exposed between, fibrous relief along both cuts.
 * Layer order, colours, geometry and blend modes are the brief's §3/§4
 * values verbatim — nothing here is re-derived.
 *
 * Rule zero of this surface: no glow, stroke, outline, drop-shadow or rim
 * of our own along the tear contour. All relief light belongs to the
 * fringe PNGs, which carry it baked into discrete fragments.
 */

import React, { useMemo } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import {
  BlurMask,
  Canvas,
  Fill,
  Group,
  ImageShader,
  LinearGradient,
  Path,
  Rect,
  RoundedRect,
  Text,
  vec,
  Skia,
  useFont,
  useImage,
} from "@shopify/react-native-skia";

import { TEAR_A_TOP, TEAR_A_BOTTOM } from "./tearContours";
import { colors, lipBands } from "./theme/tokens";

// ---- colour comes from tokens.ts, never from literals ------------------
//
// These were hex literals here until 2026-10-12, duplicating values that
// tokens.ts already defines and tests. That is the specific trap this
// project has been bitten by twice on the web side: a value defined in
// two places, where the second silently diverges and nothing notices
// (--skin-lip-* cost three tuning passes, --nav-cluster-inset cost a
// whole round). A palette change must stay a token edit.
//
// scripts/lint_greps.sh now fails the build on a hex literal outside
// tokens.ts, so this cannot come back by accident.

const PAGE_BG = colors["--bg"];
const MINT = colors["--sheet-mint"];
const INK = colors["--sheet-mint-ink"];
const TEAL = colors["--accent-1-ink"];
/** Skin lip bands, innermost (against the paper, the lit cut face) first. */
const LIPS = lipBands.map((token) => colors[token]);
const CAST = [
  colors["--skin-cast-max"],
  colors["--skin-cast-mid"],
  colors["--skin-cast-far"],
];
const CAST_POSITIONS = [0, 0.14, 0.36, 1];
const CAST_DEPTH = 28;

/**
 * The forbidden rim, for the metric-sanity render ONLY (rimStroke). This
 * is the pre-2026-10-12 web lip value, kept deliberately as the thing the
 * rim check must catch — it is not part of the palette and must never be
 * drawn by the real sheet.
 */
const RIM_STROKE_COLOR = "#6E6E74";

const TEAR_W = 800;
const TEAR_H = 112;
const PAD_TOP = 100;
const PAD_BOTTOM = 91;
const PAD_X = 25.6; // 1.6rem

const FRINGE = {
  top: require("../assets/tears/fringe-a-top.png"),
  bottom: require("../assets/tears/fringe-a-bottom.png"),
};
const FIBERS = require("../assets/tears/paper-fibers.prepared.webp");
const GRAIN = require("../assets/tears/grain-420tile-3x.png");

const HEADING_FONT = require("@expo-google-fonts/ibm-plex-mono/600SemiBold/IBMPlexMono_600SemiBold.ttf");
const BODY_FONT = require("@expo-google-fonts/ibm-plex-sans/400Regular/IBMPlexSans_400Regular.ttf");

// ---- geometry ----------------------------------------------------------

/** Sheet placement on the screen: skin above, sheet, skin below. */
export const SHEET_TOP = 140;
export const SHEET_HEIGHT = 480;

const HEADING = "TODAY'S PLAN";
const BODY_LINES = ["not yet instrumented · week-plan adapter", "lands in P1"];

/**
 * Skin band k: the tear region with BOTH contours shifted (+k, ∓k) —
 * the mask of a box that is k px wider than the paper's with its mask
 * re-pinned to that box's edge (torn-paper.css `.torn-section__skin`).
 * The sliver that survives the paper drawn over it is the torn
 * cross-section of the stock, 1px per band, following every serration —
 * mask-offset, never a stroke.
 *
 * The region must be bounded by BOTH contours: filling a band from one
 * contour to the sheet's far edge paints the OPPOSITE skin zone too,
 * where nothing but the paper was supposed to cover it — the whole skin
 * then renders as one flat lip colour (that shipped here and read as a
 * 32-luminance sheet-wide rim until the pixel columns caught it).
 */
function bandRegion(
  top: number[],
  bottom: number[],
  sheetTop: number,
  stripTop: number,
  k: number,
) {
  const path = Skia.PathBuilder.Make();
  path.moveTo(0 + k, sheetTop + top[0] - k);
  for (let x = 1; x <= TEAR_W; x++) {
    path.lineTo(x + k, sheetTop + top[x] - k);
  }
  for (let x = TEAR_W; x >= 0; x--) {
    path.lineTo(x + k, stripTop + bottom[x] + k);
  }
  path.close();
  return path.build();
}

/** The paper: between the two contours, tiled at 1:1 with the strip. */
function paperRegion(top: number[], bottom: number[], sheetTop: number, stripTop: number) {
  return bandRegion(top, bottom, sheetTop, stripTop, 0);
}

export interface MintSheetProps {
  /** Tint of the paper. Token is mint; sanity renders may override. */
  paper?: string;
  /** Blend mode for the fibre texture. soft-light per the brief. */
  blend?: "softLight" | "multiply";
  /** Draw the fibre texture at all? (flat-paint sanity check) */
  texture?: boolean;
  /** Draw the fringe layers? Sanity renders drop them to expose rims. */
  fringe?: boolean;
  /** Trace the contour with a stroke — the forbidden rim, for the metric's
   * deliberate-failure check only. */
  rimStroke?: boolean;
}

export function MintSheet({
  paper = MINT,
  blend = "softLight",
  texture = true,
  fringe = true,
  rimStroke = false,
}: MintSheetProps) {
  const { width, height } = useWindowDimensions();
  const sheetTop = SHEET_TOP;
  const sheetBottom = SHEET_TOP + SHEET_HEIGHT;
  const stripTop = sheetBottom - TEAR_H;

  const fringeTop = useImage(FRINGE.top);
  const fringeBottom = useImage(FRINGE.bottom);
  const fibers = useImage(FIBERS);
  const grain = useImage(GRAIN);
  const headingFont = useFont(HEADING_FONT, 13);
  const bodyFont = useFont(BODY_FONT, 15);

  const paths = useMemo(() => {
    // bands, outermost (k=5) first, innermost against the paper last
    const bands = [5, 4, 3, 2, 1].map((k) => ({
      color: LIPS[k - 1],
      region: bandRegion(TEAR_A_TOP, TEAR_A_BOTTOM, sheetTop, stripTop, k),
    }));
    const paper = paperRegion(TEAR_A_TOP, TEAR_A_BOTTOM, sheetTop, stripTop);
    return { bands, paper };
  }, [sheetTop, stripTop]);

  // everything horizontal repeats; draw enough tiles to cover the viewport
  // plus the band offsets' wrap at the tile seam
  const tileOffsets = useMemo(() => {
    const offsets: number[] = [];
    for (let x = -TEAR_W; x < width + TEAR_W; x += TEAR_W) {
      offsets.push(x);
    }
    return offsets;
  }, [width]);

  // heading, letter-spaced by hand — Skia's Text has no letterSpacing
  const headingChars = useMemo(() => {
    if (!headingFont) return [];
    const spacing = 13 * 0.18; // 0.18em at 13px
    const out: { ch: string; x: number }[] = [];
    let x = PAD_X;
    for (const ch of HEADING) {
      out.push({ ch, x });
      x += headingFont.measureText(ch).width + spacing;
    }
    return out;
  }, [headingFont]);

  const headingBaseline = sheetTop + PAD_TOP + 11; // ~13px ascent box
  // h2 margin-bottom 0.55rem, accent margin -0.2rem top / 0.7rem bottom
  const accentY = headingBaseline + 8.8 - 3.2 + 1.5;
  const bodyTop = accentY + 2 + 11.2;

  return (
    <Canvas style={StyleSheet.absoluteFill}>
      {/* 1. page background — continuous, the sheet never paints over it */}
      <Fill color={PAGE_BG} />
      <Fill>
        <ImageShader
          image={grain}
          fit="fill"
          rect={{ x: 0, y: 0, width: 420, height: 420 }}
          tx="repeat"
          ty="repeat"
        />
      </Fill>

      {/* the sheet's seat: 0 1px 2px rgba(0,0,0,0.55) — barely proud */}
      <Path
        path={paths.paper}
        color="rgba(0, 0, 0, 0.55)"
        transform={[{ translateY: 1 }]}
      >
        <BlurMask blur={1} style="normal" />
      </Path>

      {/* 2. skin bands, outermost first, innermost against the paper */}
      {paths.bands.map((band, i) => (
        <Group key={i}>
          {tileOffsets.map((ox) => (
            <Group key={ox} transform={[{ translateX: ox }]}>
              <Path path={band.region} color={band.color} />
            </Group>
          ))}
        </Group>
      ))}

      {/* 3. paper — tint + fibre texture in soft-light, cut by the tear.
             soft-light is neutral at the texture's mid-grey; multiply once
             rendered mint as #526B61 (brief trap 2). */}
      <Group clip={paths.paper}>
        <Fill color={paper} />
        {texture ? (
          <Group blendMode={blend}>
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
        ) : null}

        {/* 4. cast shadow — the skin's edge falling INWARD onto the paper */}
        <Rect x={0} y={sheetTop} width={width} height={CAST_DEPTH}>
          <LinearGradient
            start={vec(0, sheetTop)}
            end={vec(0, sheetTop + CAST_DEPTH)}
            colors={[...CAST, "rgba(0, 0, 0, 0)"]}
            positions={CAST_POSITIONS}
          />
        </Rect>
        <Rect x={0} y={sheetBottom - CAST_DEPTH} width={width} height={CAST_DEPTH}>
          <LinearGradient
            start={vec(0, sheetBottom)}
            end={vec(0, sheetBottom - CAST_DEPTH)}
            colors={[...CAST, "rgba(0, 0, 0, 0)"]}
            positions={CAST_POSITIONS}
          />
        </Rect>
      </Group>

      {/* 6. content, inside the padding, above everything but the fringe */}
      <Group>
        {headingChars.map(({ ch, x }, i) => (
          <Text key={i} x={x} y={headingBaseline} text={ch} font={headingFont} color={INK} />
        ))}
        <RoundedRect x={PAD_X} y={accentY} width={36} height={2} r={1} color={TEAL} />
        {BODY_LINES.map((line, i) => (
          <Text
            key={i}
            x={PAD_X}
            y={bodyTop + 21 * (i + 1)}
            text={line}
            font={bodyFont}
            color={INK}
          />
        ))}
      </Group>

      {/* 5. fringe — the pair of the mask, own alpha, no blend, no tint.
             It must never carry a background colour: it paints over
             neither the skin nor the paper (brief §4.5). Tiled repeat-x,
             never stretched (brief trap 4). */}
      {fringe ? (
        <Group>
          <Rect x={0} y={sheetTop} width={width} height={TEAR_H}>
            <ImageShader
              image={fringeTop}
              fit="fill"
              rect={{ x: 0, y: sheetTop, width: TEAR_W, height: TEAR_H }}
              tx="repeat"
              ty="repeat"
            />
          </Rect>
          <Rect x={0} y={stripTop} width={width} height={TEAR_H}>
            <ImageShader
              image={fringeBottom}
              fit="fill"
              rect={{ x: 0, y: stripTop, width: TEAR_W, height: TEAR_H }}
              tx="repeat"
              ty="repeat"
            />
          </Rect>
        </Group>
      ) : null}

      {/* the forbidden rim — ONLY rendered for the measurement's
             deliberate-failure sanity check, never in the real sheet */}
      {rimStroke ? (
        <Path
          path={paths.paper}
          color={RIM_STROKE_COLOR}
          style="stroke"
          strokeWidth={1.5}
        />
      ) : null}
    </Canvas>
  );
}
