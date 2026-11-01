import { describe, expect, it } from "@jest/globals";

import { blockPhases, parsePlan, parseTimeRange, truncateToWidth, weekOfLabel } from "./planModel";
import { cardRows } from "./PlanCard";

// the live Week Plan.md shape (server plan_lines, 2026-08-31 revision)
const LINES = [
  "3:00–3:45pm | **dMAT** (45m) | Warm-up — keeps the 26 Sep exam fresh, not deep work",
  "3:45–6:45pm | **GRE deep work** (~3h) | Best analytical hours — quant + verbal",
  "7:00–9:00pm | Gym | Fixed, non-negotiable",
  "11:15pm–12:30am | **Flex slot** | Project / GRE review / rest (see day-by-day)",
  "**GRE** | Baseline from Mon's practice test | Oct/Nov exam — the daily engine",
  "**Kerdos** | Parked this week | Off-plan unless a spare slot opens",
];

const at = (h: number, m = 0) => new Date(2026, 10, 1, h, m);

describe("parseTimeRange", () => {
  it("borrows the end's am/pm for a bare start", () => {
    expect(parseTimeRange("3:00–3:45pm")).toEqual({ start: 900, end: 945 });
    expect(parseTimeRange("11–1pm")).toEqual({ start: 660, end: 780 });
  });
  it("runs a range across midnight forward", () => {
    expect(parseTimeRange("11:15pm–12:30am")).toEqual({ start: 1395, end: 1470 });
  });
  it("is null for a non-time cell", () => {
    expect(parseTimeRange("GRE")).toBeNull();
  });
});

describe("parsePlan", () => {
  it("splits blocks (time, title, notes) from targets, markdown dropped", () => {
    const plan = parsePlan(LINES);
    expect(plan.blocks).toHaveLength(4);
    expect(plan.blocks[0]).toMatchObject({
      time: "3:00–3:45pm",
      startLabel: "3:00",
      title: "dMAT (45m)",
      notes: "Warm-up — keeps the 26 Sep exam fresh, not deep work",
    });
    expect(plan.blocks[3].startLabel).toBe("11:15");
    expect(plan.targets).toEqual([
      { name: "GRE", details: ["Baseline from Mon's practice test", "Oct/Nov exam — the daily engine"] },
      { name: "Kerdos", details: ["Parked this week", "Off-plan unless a spare slot opens"] },
    ]);
  });
});

describe("blockPhases", () => {
  const { blocks } = parsePlan(LINES);
  it("marks the block in progress now, earlier ones past", () => {
    expect(blockPhases(blocks, at(16, 10))).toEqual(["past", "now", "later", "later"]);
  });
  it("marks the next block when the clock is between blocks", () => {
    expect(blockPhases(blocks, at(10))).toEqual(["next", "later", "later", "later"]);
    expect(blockPhases(blocks, at(21, 30))).toEqual(["past", "past", "past", "next"]);
  });
  it("keeps the after-midnight slot on the same plan day", () => {
    expect(blockPhases(blocks, at(0, 10))).toEqual(["past", "past", "past", "now"]);
  });
});

describe("the card's rows", () => {
  it("one row per block with its start label", () => {
    const rows = cardRows(parsePlan(LINES), at(16));
    expect(rows.map((r) => `${r.time} ${r.title} ${r.phase}`)).toEqual([
      "3:00 dMAT (45m) past",
      "3:45 GRE deep work (~3h) now",
      "7:00 Gym later",
      "11:15 Flex slot later",
    ]);
  });
  it("falls back to the targets for a plan without time blocks", () => {
    const rows = cardRows(parsePlan(["**GRE** | quant"]), at(16));
    expect(rows).toEqual([{ time: "", title: "GRE", phase: "later" }]);
  });
});

describe("helpers", () => {
  it("truncates against the measuring function", () => {
    const measure = (s: string) => s.length * 10;
    expect(truncateToWidth("short", 100, measure)).toBe("short");
    expect(truncateToWidth("a much longer title", 80, measure)).toBe("a much…");
  });
  it("labels the week", () => {
    expect(weekOfLabel("2026-08-31")).toBe("week of 31 Aug");
    expect(weekOfLabel(undefined)).toBeNull();
  });
});
