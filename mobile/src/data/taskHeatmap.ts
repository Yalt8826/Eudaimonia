// The task page's activity heatmap (GitHub-style): one column per week,
// one cell per day, intensity from the minutes worked that day. Pure —
// the sheet renders it, the tests pin it.
//
// Days are the DEVICE's local calendar day (the eater's-day rule: a
// session that started 11:40pm belongs to that evening, not to a UTC
// date). Columns run oldest → newest, each column a Sun..Sat week, the
// last column being the week containing `now`; future cells render as
// blanks the sheet can hide.
import type { TaskHistoryEntry } from "./tasks";

export interface HeatCell {
  /** Local YYYY-MM-DD. */
  day: string;
  /** The cell's date at local midnight. */
  date: Date;
  minutes: number;
  /** 0 = no activity · 1 = logged, no time · 2 = ≤30m · 3 = ≤90m · 4 = more */
  level: 0 | 1 | 2 | 3 | 4;
  entries: TaskHistoryEntry[];
  /** Beyond today — the sheet renders these as invisible spacers. */
  future: boolean;
}

export interface Heatmap {
  columns: HeatCell[][];
  /** The cell matching today, when the grid holds it. */
  today: HeatCell | null;
}

function dayKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function levelFor(minutes: number, hasEntries: boolean): HeatCell["level"] {
  if (!hasEntries) return 0;
  if (minutes <= 0) return 1; // a log with no minutes is still work that day
  if (minutes <= 30) return 2;
  if (minutes <= 90) return 3;
  return 4;
}

/** The last `weeks` weeks ending with the week containing `now`. */
export function buildHeatmap(
  history: readonly TaskHistoryEntry[],
  now: Date,
  weeks: number = 18,
): Heatmap {
  // the Sunday starting the current week (local midnight)
  const thisSunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());

  const byDay = new Map<string, { minutes: number; entries: TaskHistoryEntry[] }>();
  for (const h of history) {
    const d = new Date(h.ts);
    const key = dayKeyOf(d);
    const slot = byDay.get(key) ?? { minutes: 0, entries: [] };
    // a session's minutes belong to the day it STARTED (its ts); a log's
    // minutes ride the log itself; a minutes-less log still counts as
    // activity — the day shows in the grid even at level 1
    slot.minutes += h.minutes ?? 0;
    slot.entries.push(h);
    byDay.set(key, slot);
  }

  const columns: HeatCell[][] = [];
  let today: HeatCell | null = null;
  const todayKey = dayKeyOf(now);

  for (let w = weeks - 1; w >= 0; w -= 1) {
    const column: HeatCell[] = [];
    for (let dow = 0; dow < 7; dow += 1) {
      const date = new Date(
        thisSunday.getFullYear(),
        thisSunday.getMonth(),
        thisSunday.getDate() - w * 7 + dow,
      );
      const key = dayKeyOf(date);
      const slot = byDay.get(key);
      const cell: HeatCell = {
        day: key,
        date,
        minutes: slot?.minutes ?? 0,
        level: levelFor(slot?.minutes ?? 0, (slot?.entries.length ?? 0) > 0),
        entries: slot?.entries ?? [],
        future: key > todayKey,
      };
      if (key === todayKey) today = cell;
      column.push(cell);
    }
    columns.push(column);
  }

  return { columns, today };
}
