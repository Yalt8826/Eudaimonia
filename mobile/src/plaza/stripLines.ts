// The strip lines selector (T1.6-lite, extended T2.2/T2.5): each strip's
// honest line, in one pure function the tests can pin. Fallbacks exist
// because a missing line is a PaperText crash on device (the habits
// strip's lines array is empty by design; the jest font-mock never
// reaches the split — caught live on the A059).
import type { PlazaStrip } from "./model";
import type { CoverageRow } from "../data/coverage";
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
    const lines = planToday.plan_lines.map((l) => `· ${l}`);
    const freshness =
      planToday.days_fresh_7 > 0
        ? `plan · fresh ${planToday.days_fresh_7} of 7`
        : `plan · 0 of 7 · ${planToday.status}`;
    return [freshness, ...lines];
  }
  return strip.lines;
}
