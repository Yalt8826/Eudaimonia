import { describe, expect, it } from "@jest/globals";

import type { PlazaStrip } from "./model";
import { planCells, planStripLines, stripLinesFor } from "./stripLines";

// The strip lines selector — the honesty rules per strip, pinned:
//   waiting  -> the live count line (or unreachable), never fabricated
//   habits   -> the day-report coverage line, with the undefined-fallback
//               that guards PaperText's split (the device-only crash)
//   plan     -> plan-missing ASSERTED when no revision exists (law: never
//               synthesized); lines carry the freshness header when real

const strip = (id: string, lines: string[] = ["static line"]): PlazaStrip =>
  ({
    id,
    title: id,
    variant: "mint",
    tear: "a",
    to: "/",
    state: "uninstrumented",
    lines,
  }) as PlazaStrip;

const input = (overrides: Record<string, unknown> = {}) => ({
  waitingLine: "waiting on · server unreachable",
  coverageLines: {},
  planToday: null,
  ...overrides,
});

describe("stripLinesFor", () => {
  it("the waiting strip renders the live count line", () => {
    const lines = stripLinesFor(strip("waiting"), input());
    expect(lines).toEqual(["waiting on · server unreachable"]);
  });

  it("the habits strip falls back when coverage has not settled — never undefined", () => {
    const lines = stripLinesFor(strip("habits", []), input());
    expect(lines).toEqual(["day report · not yet instrumented"]);
  });

  it("the habits strip renders the coverage line when present", () => {
    const lines = stripLinesFor(
      strip("habits", []),
      input({ coverageLines: { "day-report": "day report · 1 of 7 · alive" } }),
    );
    expect(lines).toEqual(["day report · 1 of 7 · alive"]);
  });

  it("the plan strip asserts plan-missing — never synthesized history", () => {
    const lines = stripLinesFor(
      strip("plan"),
      input({ planToday: { plan: "missing", plan_lines: [], days_fresh_7: 0, artifact_count: 0, status: "alive" } }),
    );
    expect(lines[0]).toContain("plan · missing");
  });

  it("the plan strip renders the revision's lines with a freshness header", () => {
    const lines = stripLinesFor(
      strip("plan"),
      input({
        planToday: {
          plan: "ok",
          week_start: "2026-09-07",
          plan_lines: ["3:00–3:45pm | **dMAT** (45m) | warm-up"],
          days_fresh_7: 1,
          artifact_count: 1,
          status: "alive",
        },
      }),
    );
    expect(lines[0]).toBe("plan · fresh 1 of 7");
    expect(lines[1]).toContain("dMAT");
  });

  it("plan lines drop the markdown: no literal ** or | dividers", () => {
    expect(planCells("3:00–3:45pm | **dMAT** (45m) | warm-up")).toEqual([
      "3:00–3:45pm",
      "dMAT (45m)",
      "warm-up",
    ]);
    expect(planCells("**dMAT** | Exam **26 Sep** — check ~**12 Sep**")).toEqual([
      "dMAT",
      "Exam 26 Sep — check ~12 Sep",
    ]);
  });

  it("the plan strip shows the day's time blocks and counts the weekly targets", () => {
    // the shape of the live Week Plan.md: backbone rows, then targets
    expect(
      planStripLines([
        "3:00–3:45pm | **dMAT** (45m) | Warm-up — keeps the exam fresh",
        "11:15pm–12:30am | **Flex slot** | Project / GRE review / rest",
        "**GRE** | Baseline from Mon's practice test | Oct/Nov exam",
        "**Kerdos** | Parked this week | Off-plan",
      ]),
    ).toEqual([
      "· 3:00–3:45pm — dMAT (45m)",
      "· 11:15pm–12:30am — Flex slot",
      "+ 2 weekly targets",
    ]);
  });

  it("a plan with no time blocks still shows every row, cleaned", () => {
    expect(planStripLines(["**GRE** | quant + verbal"])).toEqual(["· GRE · quant + verbal"]);
  });

  it("untouched strips render their static honest lines", () => {
    const lines = stripLinesFor(strip("yesterday"), input());
    expect(lines).toEqual(["static line"]);
  });
});
