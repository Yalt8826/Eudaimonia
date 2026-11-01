// The strip lines selector (T1.6-lite, extended T2.2/T2.5): each strip's
// honest line, in one pure function the tests can pin. Fallbacks exist
// because a missing line is a PaperText crash on device (the habits
// strip's lines array is empty by design; the jest font-mock never
// reaches the split — caught live on the A059).
import type { PlazaStrip } from "./model";
import type { PlanToday } from "../data/plan";

interface LinesInput {
  waitingLine: string;
  coverageLines: Record<string, string>;
  planToday: PlanToday | null;
}

export function stripLinesFor(
  strip: PlazaStrip,
  input: LinesInput,
): string[] {
  const { waitingLine, coverageLines, planToday } = input;
  if (strip.id === "waiting") return [waitingLine];
  if (strip.id === "habits")
    return [coverageLines["day-report"] ?? "day report · not yet instrumented"];
  if (strip.id === "plan") {
    if (planToday === null) return strip.lines; // not fetched yet
    if (planToday.plan === "missing") return ["plan · missing (P1 rolling files keep no history)"];
    return [`plan · ${planFreshness(planToday)}`, ...planStripLines(planToday.plan_lines)];
  }
  return strip.lines;
}

/** "fresh 1 of 7", or "0 of 7 · alive" when no day this week was fresh. */
export function planFreshness(planToday: PlanToday): string {
  return planToday.days_fresh_7 > 0
    ? `fresh ${planToday.days_fresh_7} of 7`
    : `0 of 7 · ${planToday.status}`;
}

// A time-block row's first cell: "3:00–3:45pm", "11:15pm–12:30am", "9–10am".
const TIME_RANGE = /^\d{1,2}(:\d{2})?\s*(am|pm)?\s*[–-]\s*\d{1,2}(:\d{2})?\s*(am|pm)/i;

/** A week-plan table row as plain cells: pipes split, markdown emphasis
    dropped (the server sends the file's lines verbatim, and the strip
    showed literal **asterisks** and | dividers). */
export function planCells(line: string): string[] {
  return line
    .split("|")
    .map((cell) => cell.replace(/\*\*?|__/g, "").trim())
    .filter((cell) => cell !== "");
}

/**
 * Today's strip is the day's time blocks ("3:00–3:45pm — dMAT (45m)");
 * the weekly-targets rows collapse into one count line, so the strip is a
 * glance rather than the whole file. A plan with no time blocks at all
 * shows every row, cleaned — never an empty strip over a live plan.
 */
export function planStripLines(planLines: readonly string[]): string[] {
  const rows = planLines.map(planCells).filter((cells) => cells.length > 0);
  const blocks = rows.filter((cells) => TIME_RANGE.test(cells[0]));
  if (blocks.length === 0) return rows.map((cells) => `· ${cells.join(" · ")}`);
  const lines = blocks.map(([time, block]) => (block ? `· ${time} — ${block}` : `· ${time}`));
  const rest = rows.length - blocks.length;
  if (rest > 0) lines.push(`+ ${rest} weekly target${rest === 1 ? "" : "s"}`);
  return lines;
}
