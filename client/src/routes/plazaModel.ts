import type { TornRule, TornSheetTint } from "../components/TornSheet";

// The Plaza's strip model — the shape T1.6's coverage-view feed will fill.
// Until the P1 adapters land (T1.2–T1.5), every strip renders its TRUE state:
// uninstrumented, with an honest coverage line. Nothing here fabricates
// counts (law 7: missing days are data, never zeros; 09 §2#1 fifth state).

export type StripState = "uninstrumented" | "alive" | "dead" | "paused" | "behavioral-dormant";

export interface PlazaStrip {
  id: string;
  title: string;
  tint: TornSheetTint;
  rule?: TornRule;
  /** Where the chevron leads (the section's real route). */
  to: string;
  state: StripState;
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
    tint: "mint",
    rule: "accent-1",
    to: "/routine",
    state: "uninstrumented",
    lines: ["not yet instrumented · week-plan adapter lands in P1"],
  },
  {
    id: "waiting",
    title: "Waiting On",
    tint: "sky",
    to: "/inbox",
    state: "uninstrumented",
    lines: ["not yet instrumented · loops arrive with P2 writes"],
  },
  {
    id: "habits",
    title: "Habits",
    tint: "blush",
    to: "/meals",
    state: "uninstrumented",
    lines: [], // the nutrition/reading rows carry the honest state themselves
    wakeChip: true,
  },
  {
    id: "yesterday",
    title: "Yesterday",
    tint: "butter",
    to: "/timeline",
    state: "uninstrumented",
    lines: ["not yet instrumented · day-report adapter lands in P1"],
  },
  {
    id: "agents",
    title: "Agents",
    tint: "violet",
    rule: "accent-2",
    to: "/agents",
    state: "uninstrumented",
    lines: ["no agents instrumented yet · invocation feed arrives in P4"],
  },
];
