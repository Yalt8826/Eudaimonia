import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TornSheet } from "./TornSheet";

// Gate 3's assertion surface at stub level: --fringe-w is exposed, the text
// padding is computed from the fringe width (the fringe exclusion zone), the
// tint rides its token, and the static rotation stays <= 1deg.

afterEach(cleanup);

function sheetOf(ui: React.ReactElement): HTMLElement {
  const { container } = render(ui);
  const sheet = container.firstElementChild;
  expect(sheet).not.toBeNull();
  return sheet as HTMLElement;
}

describe("TornSheet (01 §2 L2 stub)", () => {
  it("exposes --fringe-w as a custom property when given", () => {
    const sheet = sheetOf(<TornSheet fringeWidth="1.5rem">text</TornSheet>);
    expect(sheet.style.getPropertyValue("--fringe-w")).toBe("1.5rem");
  });

  it("computes text padding from the fringe width — the exclusion zone", () => {
    const sheet = sheetOf(<TornSheet>text</TornSheet>);
    expect(sheet.getAttribute("style") ?? "").toContain("calc(var(--fringe-w) * 2)");
  });

  it("renders each paper tint through its token, never a literal color", () => {
    for (const tint of ["cream", "mint", "sky", "blush", "butter"] as const) {
      const sheet = sheetOf(<TornSheet tint={tint}>text</TornSheet>);
      expect(sheet.getAttribute("style") ?? "").toContain(`var(--paper-${tint})`);
    }
  });

  it("clamps the static rotation to <= 1deg", () => {
    const over = sheetOf(<TornSheet rotationDeg={30}>text</TornSheet>);
    expect(over.getAttribute("style") ?? "").toContain("rotate(1deg)");
    const under = sheetOf(<TornSheet rotationDeg={-30}>text</TornSheet>);
    expect(under.getAttribute("style") ?? "").toContain("rotate(-1deg)");
  });
});
