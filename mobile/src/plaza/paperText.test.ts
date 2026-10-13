import { describe, expect, it } from "@jest/globals";

import { wrapToWidth } from "./ui";
import { PLAZA_STRIPS } from "./model";

// M2 REVIEW REGRESSION. Three of the four coverage lines lost their last
// words on device: RN measured them with one typeface and painted them in
// another, so "not yet instrumented · day-report adapter lands in P1" was
// laid out 55px tall — one line — in a 946px box and the tail was never
// drawn. Nothing caught it, because every acceptance row in the Skia brief
// measured colour, rim, clearance and contrast, and none asked whether the
// text on screen was the text in the model.
//
// PaperText wraps against the same font object that draws the glyphs, so
// measurement and paint cannot disagree. These tests hold the wrapper
// honest: it must break lines, never drop words.

/** The widest mono advance at 13px is 0.6em = 7.8px; measure like the font. */
const monoWidth = (s: string): number => s.length * 7.8;

describe("wrapToWidth — breaks lines, never drops words", () => {
  it("keeps every word of every Plaza coverage line", () => {
    // 360dp phone minus the sheet's 25.6 padding each side.
    for (const width of [268.8, 308.8, 378.8]) {
      for (const strip of PLAZA_STRIPS) {
        for (const line of strip.lines) {
          const wrapped = wrapToWidth(line, width, monoWidth);
          // jest's expect takes no message argument, so the context goes
          // into the compared value: a failure prints which line and width.
          expect(`${width}px ${wrapped.join(" ")}`).toBe(`${width}px ${line}`);
        }
      }
    }
  });

  it("actually wraps rather than returning one over-long line", () => {
    const line = "not yet instrumented · day-report adapter lands in P1";
    const wrapped = wrapToWidth(line, 268.8, monoWidth);
    expect(wrapped.length).toBeGreaterThan(1);
    const overflowing = wrapped.filter((l) => monoWidth(l) > 268.8);
    expect(overflowing).toEqual([]);
  });

  it("never returns an empty line, and preserves single words too long to fit", () => {
    // A word wider than the box has nowhere to break: it must still be
    // emitted, not silently dropped.
    const wrapped = wrapToWidth("supercalifragilistic", 20, monoWidth);
    expect(wrapped).toEqual(["supercalifragilistic"]);
    expect(wrapToWidth("a b", 0, monoWidth)).toEqual(["a b"]);
  });

  it("the wake chip's line survives the narrowest layout", () => {
    const wake = "wake · not yet instrumented (P2)";
    expect(wrapToWidth(wake, 268.8, monoWidth).join(" ")).toBe(wake);
  });
});
