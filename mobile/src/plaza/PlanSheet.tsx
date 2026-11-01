// The whole day's plan (the card's "details ›"): every time block with its
// notes (the current one marked, past ones muted), the week's targets, and
// which week the plan is for. Tapping a block or a target opens its task.
//
// Past blocks switch to --muted rather than fading, so they never fall
// under 4.5 (text 14.88, muted 6.17, teal 9.38 on this glass).
//
// Each section's text is ONE Skia canvas (measured with the font that
// paints it — see ui.tsx PaperText — and one TextureView per section, not
// per line); transparent Pressables over each block's measured box make
// the rows tappable.
import { Pressable, View, useWindowDimensions } from "react-native";
import { Canvas, Rect, RoundedRect, Text as SkiaText, type SkFont } from "@shopify/react-native-skia";

import { colors } from "../theme/tokens";
import { PLEX_MONO_400, PLEX_SANS_700, useSkiaFont } from "./skiaAssets";
import { wrapToWidth } from "./ui";
import { BottomSheet, SHEET_PAD_X } from "./BottomSheet";
import { blockPhases, type BlockPhase, type ParsedPlan } from "./planModel";

type Op =
  | { kind: "text"; text: string; x: number; y: number; font: SkFont; color: string }
  | { kind: "rect"; x: number; y: number; w: number; h: number; r: number; color: string };

export function Ops({ ops, height }: { ops: Op[]; height: number }) {
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
export class Cursor {
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
  /** A single line pinned to the right edge, on the row starting at `top`. */
  right(text: string, font: SkFont, color: string, top: number, lineHeight: number, inset = 0) {
    const m = font.getMetrics();
    this.ops.push({
      kind: "text",
      text,
      x: this.width - inset - font.measureText(text).width,
      y: top + (lineHeight - (-m.ascent + m.descent)) / 2 - m.ascent,
      font,
      color,
    });
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

interface Box {
  top: number;
  height: number;
}

function layoutBlocks(plan: ParsedPlan, phases: BlockPhase[], width: number, f: Fonts) {
  const c = new Cursor(width);
  const boxes: Box[] = [];
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
      const tone = phase === "now" || phase === "next" ? colors["--accent-1"] : colors["--muted"];
      c.right(tag, f.small, tone, timeTop, 18, INDENT);
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
    boxes.push({ top, height: c.y - top });
    c.gap(4);
  });
  return { c, boxes };
}

function layoutTargets(plan: ParsedPlan, width: number, f: Fonts) {
  const c = new Cursor(width);
  const boxes: Box[] = [];
  plan.targets.forEach((t) => {
    const top = c.y;
    c.gap(6);
    c.para(t.name, f.head, colors["--text"], 22);
    for (const d of t.details) c.para(d, f.mono, colors["--muted"], 18);
    c.gap(6);
    boxes.push({ top, height: c.y - top });
  });
  return { c, boxes };
}

/** Transparent tap targets laid over a canvas's measured boxes. */
function Hits({
  boxes,
  labels,
  onPress,
}: {
  boxes: Box[];
  labels: string[];
  onPress: (i: number) => void;
}) {
  return (
    <>
      {boxes.map((box, i) => (
        <Pressable
          key={i}
          accessibilityRole="button"
          accessibilityLabel={labels[i]}
          accessibilityHint="Opens this task's notes and timer"
          onPress={() => onPress(i)}
          style={({ pressed }) => ({
            position: "absolute",
            left: 0,
            right: 0,
            top: box.top,
            height: box.height,
            borderRadius: 12,
            backgroundColor: pressed ? colors["--glass-fill"] : "transparent",
          })}
        />
      ))}
    </>
  );
}

export function PlanSheet({
  open,
  onClose,
  plan,
  subtitle,
  now,
  onOpenBlock,
  onOpenTarget,
}: {
  open: boolean;
  onClose: () => void;
  plan: ParsedPlan;
  /** e.g. "week of 31 Aug · fresh 0 of 7 · alive" */
  subtitle: string;
  now: Date;
  onOpenBlock: (index: number) => void;
  onOpenTarget: (index: number) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const title = useSkiaFont(PLEX_SANS_700, 20);
  const head = useSkiaFont(PLEX_SANS_700, 15);
  const mono = useSkiaFont(PLEX_MONO_400, 12.5);
  const small = useSkiaFont(PLEX_MONO_400, 11.5);

  const width = windowWidth - SHEET_PAD_X * 2;
  const fonts = title && head && mono && small ? { title, head, mono, small } : null;
  const phases = blockPhases(plan.blocks, now);

  let header = <View style={{ height: 46 }} />;
  let body = null;
  if (fonts) {
    const h = new Cursor(width);
    h.para("Today's Plan", fonts.title, colors["--text"], 28);
    h.para(subtitle, fonts.small, colors["--muted"], 18);
    header = (
      <View accessible accessibilityRole="header" accessibilityLabel={`Today's plan, ${subtitle}`}>
        <Ops ops={h.ops} height={h.y} />
      </View>
    );
    const blocks = layoutBlocks(plan, phases, width, fonts);
    const targets = plan.targets.length > 0 ? layoutTargets(plan, width, fonts) : null;
    const th = new Cursor(width);
    th.para("WEEKLY TARGETS", fonts.small, colors["--muted"], 18);
    body = (
      <>
        <View>
          <Ops ops={blocks.c.ops} height={blocks.c.y} />
          <Hits
            boxes={blocks.boxes}
            labels={plan.blocks.map(
              (b, i) =>
                `${b.time}, ${b.title}${b.notes ? `, ${b.notes}` : ""}` +
                (phases[i] === "now" ? ", now" : phases[i] === "past" ? ", done" : ""),
            )}
            onPress={onOpenBlock}
          />
        </View>
        {targets ? (
          <View style={{ marginTop: 12 }}>
            <View style={{ height: 1, backgroundColor: colors["--glass-border"], marginBottom: 14 }} />
            <Ops ops={th.ops} height={th.y} />
            <View style={{ height: 4 }} />
            <View>
              <Ops ops={targets.c.ops} height={targets.c.y} />
              <Hits
                boxes={targets.boxes}
                labels={plan.targets.map((t) => `${t.name}: ${t.details.join(", ")}`)}
                onPress={onOpenTarget}
              />
            </View>
          </View>
        ) : null}
      </>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} closeLabel="Close the plan" header={header}>
      {() => body}
    </BottomSheet>
  );
}
