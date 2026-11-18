// Today's Plan as structure: the Week Plan.md table rows the server sends
// verbatim (plan_lines), split into the day's time blocks and the week's
// targets, plus where "now" falls among the blocks. Pure, so the glass card
// and the detail sheet agree on every row and the tests can pin both.
import { planCells } from "./stripLines";

export interface PlanBlock {
  /** The row's time cell as written, e.g. "11:15pm–12:30am". */
  time: string;
  /** Short start label for the card's time column, e.g. "11:15". */
  startLabel: string;
  title: string;
  /** The remaining cells, joined. */
  notes: string;
  /** Minutes on the plan's day; past midnight runs on past 1440. */
  start: number;
  end: number;
  /** The line's stable routine_key (T1.3's extractor slug), or undefined
      when the revision predates keys or the row has no stable name —
      undefined is NOT tickable. Never derived here: keys come from the
      server's plan_keys list, index-aligned with plan_lines. */
  key?: string;
}

export interface PlanTarget {
  name: string;
  details: string[];
  /** Same rule as PlanBlock.key — targets are not tickable in T2.7, but
      the mapping stays total so a target row can become one later. */
  key?: string;
}

export interface ParsedPlan {
  blocks: PlanBlock[];
  targets: PlanTarget[];
}

export type BlockPhase = "past" | "now" | "next" | "later";

/** Before 4am still counts as the previous plan day: the 11:15pm–12:30am
    flex slot is "now" at 12:10am, not a block from yesterday. */
export const DAY_ROLLOVER_MIN = 4 * 60;

const RANGE =
  /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[–-]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i;

function toMinutes(hour: number, minute: number, suffix: string): number {
  return (hour % 12) * 60 + (suffix.toLowerCase() === "pm" ? 720 : 0) + minute;
}

/**
 * "3:00–3:45pm" → {start: 900, end: 945}. A start without its own am/pm
 * borrows the end's, unless that would put it after the end ("11–1pm" is
 * 11am). Times before the rollover move past midnight, and an end at or
 * before its start crosses midnight, so ranges always run forward.
 */
export function parseTimeRange(cell: string): { start: number; end: number } | null {
  const m = RANGE.exec(cell.trim());
  if (m === null) return null;
  const endSuffix = m[6];
  let end = toMinutes(Number(m[4]), Number(m[5] ?? 0), endSuffix);
  let start: number;
  if (m[3] !== undefined) {
    start = toMinutes(Number(m[1]), Number(m[2] ?? 0), m[3]);
  } else {
    start = toMinutes(Number(m[1]), Number(m[2] ?? 0), endSuffix);
    if (start > end) {
      start = toMinutes(Number(m[1]), Number(m[2] ?? 0), endSuffix.toLowerCase() === "am" ? "pm" : "am");
    }
  }
  if (start < DAY_ROLLOVER_MIN) start += 1440;
  if (end <= start) end += 1440;
  return { start, end };
}

export function startLabel(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const mm = String(minutes % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${mm}`;
}

export function parsePlan(
  planLines: readonly string[],
  planKeys: readonly string[] = [],
): ParsedPlan {
  const blocks: PlanBlock[] = [];
  const targets: PlanTarget[] = [];
  for (const [i, line] of planLines.entries()) {
    // keys are index-aligned with the raw lines (blocks and targets share
    // one list server-side), so the mapping survives the split below
    const key = planKeys[i] !== undefined && planKeys[i] !== "" ? planKeys[i] : undefined;
    const cells = planCells(line);
    if (cells.length === 0) continue;
    const range = parseTimeRange(cells[0]);
    if (range !== null) {
      blocks.push({
        time: cells[0],
        startLabel: startLabel(range.start),
        title: cells[1] ?? "",
        notes: cells.slice(2).join(" · "),
        key,
        ...range,
      });
    } else {
      targets.push({ name: cells[0], details: cells.slice(1), key });
    }
  }
  return { blocks, targets };
}

/** Minutes on the plan day for a wall-clock time (see DAY_ROLLOVER_MIN). */
export function planMinutes(now: Date): number {
  const t = now.getHours() * 60 + now.getMinutes();
  return t < DAY_ROLLOVER_MIN ? t + 1440 : t;
}

/**
 * Each block's phase at `now`. Exactly one block can be "now"; when none
 * is (a gap between blocks, or before the first), the first upcoming one
 * is "next" so the card still says where the day goes from here.
 */
export function blockPhases(blocks: readonly PlanBlock[], now: Date): BlockPhase[] {
  const t = planMinutes(now);
  const phases: BlockPhase[] = blocks.map((b) =>
    b.end <= t ? "past" : b.start <= t ? "now" : "later",
  );
  if (!phases.includes("now")) {
    const next = phases.indexOf("later");
    if (next !== -1) phases[next] = "next";
  }
  return phases;
}

/** "week of 31 Aug" from the plan's ISO week start. */
export function weekOfLabel(weekStart: string | undefined): string | null {
  if (weekStart === undefined) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart);
  if (m === null) return null;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `week of ${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

/** Cut a line to `maxWidth` with an ellipsis, measured by the font that draws it. */
export function truncateToWidth(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string {
  if (measure(text) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${text.slice(0, mid).trimEnd()}…`) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

/**
 * The task a block belongs to — its notes thread. A block that names one
 * of the week's targets is that target ("GRE deep work (~3h)" → "GRE"),
 * longest name first so "Deep Learning" wins over a shorter overlap;
 * anything else is its title without the "(~3h)" duration.
 */
export function subjectOf(title: string, targetNames: readonly string[]): string {
  const lower = title.toLowerCase();
  const byLength = [...targetNames].sort((a, b) => b.length - a.length);
  for (const name of byLength) {
    const escaped = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(lower)) return name;
  }
  return title.replace(/\s*\([^)]*\)\s*/g, " ").trim() || title;
}

export function subjectKey(subject: string): string {
  return subject.split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}
