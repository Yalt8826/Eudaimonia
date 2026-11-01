// Today's Plan as a frosted glass card on the mint sheet: one row per time
// block (start · title), the current block tagged "now" (or the next one
// "next"), past blocks dimmed, and the weekly-target count. Each row is
// its own tap target and opens that block's task (TaskSheet); a row whose
// task has a running timer, a note for next time or open subtasks shows
// that on a hint line beneath it. The header's "details ›" opens the whole
// day (PlanSheet).
//
// All the text is drawn in ONE Skia canvas, not a PaperText per row: each
// <Canvas> is its own TextureView and the Plaza already pays ~0.5s for its
// thirteen, so seven rows as fourteen more would undo the load-time work.
// Skia also measures with the font it paints with (see ui.tsx PaperText),
// which is what the truncation below relies on. Transparent Pressables
// laid over the measured rows carry the taps.
import { Pressable, StyleSheet, View } from "react-native";
import { Canvas, Line, RoundedRect, Text as SkiaText, vec, type SkFont } from "@shopify/react-native-skia";

import { colors } from "../theme/tokens";
import { PLEX_MONO_400, PLEX_SANS_700, useSkiaFont } from "./skiaAssets";
import { blockPhases, truncateToWidth, type BlockPhase, type ParsedPlan } from "./planModel";

const INK = colors["--sheet-mint-ink"];
const PAPER = colors["--sheet-mint"];

const PAD_X = 14;
const PAD_Y = 12;
const HEADER_H = 20;
const ROW_H = 30;
const HINT_H = 16;
const FOOTER_H = 20;
const GAP = 6;
const TAG_H = 18;
const TAG_PAD = 7;

/** Secondary text (header, footer, time column, hints) — ink at 0.75 keeps
    >= 4.5 on the glass (contrast.test.ts). */
const SECONDARY = 0.75;
/** Past rows — the dimmest the ink may go and still clear 4.5. */
const PAST = 0.7;

export interface CardRow {
  time: string;
  title: string;
  phase: BlockPhase;
}

/** The card's rows: the time blocks, or — for a plan written without any —
    its targets, so the card is never empty over a live plan. */
export function cardRows(plan: ParsedPlan, now: Date): CardRow[] {
  if (plan.blocks.length === 0) {
    return plan.targets.map((t) => ({ time: "", title: t.name, phase: "later" as const }));
  }
  const phases = blockPhases(plan.blocks, now);
  return plan.blocks.map((b, i) => ({ time: b.startLabel, title: b.title, phase: phases[i] }));
}

/** Each row's top and height, given which rows carry a hint line. */
export function rowBoxes(hints: readonly (string | null)[]): { top: number; height: number }[] {
  let top = PAD_Y + HEADER_H + GAP;
  return hints.map((hint) => {
    const height = ROW_H + (hint ? HINT_H : 0);
    const box = { top, height };
    top += height;
    return box;
  });
}

export function cardHeight(hints: readonly (string | null)[], hasFooter: boolean): number {
  const rows = hints.reduce((h, hint) => h + ROW_H + (hint ? HINT_H : 0), 0);
  return PAD_Y * 2 + HEADER_H + GAP + rows + (hasFooter ? GAP + FOOTER_H : 0);
}

function baseline(font: SkFont, top: number, height: number): number {
  const m = font.getMetrics();
  return top + (height - (-m.ascent + m.descent)) / 2 - m.ascent;
}

export function PlanCard({
  plan,
  header,
  now,
  width,
  hints,
  onOpenDetails,
  onOpenRow,
}: {
  plan: ParsedPlan;
  /** e.g. "0 of 7 · alive" */
  header: string;
  now: Date;
  width: number;
  /** Per row: the task's hint line, or null. */
  hints: readonly (string | null)[];
  onOpenDetails: () => void;
  onOpenRow: (index: number) => void;
}) {
  const mono = useSkiaFont(PLEX_MONO_400, 12.5);
  const small = useSkiaFont(PLEX_MONO_400, 11.5);
  const sans = useSkiaFont(PLEX_SANS_700, 14);

  const rows = cardRows(plan, now);
  const rowHints = rows.map((_, i) => hints[i] ?? null);
  const boxes = rowBoxes(rowHints);
  const targetsCounted = plan.blocks.length > 0 ? plan.targets.length : 0;
  const footer =
    targetsCounted > 0 ? `+ ${targetsCounted} weekly target${targetsCounted === 1 ? "" : "s"}` : null;
  const height = cardHeight(rowHints, footer !== null);

  const ready = mono !== null && small !== null && sans !== null && width > 0;

  return (
    <View style={[styles.glass, { height }]}>
      <View style={styles.sheen} pointerEvents="none" />
      {ready ? (
        <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
          {drawCard({ rows, hints: rowHints, boxes, header, footer, width, mono, small, sans })}
        </Canvas>
      ) : null}
      {/* the header row: the whole day's plan */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Today's plan details, ${header}`}
        onPress={onOpenDetails}
        style={({ pressed }) => [styles.hit, { top: 0, height: PAD_Y + HEADER_H + GAP / 2 }, pressed && styles.pressed]}
      />
      {rows.map((row, i) => (
        <Pressable
          key={i}
          accessibilityRole="button"
          accessibilityLabel={
            `${row.time ? `${row.time} ` : ""}${row.title}` +
            (row.phase === "now" ? ", now" : row.phase === "past" ? ", done" : "") +
            (rowHints[i] ? `, ${rowHints[i]}` : "")
          }
          accessibilityHint="Opens this task's notes and timer"
          onPress={() => onOpenRow(i)}
          style={({ pressed }) => [styles.hit, { top: boxes[i].top, height: boxes[i].height }, pressed && styles.pressed]}
        />
      ))}
      {footer ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${footer}, opens the plan details`}
          onPress={onOpenDetails}
          style={({ pressed }) => [styles.hit, { bottom: 0, height: PAD_Y + FOOTER_H + GAP }, pressed && styles.pressed]}
        />
      ) : null}
    </View>
  );
}

function drawCard({
  rows,
  hints,
  boxes,
  header,
  footer,
  width,
  mono,
  small,
  sans,
}: {
  rows: CardRow[];
  hints: (string | null)[];
  boxes: { top: number; height: number }[];
  header: string;
  footer: string | null;
  width: number;
  mono: SkFont;
  small: SkFont;
  sans: SkFont;
}) {
  const inner = width - PAD_X * 2;
  const nodes: React.ReactNode[] = [];

  // header: freshness on the left, "details" + a chevron on the right
  const detailsText = "details";
  const detailsW = small.measureText(detailsText).width;
  const chevronX = width - PAD_X - 5;
  const headerY = baseline(small, PAD_Y, HEADER_H);
  nodes.push(
    <SkiaText
      key="h"
      x={PAD_X}
      y={headerY}
      text={truncateToWidth(header, inner - detailsW - 24, (s) => small.measureText(s).width)}
      font={small}
      color={INK}
      opacity={SECONDARY}
    />,
    <SkiaText key="d" x={chevronX - 7 - detailsW} y={headerY} text={detailsText} font={small} color={INK} opacity={SECONDARY} />,
    <Line key="c1" p1={vec(chevronX, PAD_Y + 6)} p2={vec(chevronX + 4, PAD_Y + 10)} color={INK} strokeWidth={1.5} opacity={SECONDARY} />,
    <Line key="c2" p1={vec(chevronX + 4, PAD_Y + 10)} p2={vec(chevronX, PAD_Y + 14)} color={INK} strokeWidth={1.5} opacity={SECONDARY} />,
  );

  // the time column is as wide as its widest label, so titles line up
  const timeW = Math.max(0, ...rows.map((r) => (r.time ? mono.measureText(r.time).width : 0)));
  const titleX = PAD_X + (timeW > 0 ? timeW + 12 : 0);

  rows.forEach((row, i) => {
    const { top, height } = boxes[i];
    const dim = row.phase === "past" ? PAST : 1;
    const tag = row.phase === "now" ? "now" : row.phase === "next" ? "next" : null;
    const tagW = tag ? small.measureText(tag).width + TAG_PAD * 2 : 0;
    const titleMax = width - PAD_X - titleX - (tag ? tagW + 8 : 0);

    if (row.phase === "now") {
      // the current row sits on a slightly brighter band of the same glass
      nodes.push(
        <RoundedRect key={`b${i}`} x={PAD_X - 6} y={top + 2} width={inner + 12} height={height - 4} r={8} color={colors["--paper-glass-fill"]} />,
      );
    }
    if (row.time) {
      nodes.push(
        <SkiaText key={`t${i}`} x={PAD_X} y={baseline(mono, top, ROW_H)} text={row.time} font={mono} color={INK} opacity={row.phase === "past" ? PAST : SECONDARY} />,
      );
    }
    nodes.push(
      <SkiaText
        key={`n${i}`}
        x={titleX}
        y={baseline(sans, top, ROW_H)}
        text={truncateToWidth(row.title, titleMax, (s) => sans.measureText(s).width)}
        font={sans}
        color={INK}
        opacity={dim}
      />,
    );
    const hint = hints[i];
    if (hint) {
      nodes.push(
        <SkiaText
          key={`h${i}`}
          x={titleX}
          y={baseline(small, top + ROW_H - 7, HINT_H)}
          text={truncateToWidth(hint, width - PAD_X - titleX, (s) => small.measureText(s).width)}
          font={small}
          color={INK}
          opacity={row.phase === "past" ? PAST : SECONDARY}
        />,
      );
    }
    if (tag) {
      const tagX = width - PAD_X - tagW;
      const tagY = top + (ROW_H - TAG_H) / 2;
      const filled = tag === "now";
      nodes.push(
        <RoundedRect
          key={`g${i}`}
          x={tagX}
          y={tagY}
          width={tagW}
          height={TAG_H}
          r={TAG_H / 2}
          color={INK}
          style={filled ? "fill" : "stroke"}
          strokeWidth={1}
        />,
        <SkiaText key={`gt${i}`} x={tagX + TAG_PAD} y={baseline(small, tagY, TAG_H)} text={tag} font={small} color={filled ? PAPER : INK} />,
      );
    }
  });

  if (footer) {
    const last = boxes[boxes.length - 1];
    const top = (last ? last.top + last.height : PAD_Y + HEADER_H + GAP) + GAP;
    nodes.push(
      <SkiaText key="f" x={PAD_X} y={baseline(small, top, FOOTER_H)} text={footer} font={small} color={INK} opacity={SECONDARY} />,
    );
  }
  return nodes;
}

const styles = StyleSheet.create({
  glass: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors["--paper-glass-border"],
    backgroundColor: colors["--paper-glass-fill"],
    overflow: "hidden",
  },
  // a faint lit top edge, so the pane reads as glass rather than a flat
  // lighter rectangle
  sheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "45%",
    backgroundColor: colors["--paper-glass-fill"],
    opacity: 0.35,
  },
  hit: {
    position: "absolute",
    left: 0,
    right: 0,
  },
  // the pressed row lights up with one more layer of the same frost
  pressed: {
    backgroundColor: colors["--paper-glass-fill"],
  },
});
