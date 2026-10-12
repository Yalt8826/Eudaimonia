import { View, Text, Pressable, StyleSheet, type TextStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Link } from "expo-router";
import { Canvas, Text as SkiaText, useFont } from "@shopify/react-native-skia";

import { colors, dotWell, type ColorToken } from "../theme/tokens";

// Plaza atoms, ported from client/src/components/ui.tsx at M2 (04 `/` +
// 01 §1): uppercase letter-spaced section headings live on TornSheet; these
// are the fixed-state dots, the wake pills, the coverage lines and the
// shared rows. Colors ride tokens only — the accent/state greps hold here.

const mono: TextStyle = {
  fontFamily: "IBMPlexMono_400Regular",
};

/** The rows' and pills' ink on section paper (theme.css --paper-ink). */
const PAPER_INK = colors["--paper-ink"];

export function Chevron({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg viewBox="0 0 24 24" width={size} height={size}>
      <Path
        d="m9 5 7 7-7 7"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.65}
      />
    </Svg>
  );
}

export type DotTone = "muted" | "amber" | "alive" | "dead";

// The GLASS state pair, because the dot sits in a glass well — see below.
const DOT_TOKEN: Record<DotTone, ColorToken> = {
  muted: "--muted",
  amber: "--paused-glass",
  alive: "--alive-glass",
  dead: "--dead-glass",
};

/**
 * A liveness dot in its own glass well — the self-glass law (01 §5),
 * generalised from widgets to tinted sheets (amendment 2026-10-10).
 *
 * The paper state pair was calibrated on cream and falls under the 3.0
 * non-text floor on the saturated section tints (alive measures 2.26 on
 * mint, 1.53 on violet). Rather than soften the floor or pale the tints,
 * the dot gets the same treatment a widget gets on an unknown wallpaper: a
 * small well back down to the matte skin, which is a calibrated surface, so
 * the dot carries the GLASS pair at alive 6.85 · dead 5.19 · paused 6.89 ·
 * dormant 6.15. Liveness stays truthful on any tint.
 *
 * The well is the two token layers in order (theme.css --dot-well: the
 * glass fill over --bg) — nested here so both tokens stay in play rather
 * than precompositing the colour into a literal.
 */
export function Dot({ tone = "muted" }: { tone?: DotTone }) {
  return (
    <View
      aria-hidden
      style={[
        styles.dotWell,
        { backgroundColor: dotWell.base, borderColor: colors["--glass-border"] },
      ]}
    >
      <View style={[StyleSheet.absoluteFill, styles.dotWell, { backgroundColor: dotWell.fill }]} />
      <View
        style={{
          width: 8, // 0.5rem
          height: 8,
          borderRadius: 4,
          backgroundColor: colors[DOT_TOKEN[tone]],
        }}
      />
    </View>
  );
}

/**
 * The honest coverage line, mono at 0.8125rem/1.6, paper-ink at 0.72.
 *
 * Drawn through SKIA rather than an RN Text: this node was the one text on
 * the Plaza that Fabric's text pipeline broke — it line-broke after
 * "wake · not yet" and dropped the rest no matter the constraint width
 * (caught on the 430 snap; see the git history for three attempted RN-side
 * fixes). Skia's Text with the same TTF renders the string correctly, and
 * the line is static, so the canvas costs nothing. `width` comes from the
 * caller: the caller derives it from the string (chars × 13 × 0.6em).
 */
const COVERAGE_FONT = require("@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf");

export function CoverageLine({ children, width }: { children: string; width: number }) {
  const font = useFont(COVERAGE_FONT, 13);
  const metrics = font?.getMetrics();
  if (!font || !metrics) return null;
  return (
    <Canvas
      pointerEvents="none"
      style={{ width, height: -metrics.ascent + metrics.descent, opacity: 0.72 }}
    >
      <SkiaText x={0} y={-metrics.ascent} text={children} font={font} color={PAPER_INK} />
    </Canvas>
  );
}

export function Row({
  to,
  dot,
  title,
  subtitle,
}: {
  to: string;
  dot?: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  // asChild + Pressable: Link alone renders a Text wrapper, and Views
  // inside an inline-text layout measure wrong (the subtitle wrapped after
  // 7 characters and the chevron drifted mid-row — caught on the 430 snap).
  // A Pressable child makes the row a real flex container.
  return (
    <Link href={to} asChild>
      <Pressable accessibilityRole="button">
        <View
          style={{
            // flex row, centre, gap 0.7rem; padding 0.55rem 0; minHeight 2.75rem
            flexDirection: "row",
            alignItems: "center",
            gap: 11.2,
            paddingVertical: 8.8,
            minHeight: 44,
          }}
        >
          {dot}
          <View style={{ flex: 1, gap: 1.6 }}>
            <Text allowFontScaling={false} style={[mono, styles.rowTitle, { color: PAPER_INK }]}>
              {title}
            </Text>
            {subtitle !== undefined ? (
              <Text
                allowFontScaling={false}
                style={[mono, styles.rowSubtitle, { color: PAPER_INK }]}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Chevron color={PAPER_INK} />
        </View>
      </Pressable>
    </Link>
  );
}

export function Pill({
  to,
  children,
  tone = "solid",
}: {
  to: string;
  children: string;
  tone?: "solid" | "outline";
}) {
  // Text styles ride the inner Text — a Pressable is a View, and its style
  // does not reach the Text (the pills rendered Roboto mixed-case when the
  // mono/uppercase props sat on the Pressable — caught on the 430 snap).
  const textStyle: TextStyle = StyleSheet.flatten([
    mono,
    {
      fontSize: 13,
      letterSpacing: 13 * 0.06,
      textTransform: "uppercase",
    } as TextStyle,
  ]);
  return (
    <Link href={to} asChild>
      <Pressable
        accessibilityRole="button"
        style={StyleSheet.flatten([
          styles.pill,
          tone === "solid"
            ? {
                // color-mix(in srgb, var(--bg) 82%, transparent)
                backgroundColor: "rgba(11, 11, 12, 0.82)",
                borderColor: colors["--accent-1"],
                color: colors["--accent-1"],
              }
            : {
                borderColor: PAPER_INK,
                color: PAPER_INK,
              },
        ])}
      >
        <Text allowFontScaling={false} style={textStyle}>
          {children}
        </Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  dotWell: {
    width: 18.4, // 1.15rem
    height: 18.4,
    borderRadius: 9.2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: {
    // 0.95rem, weight 500
    fontSize: 15.2,
    fontWeight: "500",
  },
  rowSubtitle: {
    // 0.78rem, opacity 0.7
    fontSize: 12.48,
    opacity: 0.7,
  },
  pill: {
    // padding 0.5rem 0.9rem; radius 9999; border 1.5px
    // (the type itself rides the inner Text)
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 14.4,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1.5,
  },
});
