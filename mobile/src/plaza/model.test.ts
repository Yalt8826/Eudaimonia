import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

import {
  ACCENT_INK_OF,
  PAPER_OF,
  PLAZA_STRIPS,
  TEAR_PADDING,
  TEAR_REACH,
} from "./model";
import { colors } from "../theme/tokens";

// The Plaza's tear laws as tests (M2). These are the structural half of the
// acceptance list — the measured half (tints, clearance, rim) runs against
// pixels in renders/ and is recorded in MEASUREMENTS.md; this suite holds
// the part that is pure data, so a sheet edit that breaks a law breaks the
// build rather than the render.

// Jest has no expect(value, message) form — the M1 convention.
function assertThat(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

describe("the Plaza's five sheets", () => {
  it("run mint · sky · blush · butter · lavender, tearing a · b · c · a@260 · b@420", () => {
    expect(PLAZA_STRIPS.map((s) => s.variant)).toEqual([
      "mint",
      "sky",
      "blush",
      "butter",
      "lavender",
    ]);
    expect(PLAZA_STRIPS.map((s) => [s.tear, s.tearOffset ?? 0])).toEqual([
      ["a", 0],
      ["b", 0],
      ["c", 0],
      ["a", 260],
      ["b", 420],
    ]);
  });

  it("never puts two ADJACENT sheets on the same contour", () => {
    for (let i = 1; i < PLAZA_STRIPS.length; i += 1) {
      assertThat(
        PLAZA_STRIPS[i].tear !== PLAZA_STRIPS[i - 1].tear,
        `sheets ${i - 1} and ${i} (${PLAZA_STRIPS[i - 1].id}, ${PLAZA_STRIPS[i].id}) ` +
          `both tear with '${PLAZA_STRIPS[i].tear}' — adjacent sheets must not share a contour`,
      );
    }
  });

  it("never gives two sheets the same contour AND offset", () => {
    const seen = new Map<string, string>();
    for (const strip of PLAZA_STRIPS) {
      const key = `${strip.tear}@${strip.tearOffset ?? 0}`;
      const first = seen.get(key);
      assertThat(
        first === undefined,
        `${strip.id} and ${first} both tear ${key} — the identical silhouette in the ` +
          `identical place; the offset exists so repeated contours show different lobes`,
      );
      seen.set(key, strip.id);
    }
  });

  it("carries the hue-law accent on exactly TWO sheets — mint and lavender", () => {
    // An accent on every sheet signals nothing (model.ts comment, 01 §4).
    const accented = PLAZA_STRIPS.filter((s) => s.accent !== undefined);
    expect(accented.map((s) => s.id)).toEqual(["plan", "agents"]);
    expect(accented.map((s) => s.variant)).toEqual(["mint", "lavender"]);
    expect(accented.map((s) => s.accent)).toEqual(["accent-1", "accent-2"]);
  });

  it("paints every accent from the -ink pair, never the raw accent", () => {
    // The raw accents are for glass and the black skin only: --accent-1
    // measures 1.22 on mint, --accent-2 1.59 on lavender (tokens.ts).
    for (const token of Object.values(ACCENT_INK_OF)) {
      expect(token).toMatch(/-ink$/);
      expect(Object.keys(colors)).toContain(token);
    }
  });

  it("routes every strip's chevron to a real route", () => {
    // The wake chip's pills are checked by the screen; the model's `to`
    // must at least exist in the M1 route map.
    const routeMap = readFileSync(join(__dirname, "..", "navigation", "routeMap.ts"), "utf8");
    for (const strip of PLAZA_STRIPS) {
      assertThat(
        routeMap.includes(`path: "${strip.to}"`),
        `${strip.id} links to ${strip.to}, which is not in routeMap.ts`,
      );
    }
  });
});

describe("per-tear padding", () => {
  it("matches the values torn-paper.css carries, per contour", () => {
    // NOT one value for all three (M2 brief): a 100/91 · b 92/99 · c 97/96.
    expect(TEAR_PADDING).toEqual({
      a: { top: 100, bottom: 91 },
      b: { top: 92, bottom: 99 },
      c: { top: 97, bottom: 96 },
    });
  });

  it("clears the measured material reach on every edge of every contour", () => {
    // reach + 6px of breathing room, ceil'd to the whole CSS px (torn-paper
    // 100/91 = ceil(94+6)/ceil(84.5+6)); never below the reach itself
    // (tear-metrics.json / README #6: text clears the MATERIAL, not the
    // contour — fringe clumps hang up to 14px past it).
    const metrics = JSON.parse(
      readFileSync(join(__dirname, "..", "..", "assets", "tears", "tear-metrics.json"), "utf8"),
    );
    for (const tear of ["a", "b", "c"] as const) {
      for (const edge of ["top", "bottom"] as const) {
        const reach = metrics.reach[tear][edge];
        expect(reach).toBeCloseTo(TEAR_REACH[tear][edge], 5);
        expect(TEAR_PADDING[tear][edge]).toBe(Math.ceil(reach + 6));
      }
    }
  });

  it("keeps every sheet's ink paired with its own paper token", () => {
    // Five section papers, each with its OWN ink (tokens.ts spec palette).
    expect(Object.values(PAPER_OF).map((p) => p.paper)).toEqual([
      "--sheet-mint",
      "--sheet-sky",
      "--sheet-blush",
      "--sheet-butter",
      "--sheet-lavender",
    ]);
    for (const { paper, ink } of Object.values(PAPER_OF)) {
      assertThat(
        ink === `${paper}-ink`,
        `${ink} must be the ink of ${paper}'s family`,
      );
      expect(colors[paper]).toMatch(/^#[0-9A-F]{6}$/i);
      expect(colors[ink]).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
