// The heatmap's pure contract: minutes per local day, GitHub week
// columns (Sun..Sat, oldest left), intensity levels, future cells.
import { expect, it, describe } from "@jest/globals";

import { buildHeatmap } from "./taskHeatmap";
import type { TaskHistoryEntry } from "./tasks";

function entry(ts: string, minutes: number | null, text = "did the thing"): TaskHistoryEntry {
  return {
    kind: minutes === null ? "log" : "session",
    id: `id-${ts}-${minutes ?? "log"}`,
    ts,
    ended_at: minutes === null ? null : ts,
    minutes,
    capped: false,
    text,
    actor: "human",
  };
}

// Wed 2026-11-18 15:00 IST — the tests' fixed "now"
const NOW = new Date(2026, 10, 18, 15, 0, 0);

describe("buildHeatmap", () => {
  it("18 columns, each a Sun..Sat week, last column holds today", () => {
    const heat = buildHeatmap([], NOW);
    expect(heat.columns.length).toBe(18);
    const last = heat.columns[heat.columns.length - 1];
    // the last column starts on the Sunday of the week containing NOW
    expect(last[0].date.getDay()).toBe(0);
    expect(last[0].day).toBe("2026-11-15"); // Sun 15 Nov 2026
    expect(last[3].day).toBe("2026-11-18"); // Wed = today
    expect(heat.today?.day).toBe("2026-11-18");
    // days after today in the last column are future
    expect(last[4].future).toBe(true);
    expect(last[3].future).toBe(false);
  });

  it("one grid cell per day across columns — 18 weeks = 126 cells", () => {
    const heat = buildHeatmap([], NOW);
    expect(heat.columns.flat().length).toBe(18 * 7);
    // columns are consecutive: each column's Sunday is 7 days after the previous
    const c17 = heat.columns[17][0].date.getTime();
    const c16 = heat.columns[16][0].date.getTime();
    expect(c17 - c16).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("minutes accumulate per LOCAL day — a session's ts carries its day", () => {
    const heat = buildHeatmap(
      [
        entry("2026-11-18T03:30:00+00:00", 45), // 09:00 IST — Wed 18th locally
        entry("2026-11-18T12:00:00+00:00", 30), // 17:30 IST — still Wed 18th
        entry("2026-11-17T18:00:00+00:00", 60), // 23:30 IST — Tue 17th
      ],
      NOW,
    );
    const wed = heat.columns[heat.columns.length - 1][3];
    expect(wed.minutes).toBe(75);
    expect(wed.level).toBe(3); // 75m ≤ 90
    expect(wed.entries.length).toBe(2);

    const tue = heat.columns[heat.columns.length - 1][2];
    expect(tue.minutes).toBe(60);
    expect(tue.level).toBe(3);
  });

  it("a minutes-less log still lights the day at level 1", () => {
    const heat = buildHeatmap([entry("2026-11-18T10:00:00+00:00", null, "read a page")], NOW);
    const today = heat.today;
    expect(today?.minutes).toBe(0);
    expect(today?.level).toBe(1);
    expect(today?.entries.length).toBe(1);
    // days without entries stay level 0
    expect(heat.columns[0][0].level).toBe(0);
  });

  it("levels: ≤30m → 2, ≤90m → 3, more → 4", () => {
    const cells = (minutes: number): number => {
      const heat = buildHeatmap([entry("2026-11-18T05:00:00+00:00", minutes)], NOW);
      return heat.today?.level ?? -1;
    };
    expect(cells(1)).toBe(2);
    expect(cells(30)).toBe(2);
    expect(cells(31)).toBe(3);
    expect(cells(90)).toBe(3);
    expect(cells(91)).toBe(4);
    expect(cells(240)).toBe(4);
  });

  it("old entries outside the window do not crash the grid — they are just unseen", () => {
    const heat = buildHeatmap([entry("2025-01-01T10:00:00+00:00", 120)], NOW);
    expect(heat.columns.flat().every((c) => c.level === 0 || c.day <= "2026-11-18")).toBe(true);
  });
});
