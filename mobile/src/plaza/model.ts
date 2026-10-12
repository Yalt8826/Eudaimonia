// The Plaza's strip model, ported from client/src/routes/plazaModel.ts at
// M2. The shape T1.6's coverage-view feed will fill. Until the P1 adapters
// land (T1.2–T1.5), every strip renders its TRUE state: uninstrumented,
// with an honest coverage line. Nothing here fabricates counts (law 7:
// missing days are data, never zeros; 09 §2#1 fifth state).

import type { ColorToken } from "../theme/tokens";

/** The five section papers (spec §2.1). Tint is section identity, for life. */
export type PaperVariant = "mint" | "sky" | "blush" | "butter" | "lavender";

/** The authored tear contours. Three, so no two sheets share a silhouette. */
export type TearVariant = "a" | "b" | "c";

/**
 * The hue law (01 §4): teal marks where YOU act, plum where AGENTS act.
 * Optional, and most sheets go without — an accent on every section is
 * decoration, not a signal.
 */
export type SectionAccent = "accent-1" | "accent-2";

export interface PlazaStrip {
  id: string;
  title: string;
  /** The sheet's paper. Section identity for life (tint-as-taxonomy). */
  variant: PaperVariant;
  /**
   * Which authored contour this sheet tears with, and how far into the
   * tiled strip it starts. Three contours cover five sheets, so two of
   * them repeat a silhouette — the offset is what keeps those two from
   * showing the same lobes in the same places (spec §2.2).
   */
  tear: TearVariant;
  tearOffset?: number;
  /**
   * The hue-law accent (01 §4): teal where you act, plum where agents
   * act. Only two sections carry one; an accent on every sheet signals
   * nothing.
   */
  accent?: SectionAccent;
  /** Where the chevron leads (the section's real route). */
  to: string;
  state: "uninstrumented";
  /** Honest status lines, mono muted under the section heading. */
  lines: string[];
  /** Extra row rendered inside the sheet (e.g. the wake deep-link chip). */
  wakeChip?: boolean;
}

// Sources and their true instrumentation status on 2026-10-10: the four P1
// adapters (day-report, week-plan, tasklist, kanban) land in this phase;
// wake/nutrition/reading are P2/P3; the agent invocation feed is P4.
export const PLAZA_STRIPS: readonly PlazaStrip[] = [
  {
    id: "plan",
    title: "Today's Plan",
    variant: "mint",
    tear: "a",
    accent: "accent-1",
    to: "/routine",
    state: "uninstrumented",
    lines: ["not yet instrumented · week-plan adapter lands in P1"],
  },
  {
    id: "waiting",
    title: "Waiting On",
    variant: "sky",
    tear: "b",
    to: "/inbox",
    state: "uninstrumented",
    lines: ["not yet instrumented · loops arrive with P2 writes"],
  },
  {
    id: "habits",
    title: "Habits",
    variant: "blush",
    tear: "c",
    to: "/meals",
    state: "uninstrumented",
    lines: [], // the nutrition/reading rows carry the honest state themselves
    wakeChip: true,
  },
  {
    id: "yesterday",
    title: "Yesterday",
    variant: "butter",
    tear: "a",
    tearOffset: 260,
    to: "/timeline",
    state: "uninstrumented",
    lines: ["not yet instrumented · day-report adapter lands in P1"],
  },
  {
    id: "agents",
    title: "Agents",
    variant: "lavender",
    tear: "b",
    tearOffset: 420,
    accent: "accent-2",
    to: "/agents",
    state: "uninstrumented",
    lines: ["no agents instrumented yet · invocation feed arrives in P4"],
  },
];

// ---- the tear geometry ---------------------------------------------------
// Three replaceable assets per contour (torn-paper.css §2.3): the contour
// gives the shape, the fringe gives the depth, the metrics give the reach.
// They are a PAIR per tear — generated from one contour array in one run
// (author_tears.py) — and only align as such. The Skia port keeps that
// pairing: TornSheet takes a TearVariant and swaps contour AND fringe
// together, never one without the other.

/** The paper + ink token pair per section tint (theme.css, measured). */
export const PAPER_OF: Readonly<
  Record<PaperVariant, { paper: ColorToken; ink: ColorToken }>
> = {
  mint: { paper: "--sheet-mint", ink: "--sheet-mint-ink" },
  sky: { paper: "--sheet-sky", ink: "--sheet-sky-ink" },
  blush: { paper: "--sheet-blush", ink: "--sheet-blush-ink" },
  butter: { paper: "--sheet-butter", ink: "--sheet-butter-ink" },
  lavender: { paper: "--sheet-lavender", ink: "--sheet-lavender-ink" },
};

/** The accent's PAINT token — always the -ink pair, never the raw accent
    (--accent-1 measures 1.22 on mint, --accent-2 1.59 on lavender). */
export const ACCENT_INK_OF: Readonly<Record<SectionAccent, ColorToken>> = {
  "accent-1": "--accent-1-ink",
  "accent-2": "--accent-2-ink",
};

/** Measured material reach per edge, CSS px — assets/tears/tear-metrics.json
    (author_tears.py measures the emitted PNGs). Text padding derives from
    it: reach + ~6px of breathing room, never below the reach (README #6:
    text clears the MATERIAL, not the contour). */
export const TEAR_REACH: Readonly<Record<TearVariant, { top: number; bottom: number }>> = {
  a: { top: 94.0, bottom: 84.5 },
  b: { top: 85.5, bottom: 93.0 },
  c: { top: 91.0, bottom: 89.5 },
};

/** Per-tear content padding — torn-paper.css --pad-top/--pad-bottom, one
    value per contour, NOT one for all three (a 100/91 · b 92/99 · c 97/96). */
export const TEAR_PADDING: Readonly<Record<TearVariant, { top: number; bottom: number }>> = {
  a: { top: 100, bottom: 91 },
  b: { top: 92, bottom: 99 },
  c: { top: 97, bottom: 96 },
};
