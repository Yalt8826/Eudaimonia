import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Canvas,
  Fill,
  ImageShader,
  LinearGradient,
  Rect,
  Text as SkiaText,
  useFont,
  vec,
} from "@shopify/react-native-skia";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, headerScrim } from "../theme/tokens";
import { PLAZA_STRIPS, PAPER_OF, type PlazaStrip } from "./model";
import { TornSheet } from "./TornSheet";
import { Chevron, CoverageLine, Dot, PaperText, Pill, Row } from "./ui";
import { dailyLine, dateLabel, greetingFor } from "./greeting";
import { captureMode } from "./captureMode";

// The Plaza (04 `/`), ported from client/src/routes/PlazaScreen.tsx at M2:
// the read-only dashboard in the torn-paper language per the ratified
// mockup (2026-10-10). Until the P1 adapters land, every strip renders its
// TRUE state — honest uninstrumented lines, never fabricated counts (law
// 7; T1.6 wires the real coverage feed). The wake chip is real today: it
// deep-links the precached hard-mode screen (law 9).
//
// Layers, mirroring the web's stack: the matte skin (bg + grain + header
// scrim) is one Canvas behind the whole column; each sheet is a TornSheet
// whose Skia canvas paints ONLY the sheet material, with the content as
// ordinary RN views in the per-tear padding. Sheets ride up over the one
// above (plazaSheetOverlap), so a later sheet's skin covers the previous
// sheet's bottom tear — the black between two sheets is one band of skin,
// not a gutter between cards.

const mono = {
  fontFamily: "IBMPlexMono_400Regular",
} as const;


/** Plaza main padding: 1.1rem top, 4rem bottom (PlazaScreen.tsx). */
const MAIN_PAD = { top: 17.6, bottom: 64 } as const;

/** The muted header lines: 0.8rem mono, 0.08em tracking (Header). */
const headerLineStyle = StyleSheet.create({
  line: {
    ...mono,
    fontSize: 12.8,
    letterSpacing: 12.8 * 0.08,
    color: colors["--muted"],
  },
});


/** Greeting fontSize clamp(1.4rem, 6.4vw, 1.9rem), computed per width. */
export function greetingFontSize(windowWidth: number): number {
  return Math.min(Math.max(22.4, windowWidth * 0.064), 30.4);
}

const GRAIN = require("../../assets/tears/grain-420tile-3x.png");
const GREETING_FONT = require("@expo-google-fonts/ibm-plex-sans/700Bold/IBMPlexSans_700Bold.ttf");

/**
 * The matte skin behind the whole column: --bg, its static grain, and the
 * header's darker scrim (theme.css body background stack). The scrim is
 * what lets the grain be strong: the Plaza header is the only text in the
 * app that sits on bare skin (tokens.ts headerScrim). Both static — the
 * skin never animates (01 v2 §2 gate 4).
 */
function SkinCanvas({ width }: { width: number }) {
  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Fill color={colors["--bg"]} />
      <Fill>
        <ImageShader
          image={GRAIN}
          fit="fill"
          rect={{ x: 0, y: 0, width: 420, height: 420 }}
          tx="repeat"
          ty="repeat"
        />
      </Fill>
      <Rect x={0} y={0} width={width} height={headerScrim.fadeByPx}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, headerScrim.fadeByPx)}
          colors={[headerScrim.color, "rgba(0, 0, 0, 0)"]}
        />
      </Rect>
    </Canvas>
  );
}

/**
 * The greeting with the teal→plum gradient clipped to the text — the RN
 * form of the web h1's background-clip: text. One SkiaText for the whole
 * line (Skia measures and advances the string correctly; per-glyph
 * placement measured spaces as zero-width and clipped the last glyph on
 * the first phone render). The web's -0.01em tracking is 0.2% of the line
 * and is not reproduced. Both gradient ends are measured against --bg in
 * contrast.test.ts. 100deg runs nearly horizontal, dipping slightly.
 */
function GradientGreeting({ text, windowWidth }: { text: string; windowWidth: number }) {
  const fontSize = greetingFontSize(windowWidth);
  const font = useFont(GREETING_FONT, fontSize);

  const metrics = font?.getMetrics();
  const textWidth = font ? Math.ceil(font.measureText(text).width) : 1;
  // the natural line box: ascent above the baseline, descent below — the
  // box the browser stacks the h1's margins around
  const lineHeight = metrics ? -metrics.ascent + metrics.descent : fontSize * 1.3;

  if (!font || !metrics) return null;
  return (
    <Canvas
      pointerEvents="none"
      style={{ marginTop: 4, marginBottom: 4.8, width: textWidth + 2, height: lineHeight }}
    >
      <SkiaText x={0} y={-metrics.ascent} text={text} font={font}>
        <LinearGradient
          start={vec(0, lineHeight * 0.1)}
          end={vec(textWidth, lineHeight * 0.9)}
          colors={[colors["--accent-1"], colors["--accent-2"]]}
        />
      </SkiaText>
    </Canvas>
  );
}

/** The header: long date, gradient greeting, the day's one line. No
    settings gear — Settings is a bubble in the nav cluster, and the same
    destination in two places is one too many. */
export function Header({ windowWidth, paddingTop }: { windowWidth: number; paddingTop: number }) {
  const now = new Date();
  const greeting = greetingFor(now);
  return (
    <View style={{ paddingHorizontal: 18.4, paddingTop, paddingBottom: 17.6 }}>
      <Text allowFontScaling={false} style={headerLineStyle.line}>
        {dateLabel(now)}
      </Text>
      <GradientGreeting text={greeting} windowWidth={windowWidth} />
      <Text allowFontScaling={false} style={headerLineStyle.line}>
        {dailyLine(now)}
      </Text>
    </View>
  );
}

/**
 * The wake chip row (WakeChipRow): the solid pill, its honest coverage
 * line, and the outline pill. The web row is flex-wrap and the wrap points
 * are content-deterministic at the Plaza's two layout widths — pill +
 * coverage share the first line above 380px, everything stacks below it —
 * so the port lays the two cases out EXPLICITLY. RN's flexWrap was tried
 * first and measures a wrapped-away Text against the pre-wrap line, which
 * truncated the coverage line after "wake · not yet" (caught on the 430
 * snap; the numbers: pill 66 + gap 9.6 + line 250 = 325.6, content width
 * 268.8 at 320 / 378.8 at 430).
 */
function WakeChipRow({ wide, contentWidth }: { wide: boolean; contentWidth: number }) {
  // The coverage line's width is MEASURED (StripContent's onLayout), not
  // derived. It was `32 chars x 13px x 0.6em = 249.6`, and on a 360dp phone
  // that ran the closing ")" off the screen edge. PaperText wraps against
  // the same font object it paints with, so it fits whatever box it is
  // given and cannot disagree with itself about where the line breaks.
  //
  // Wide: the pill and the line share a row, so the line gets what is left
  // after the pill and the gap. Narrow: it owns the full content width.
  const PILL_W = 66;
  const GAP = 9.6;
  const coverageWidth = wide ? Math.max(0, contentWidth - PILL_W - GAP) : contentWidth;
  const coverage = (
    <View style={{ alignItems: wide ? "flex-end" : "flex-start" }}>
      <CoverageLine width={coverageWidth} align={wide ? "right" : "left"}>
        wake · not yet instrumented (P2)
      </CoverageLine>
    </View>
  );
  if (wide) {
    // pill + coverage share the first line, the outline pill wraps below —
    // the web row's wrap point at 430.
    return (
      <View style={{ gap: GAP, paddingVertical: 5.6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pill to="/habits/wake" tone="solid">
            Wake
          </Pill>
          {coverage}
        </View>
        <Pill to="/habits/wake" tone="outline">
          tap when you wake
        </Pill>
      </View>
    );
  }
  // at 320 the three chips stack (325.6 > 268.8) — the web row's wrap at 320.
  return (
    <View style={{ gap: 9.6, paddingVertical: 5.6, alignItems: "flex-start" }}>
      <Pill to="/habits/wake" tone="solid">
        Wake
      </Pill>
      {coverage}
      <Pill to="/habits/wake" tone="outline">
        tap when you wake
      </Pill>
    </View>
  );
}

/** The OPEN link, bottom-right of its sheet. asChild + Pressable: a bare
    Link renders a Text wrapper, and this row mixes a View (the chevron). */
function OpenLink({ to, label, ink }: { to: string; label: string; ink: string }) {
  return (
    <Link href={to} aria-label={label} asChild>
      <Pressable accessibilityRole="button" hitSlop={4}>
        <View
          style={{ flexDirection: "row", alignSelf: "flex-end", alignItems: "center", gap: 5.6 }}
        >
          <Text
            allowFontScaling={false}
            style={[
              mono,
              { fontSize: 12.48, letterSpacing: 1, textTransform: "uppercase", opacity: 0.72, color: ink },
            ]}
          >
            open
          </Text>
          <Chevron color={ink} />
        </View>
      </Pressable>
    </Link>
  );
}

function StripContent({ strip, ink, windowWidth }: { strip: PlazaStrip; ink: string; windowWidth: number }) {
  // The content width is measured, not computed from windowWidth minus the
  // paddings: this View is where the text actually lives, so its own box is
  // the only width that cannot drift from the layout.
  const [contentWidth, setContentWidth] = useState(0);
  return (
    <View
      style={{ gap: 8.8 }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (w !== contentWidth) setContentWidth(w);
      }}
    >
      {strip.wakeChip ? (
        <>
          <WakeChipRow wide={windowWidth >= 380} contentWidth={contentWidth} />
          <View>
            <Row to="/meals" dot={<Dot tone="muted" />} title="Nutrition" subtitle="not yet instrumented" />
            <Row to="/reading" dot={<Dot tone="amber" />} title="Reading" subtitle="not yet instrumented" />
          </View>
        </>
      ) : null}

      {/* Body lines go through PaperText, which wraps against the font it
          paints with. As RN <Text> these measured one line and painted two
          lines' worth of glyphs, so three of the four sheets dropped the
          end of their coverage line (M2 review, measured on device: the
          butter line laid out 55px tall in a 946px box for a string that
          needs 110). A coverage line that loses its tail is this surface
          lying about coverage, which is the one thing it exists not to do. */}
      {strip.lines.map((line) => (
        <PaperText key={line} maxWidth={contentWidth} color={ink} opacity={0.78}>
          {line}
        </PaperText>
      ))}

      {/* the OPEN link, bottom-right of its sheet (PlazaScreen.tsx) */}
      <OpenLink to={strip.to} label={`${strip.title} — open`} ink={ink} />
    </View>
  );
}


/**
 * The column: skin, header, five sheets. `band`, when given, translates
 * the column up by whole viewport-heights inside a clipped box — the
 * capture harness (renders/MEASUREMENTS): a phone viewport cannot
 * screenshot a ~1600px column in one shot, the way the web reference
 * renders were captured full-page, so the render is stitched from
 * exact-offset screenshots instead of scrolled ones (the floating cluster
 * would land differently in every scroll frame).
 */
export function PlazaBody({
  windowWidth,
  topInset,
  capture = false,
}: {
  windowWidth: number;
  topInset: number;
  /** capture mode: sheets report their laid-out boxes for the harness */
  capture?: boolean;
}) {
  return (
    <View style={{ width: windowWidth }}>
      <SkinCanvas width={windowWidth} />
      <Header windowWidth={windowWidth} paddingTop={MAIN_PAD.top + 6.4 + topInset} />
      {PLAZA_STRIPS.map((strip, i) => (
        <TornSheet
          key={strip.id}
          title={strip.title}
          variant={strip.variant}
          tear={strip.tear}
          tearOffset={strip.tearOffset}
          accent={strip.accent}
          overlapMarginTop={i === 0 ? 0 : -72}
          onGeometry={
            capture
              ? (t, b) => console.log(`[plaza-geom] ${t} y=${b.y.toFixed(1)} h=${b.h.toFixed(1)} w=${b.w.toFixed(1)}`)
              : undefined
          }
        >
          <StripContent strip={strip} ink={colors[PAPER_OF[strip.variant].ink]} windowWidth={windowWidth} />
        </TornSheet>
      ))}
      {/* the black below the last sheet: 4rem, so the floating cluster can
          never cover the final OPEN link (PlazaScreen.tsx) */}
      <View style={{ height: MAIN_PAD.bottom }} />
    </View>
  );
}

export default function PlazaScreen() {
  const params = useLocalSearchParams<{ snap?: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Written during render ON PURPOSE: the bubble cluster renders later in
  // the same commit (shell JSX order) and must see the current mode —
  // see captureMode.ts. The react-compiler lint wants an effect here; an
  // effect runs AFTER the commit, which is exactly the race this flag
  // exists to close.
  // eslint-disable-next-line react-hooks/immutability -- captureMode is a deliberate render-order signal (see captureMode.ts)
  captureMode.active = params.snap !== undefined;
  if (params.snap !== undefined) {
    // capture mode (?snap): the whole column rendered unscaled and
    // snapshotted IN-APP with Skia's makeImageFromView, written to the
    // app cache for adb pull (renders/MEASUREMENTS.md). Screen captures
    // were tried first and abandoned: stitched viewport bands carried
    // Expo Go's stuck bundle-progress pill (a fixed overlay in a separate
    // window — invisible over the dark skin, printed across any light
    // sheet that scrolled beneath it), and single frames caught transient
    // Skia surface artifacts. An in-app snapshot bypasses the compositor
    // and everything floating above the app.
    return <PlazaSnap windowWidth={width} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors["--bg"] }}>
      <StatusBar style="light" />
      <ScrollView>
        <PlazaBody windowWidth={width} topInset={insets.top} />
      </ScrollView>
    </View>
  );
}

/**
 * The snapshot host: renders the full column, waits for fonts/layout/Skia
 * to settle, then writes one full-height PNG of the column into the cache.
 * The Metro log carries `[snap] <path>` for the harness to pull.
 */
function PlazaSnap({ windowWidth }: { windowWidth: number }) {
  const columnRef = useRef<View>(null);
  const [status, setStatus] = useState("waiting");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // settle: font remount (~1s), layout, Skia first paint
      await new Promise((r) => setTimeout(r, 6000));
      try {
        const { makeImageFromView } = await import("@shopify/react-native-skia");
        const image = await makeImageFromView(columnRef);
        if (!image) throw new Error("makeImageFromView returned null");
        const base64 = image.encodeToBase64();
        // Expo Go is not debuggable on this build (run-as is refused), so
        // the PNG travels to the dev machine over the adb-reverse tunnel
        // instead of the app cache: the capture driver runs a one-file
        // HTTP receiver on port 9955.
        const resp = await fetch("http://localhost:9955/snap", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: base64,
        });
        if (!resp.ok) throw new Error(`receiver said ${resp.status}`);
        if (!cancelled) setStatus(`sent ${base64.length}b`);
        console.log(`[snap] sent ${base64.length} base64 bytes`);
      } catch (e) {
        if (!cancelled) setStatus(`error ${e}`);
        console.log(`[snap] failed: ${e}`);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [windowWidth]);

  return (
    <View style={{ flex: 1, backgroundColor: colors["--bg"], overflow: "hidden" }}>
      <StatusBar hidden />
      {/* collapsable={false}: Fabric prunes layout-only views from the
          native tree, and a pruned view has no tag for makeImageFromView
          ("Invalid view tag" — shipped here, caught on the first snap) */}
      <View ref={columnRef} collapsable={false}>
        <PlazaBody windowWidth={windowWidth} topInset={0} capture />
      </View>
      {/* visible confirmation for the capture driver */}
      <Text
      allowFontScaling={false}
      style={{ position: "absolute", bottom: 4, left: 4, fontSize: 9, color: "#444" }}>
        {status}
      </Text>
    </View>
  );
}
