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
 * fixes). Skia's Text with the same TTF renders the string correctly.
 *
 * M2 review found the deeper version of the same fault: RN MEASURES body
 * text with a different face than it PAINTS. On the device, "not yet
 * instrumented · day-report adapter lands in P1" was laid out 55px tall —
 * one line — in a 946px box, then painted in Plex Mono, which is wider;
 * the tail ran past the padding and was never drawn. Three of the four
 * coverage lines lost their last words that way, which on this surface is
 * a coverage line lying about coverage.
 *
 * So paper body text wraps HERE, against the same font object that draws
 * it. Measurement and paint cannot disagree because there is only one
 * font. The string stays on an accessible wrapper, so the full text is
 * still exposed to assistive tech exactly as an RN Text would be.
 */
const COVERAGE_FONT = require("@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf");

/** Greedy word wrap against the font that will actually draw the glyphs. */
export function wrapToWidth(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  if (maxWidth <= 0) return [text];
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (line !== "" && measure(candidate) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

/**
 * A paper body line: mono, wrapped to `maxWidth`, drawn through Skia.
 *
 * `maxWidth` must be the MEASURED content width (onLayout), never derived
 * arithmetically from the window — the wake line previously sized its own
 * canvas as `chars x 13 x 0.6em` and ran off the screen edge, because a
 * character estimate is not a measurement.
 */
export function PaperText({
  children,
  maxWidth,
  color = PAPER_INK,
  fontSize = 13,
  opacity = 0.78,
  align = "left",
}: {
  children: string;
  maxWidth: number;
  color?: string;
  fontSize?: number;
  opacity?: number;
  align?: "left" | "right";
}) {
  const font = useFont(COVERAGE_FONT, fontSize);
  const metrics = font?.getMetrics();
  const lineHeight = fontSize * 1.6;
  const lines =
    font && metrics && maxWidth > 0
      ? wrapToWidth(children, maxWidth, (s) => font.measureText(s).width)
      : null;
  // The accessible wrapper renders unconditionally — before the font
  // resolves there is nothing to paint, but the string must still be
  // exposed, and the box must already reserve its height so the sheet does
  // not jump when the glyphs arrive.
  return (
    <View
      accessible
      accessibilityLabel={children}
      style={{
        width: maxWidth > 0 ? maxWidth : undefined,
        height: (lines?.length ?? 1) * lineHeight,
      }}
    >
      {lines && metrics && font ? (
        <Canvas pointerEvents="none" style={{ flex: 1, opacity }}>
          {lines.map((line, i) => (
            <SkiaText
              key={i}
              x={align === "right" ? maxWidth - font.measureText(line).width : 0}
              y={i * lineHeight + -metrics.ascent + (lineHeight - (-metrics.ascent + metrics.descent)) / 2}
              text={line}
              font={font}
              color={color}
            />
          ))}
        </Canvas>
      ) : null}
    </View>
  );
}

const LABEL_FONT = require("@expo-google-fonts/ibm-plex-sans/700Bold/IBMPlexSans_700Bold.ttf");

/**
 * A single-line label drawn through Skia, sized to its own glyphs.
 *
 * Same reason as PaperText: React Native measures text with one typeface
 * and paints it with another on Fabric, so a label can be laid out narrower
 * than it draws. On the wake screen that showed as "I'M" on a cold start —
 * the button's whole label clipped to its first word (M3 review). Drawing
 * through the font OBJECT makes the measurement and the paint the same
 * operation, so there is nothing left to disagree.
 *
 * The string rides an accessible wrapper, so assistive tech still reads it
 * exactly as it would an RN <Text>.
 */
export function SkiaLabel({
  children,
  color,
  fontSize,
  accessible = true,
}: {
  children: string;
  color: string;
  fontSize: number;
  /** Pass false when an interactive parent already carries the name, or
      assistive tech announces the same string twice. */
  accessible?: boolean;
}) {
  const font = useFont(LABEL_FONT, fontSize);
  const metrics = font?.getMetrics();
  const height = fontSize * 1.3;
  const width = font ? Math.ceil(font.measureText(children).width) + 2 : 0;
  return (
    <View
      accessible={accessible}
      accessibilityLabel={accessible ? children : undefined}
      importantForAccessibility={accessible ? "yes" : "no-hide-descendants"}
      style={{ width, height }}
    >
      {font && metrics ? (
        <Canvas pointerEvents="none" style={{ flex: 1 }}>
          <SkiaText
            x={0}
            y={-metrics.ascent + (height - (-metrics.ascent + metrics.descent)) / 2}
            text={children}
            font={font}
            color={color}
          />
        </Canvas>
      ) : null}
    </View>
  );
}

/**
 * The wake chip's coverage line — one preset of PaperText.
 *
 * `align` matters: when the pill and the line share a row the web right-
 * aligns the line, and the canvas now spans the whole remaining width, so
 * without this the text sits hard against the pill instead of hugging the
 * far edge.
 */
export function CoverageLine({
  children,
  width,
  align = "left",
}: {
  children: string;
  width: number;
  align?: "left" | "right";
}) {
  return (
    <PaperText maxWidth={width} opacity={0.72} align={align}>
      {children}
    </PaperText>
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
