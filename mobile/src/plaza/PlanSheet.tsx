// The plan's detail sheet: slides up over the Plaza when the glass card is
// tapped. Every time block with its notes (the current one marked, past
// ones muted), the week's targets, and which week the plan is for.
// Closed by dragging it down, tapping the dimmed Plaza, or Android back.
//
// Glass on the matte skin: --bg under --glass-fill, the surface the
// contrast suite measures (text 14.88, muted 6.17, teal 9.38). Past blocks
// switch to --muted rather than fading, so they never fall under 4.5.
//
// Each section's text is ONE Skia canvas (measured with the font that
// paints it — see ui.tsx PaperText — and one TextureView per section, not
// per line).
import { useEffect } from "react";
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Canvas, Rect, RoundedRect, Text as SkiaText, type SkFont } from "@shopify/react-native-skia";

import { colors } from "../theme/tokens";
import { MOTION } from "../theme/motion";
import { PLEX_MONO_400, PLEX_SANS_700, useSkiaFont } from "./skiaAssets";
import { wrapToWidth } from "./ui";
import { blockPhases, type BlockPhase, type ParsedPlan } from "./planModel";

const PAD_X = 20;
const SHEET_RADIUS = 24;
/** Drag past this, or flick faster than DISMISS_VELOCITY, and it closes. */
const DISMISS_DRAG = 110;
const DISMISS_VELOCITY = 900;

type Op =
  | { kind: "text"; text: string; x: number; y: number; font: SkFont; color: string }
  | { kind: "rect"; x: number; y: number; w: number; h: number; r: number; color: string };

function Ops({ ops, height }: { ops: Op[]; height: number }) {
  return (
    <Canvas pointerEvents="none" style={{ height }}>
      {ops.map((op, i) =>
        op.kind === "text" ? (
          <SkiaText key={i} x={op.x} y={op.y} text={op.text} font={op.font} color={op.color} />
        ) : op.r > 0 ? (
          <RoundedRect key={i} x={op.x} y={op.y} width={op.w} height={op.h} r={op.r} color={op.color} />
        ) : (
          <Rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} color={op.color} />
        ),
      )}
    </Canvas>
  );
}

/** A small text-layout cursor: wraps each paragraph against the font that
    draws it and advances y by its line height. */
class Cursor {
  ops: Op[] = [];
  y = 0;
  constructor(private width: number) {}
  para(text: string, font: SkFont, color: string, lineHeight: number, x = 0) {
    const m = font.getMetrics();
    for (const line of wrapToWidth(text, this.width - x, (s) => font.measureText(s).width)) {
      const baseline = this.y + (lineHeight - (-m.ascent + m.descent)) / 2 - m.ascent;
      this.ops.push({ kind: "text", text: line, x, y: baseline, font, color });
      this.y += lineHeight;
    }
  }
  gap(px: number) {
    this.y += px;
  }
}

interface Fonts {
  title: SkFont;
  head: SkFont;
  mono: SkFont;
  small: SkFont;
}

function layoutBlocks(plan: ParsedPlan, phases: BlockPhase[], width: number, f: Fonts) {
  const c = new Cursor(width);
  const BAR = 3;
  const INDENT = 14;
  plan.blocks.forEach((b, i) => {
    const phase = phases[i];
    const past = phase === "past";
    const start = c.ops.length;
    const top = c.y;
    c.gap(8);
    const timeTop = c.y;
    c.para(b.time, f.mono, past ? colors["--muted"] : colors["--text"], 18, INDENT);
    const tag = phase === "now" ? "now" : phase === "next" ? "next" : past ? "done" : null;
    if (tag) {
      const w = f.small.measureText(tag).width;
      const m = f.small.getMetrics();
      c.ops.push({
        kind: "text",
        text: tag,
        x: width - INDENT - w,
        y: timeTop + (18 - (-m.ascent + m.descent)) / 2 - m.ascent,
        font: f.small,
        color: phase === "now" || phase === "next" ? colors["--accent-1"] : colors["--muted"],
      });
    }
    if (b.title) c.para(b.title, f.head, past ? colors["--muted"] : colors["--text"], 22, INDENT);
    if (b.notes) c.para(b.notes, f.mono, colors["--muted"], 18, INDENT);
    c.gap(8);
    if (phase === "now") {
      // drawn under the block's text: a brighter pane and a teal edge
      c.ops.splice(
        start,
        0,
        { kind: "rect", x: 0, y: top, w: width, h: c.y - top, r: 12, color: colors["--glass-fill"] },
        { kind: "rect", x: 0, y: top + 8, w: BAR, h: c.y - top - 16, r: 0, color: colors["--accent-1"] },
      );
    }
    c.gap(4);
  });
  return c;
}

function layoutTargets(plan: ParsedPlan, width: number, f: Fonts) {
  const c = new Cursor(width);
  plan.targets.forEach((t, i) => {
    if (i > 0) c.gap(12);
    c.para(t.name, f.head, colors["--text"], 22);
    for (const d of t.details) c.para(d, f.mono, colors["--muted"], 18);
  });
  return c;
}

export function PlanSheet({
  open,
  onClose,
  plan,
  subtitle,
  now,
}: {
  open: boolean;
  onClose: () => void;
  plan: ParsedPlan;
  /** e.g. "week of 31 Aug · fresh 0 of 7 · alive" */
  subtitle: string;
  now: Date;
}) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(windowHeight);
  const backdrop = useSharedValue(0);

  const title = useSkiaFont(PLEX_SANS_700, 20);
  const head = useSkiaFont(PLEX_SANS_700, 15);
  const mono = useSkiaFont(PLEX_MONO_400, 12.5);
  const small = useSkiaFont(PLEX_MONO_400, 11.5);

  const ms = reduceMotion ? 0 : MOTION.stateChangeMs;

  useEffect(() => {
    if (open) {
      offset.set(windowHeight);
      offset.set(withTiming(0, { duration: ms }));
      backdrop.set(withTiming(1, { duration: ms }));
    }
  }, [open, ms, windowHeight, offset, backdrop]);

  // the sheet stays mounted while it slides out: the parent's `open`
  // only drops once the travel is over
  const close = () => {
    offset.set(withTiming(windowHeight, { duration: ms }));
    backdrop.set(withTiming(0, { duration: ms }));
    setTimeout(onClose, ms);
  };

  // JS-thread callbacks: the drag only moves the sheet, and the decision to
  // close is plain JS (no worklet hop needed for a two-number comparison)
  const drag = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(8)
    .onUpdate((e) => {
      offset.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DRAG || e.velocityY > DISMISS_VELOCITY) close();
      else offset.set(withTiming(0, { duration: ms }));
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));

  if (!open) return null;

  const width = windowWidth - PAD_X * 2;
  const fonts = title && head && mono && small ? { title, head, mono, small } : null;
  const phases = blockPhases(plan.blocks, now);
  const blocks = fonts ? layoutBlocks(plan, phases, width, fonts) : null;
  const targets = fonts && plan.targets.length > 0 ? layoutTargets(plan, width, fonts) : null;

  let header: { ops: Op[]; height: number } | null = null;
  let targetsHead: { ops: Op[]; height: number } | null = null;
  if (fonts) {
    const h = new Cursor(width);
    h.para("Today's Plan", fonts.title, colors["--text"], 28);
    h.para(subtitle, fonts.small, colors["--muted"], 18);
    header = { ops: h.ops, height: h.y };
    const t = new Cursor(width);
    t.para("WEEKLY TARGETS", fonts.small, colors["--muted"], 18);
    targetsHead = { ops: t.ops, height: t.y };
  }

  const a11y = [
    `Today's plan, ${subtitle}.`,
    ...plan.blocks.map((b, i) => `${b.time}, ${b.title}${b.notes ? `, ${b.notes}` : ""}${phases[i] === "now" ? ", now" : phases[i] === "past" ? ", done" : ""}.`),
    ...(plan.targets.length > 0 ? ["Weekly targets."] : []),
    ...plan.targets.map((t) => `${t.name}: ${t.details.join(", ")}.`),
  ];

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable accessibilityLabel="Close the plan" onPress={close} style={{ flex: 1 }} />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, { maxHeight: windowHeight * 0.82, paddingBottom: insets.bottom + 12 }, sheetStyle]}
        >
          <View style={styles.fill} pointerEvents="none" />
          <GestureDetector gesture={drag}>
            <View accessible accessibilityRole="header" accessibilityLabel={a11y[0]} style={styles.handleArea}>
              <View style={styles.grabber} />
              {header ? <Ops ops={header.ops} height={header.height} /> : <View style={{ height: 46 }} />}
            </View>
          </GestureDetector>
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View accessible accessibilityLabel={a11y.slice(1, plan.blocks.length + 1).join(" ")}>
              {blocks ? <Ops ops={blocks.ops} height={blocks.y} /> : null}
            </View>
            {targets && targetsHead ? (
              <View accessible accessibilityLabel={a11y.slice(plan.blocks.length + 1).join(" ")} style={styles.targets}>
                <View style={styles.rule} />
                <Ops ops={targetsHead.ops} height={targetsHead.height} />
                <View style={{ height: 8 }} />
                <Ops ops={targets.ops} height={targets.y} />
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: colors["--scrim"],
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors["--bg"],
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors["--glass-border"],
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors["--glass-fill"],
  },
  handleArea: {
    paddingHorizontal: PAD_X,
    paddingTop: 10,
    paddingBottom: 12,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors["--muted"],
    marginBottom: 14,
  },
  body: {
    paddingHorizontal: PAD_X,
    paddingBottom: 12,
  },
  targets: {
    marginTop: 12,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors["--glass-border"],
    marginBottom: 14,
  },
});
