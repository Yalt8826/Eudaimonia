import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TornSheet } from "./TornSheet";
import { tornEdgePlan, TORN_VARIANTS } from "./torn";

// Gates 3+4 assertion surface: --fringe-w exposed, text padding computed
// from the fringe width (the exclusion zone), tint rides its token, static
// rotation <= 1deg, deterministic tears, and no animation constructs (gate 4).
//
// v3: the tear is a raster alpha mask, not a clip path (paper separates along
// its fibres, and a polygon reads as a sawtooth). The fringe is now a sibling
// inset behind the paper rather than its parent, so the SAME tear cuts both
// and the few pixels between them are the dark rim.

afterEach(cleanup);

interface SheetParts {
  wrapper: HTMLElement;
  fringe: HTMLElement;
  paper: HTMLElement;
}

function sheetOf(ui: React.ReactElement): SheetParts {
  const { container } = render(ui);
  const wrapper = container.firstElementChild as HTMLElement | null;
  expect(wrapper).not.toBeNull();
  const fringe = wrapper?.children[0] as HTMLElement | undefined;
  const paper = wrapper?.children[1] as HTMLElement | undefined;
  expect(fringe).toBeDefined();
  expect(paper).toBeDefined();
  return {
    wrapper: wrapper as HTMLElement,
    fringe: fringe as HTMLElement,
    paper: paper as HTMLElement,
  };
}

const styleOf = (el: HTMLElement): string => el.getAttribute("style") ?? "";

describe("TornSheet (01 §2 L2, v3 torn paper)", () => {
  it("exposes --fringe-w as a custom property when given", () => {
    const { wrapper } = sheetOf(<TornSheet fringeWidth="1.5rem">text</TornSheet>);
    expect(wrapper.style.getPropertyValue("--fringe-w")).toBe("1.5rem");
  });

  it("computes text padding from the fringe width — the exclusion zone", () => {
    const { paper } = sheetOf(<TornSheet>text</TornSheet>);
    expect(styleOf(paper)).toContain("calc(var(--fringe-w) * 1.5)");
  });

  it("clears the tear vertically too — top and bottom padding exceed the edge bite", () => {
    const { paper } = sheetOf(<TornSheet>text</TornSheet>);
    // The tear bites a full edge-strip height into the sheet, so padding
    // carries that as an explicit px term on top of the fringe — text can
    // never land inside the tear.
    expect(styleOf(paper)).toMatch(/padding-top:\s*calc\(var\(--fringe-w\) \* 0\.55 \+ 43px\)/);
  });

  it("renders each paper tint through its token, never a literal color", () => {
    for (const tint of [
      "cream",
      "mint",
      "sky",
      "blush",
      "butter",
      "violet",
    ] as const) {
      const { paper } = sheetOf(<TornSheet tint={tint}>text</TornSheet>);
      expect(styleOf(paper)).toContain(`var(--paper-${tint})`);
    }
  });

  it("clamps the static rotation to <= 1deg", () => {
    const over = sheetOf(<TornSheet rotationDeg={30}>text</TornSheet>);
    expect(styleOf(over.wrapper)).toContain("rotate(1deg)");
    const under = sheetOf(<TornSheet rotationDeg={-30}>text</TornSheet>);
    expect(styleOf(under.wrapper)).toContain("rotate(-1deg)");
  });

  it("tears deterministically — same seed, same plan; different seed, different plan", () => {
    expect(tornEdgePlan("plaza")).toEqual(tornEdgePlan("plaza"));
    expect(tornEdgePlan("plaza")).not.toEqual(tornEdgePlan("waiting"));
  });

  it("only ever picks a generated variant", () => {
    for (const seed of ["plaza:plan", "plaza:waiting", "plaza:habits", "x", "y", "z"]) {
      const plan = tornEdgePlan(seed);
      for (const v of [plan.topVariant, plan.bottomVariant]) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(TORN_VARIANTS);
      }
    }
  });

  it("cuts the paper with a tiled raster edge, not a clip path", () => {
    const { paper } = sheetOf(<TornSheet seed="plaza">text</TornSheet>);
    const style = styleOf(paper);
    expect(style).toContain("mask-image");
    expect(style).toContain("edge-top");
    expect(style).toContain("edge-bottom");
    expect(style).toContain("repeat-x");
    // Rendered at 45%: the strip keeps its proportions and only the solid
    // middle flexes, so the tear never stretches with sheet height.
    expect(style).toContain("720px 43px");
    expect(paper.style.clipPath).toBe("");
  });

  it("is static — no animation constructs in any generated style (gate 4)", () => {
    const { wrapper, fringe, paper } = sheetOf(<TornSheet>text</TornSheet>);
    for (const el of [wrapper, fringe, paper]) {
      const style = styleOf(el).toLowerCase();
      expect(style).not.toContain("animation");
      expect(style).not.toContain("transition");
    }
  });

  it("frames the paper with the black fringe, cut by the same tear", () => {
    const { fringe, paper } = sheetOf(<TornSheet seed="plaza">text</TornSheet>);
    const fringeStyle = styleOf(fringe);
    expect(fringeStyle).toContain("var(--bg)");
    expect(fringeStyle).toContain("mask-image");
    // Same tear on both, so the rim follows the tear instead of outlining it.
    const edges = (s: string): string[] => s.match(/edge-(top|bottom)-\d/g) ?? [];
    expect(edges(fringeStyle)).toEqual(edges(styleOf(paper)));
    // The fringe sits proud of the paper — that gap IS the visible rim.
    expect(fringeStyle).toContain("inset: -4px");
  });

  it("renders the optional accent left-rule through its token", () => {
    const { paper } = sheetOf(<TornSheet rule="accent-1">text</TornSheet>);
    const rule = paper.querySelector("span[aria-hidden='true']");
    expect(rule).not.toBeNull();
    expect((rule as HTMLElement).getAttribute("style") ?? "").toContain(
      "var(--accent-1)",
    );
  });
});
