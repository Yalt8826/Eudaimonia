import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TornSheet } from "./TornSheet";
import { tornEdgePlan, TORN_VARIANTS } from "./torn";

// Gates 3+4 assertion surface: --fringe-w exposed, text padding computed
// from the fringe width (the exclusion zone), tint rides its token, static
// rotation <= 1deg, deterministic tears, and no animation constructs (gate 4).
//
// v3: the tear is a raster alpha mask, not a clip path (paper separates along
// its fibres, and a polygon reads as a sawtooth). The fringe is a sibling
// inset behind the paper rather than its parent, so the SAME tear cuts both
// and the few pixels between them are the dark rim. Depth at the tear runs
// INWARD — the skin is the top layer, so it casts onto the paper below.

afterEach(cleanup);

interface SheetParts {
  wrapper: HTMLElement;
  /** Every band of the torn cross-section, outermost first. */
  rim: HTMLElement[];
  /** The outermost band — the open skin behind the sheet. */
  fringe: HTMLElement;
  paper: HTMLElement;
}

function sheetOf(ui: React.ReactElement): SheetParts {
  const { container } = render(ui);
  const wrapper = container.firstElementChild as HTMLElement | null;
  expect(wrapper).not.toBeNull();
  const kids = [...(wrapper?.children ?? [])] as HTMLElement[];
  const paper = kids.at(-1);
  const rim = kids.slice(0, -1);
  expect(rim.length, "the torn cross-section is a stack of graded bands").toBeGreaterThanOrEqual(3);
  expect(paper).toBeDefined();
  return {
    wrapper: wrapper as HTMLElement,
    rim,
    fringe: rim[0],
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
    expect(styleOf(paper)).toMatch(/padding-top:\s*calc\(var\(--fringe-w\) \* 0\.55 \+ 80px\)/);
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
    expect(style).toContain("800px 80px");
    expect(paper.style.clipPath).toBe("");
  });

  it("casts the skin's edge INWARD onto the paper, not the paper outward", () => {
    const { wrapper, paper } = sheetOf(<TornSheet>text</TornSheet>);
    // The skin is the top layer (01 §2 placement ruling): depth at the tear
    // comes from it falling on the paper below. A sheet casting outward
    // would render the stack upside down.
    const casts = [...paper.querySelectorAll("span")].filter((s) =>
      (s.getAttribute("style") ?? "").includes("var(--skin-cast-max)"),
    );
    expect(casts.length, "one cast per torn edge, top and bottom").toBe(2);
    expect(styleOf(wrapper)).toContain("var(--sheet-seat)");
    expect(styleOf(wrapper)).not.toContain("sheet-shadow-cast");
  });

  it("is static — no animation constructs in any generated style (gate 4)", () => {
    const { wrapper, fringe, paper } = sheetOf(<TornSheet>text</TornSheet>);
    for (const el of [wrapper, fringe, paper]) {
      const style = styleOf(el).toLowerCase();
      expect(style).not.toContain("animation");
      expect(style).not.toContain("transition");
    }
  });

  it("shows the stock's thickness as a graded cross-section along the tear", () => {
    const { rim, paper } = sheetOf(<TornSheet seed="plaza">text</TornSheet>);
    const edges = (s: string): string[] => s.match(/edge-(top|bottom)-\d/g) ?? [];
    // Every band is cut by the SAME tear, so the cross-section follows each
    // serration rather than outlining the sheet.
    for (const band of rim) {
      expect(styleOf(band)).toContain("mask-image");
      expect(edges(styleOf(band))).toEqual(edges(styleOf(paper)));
    }
    // Insets step inward, and the lit cut face sits against the paper —
    // thick stock, not a line.
    const insets = rim.map((b) => Number(/inset: -(\d+)px/.exec(styleOf(b))?.[1]));
    expect(insets).toEqual([...insets].sort((a, b) => b - a));
    expect(styleOf(rim[0])).toContain("var(--bg)");
    expect(styleOf(rim.at(-1) as HTMLElement)).toContain("var(--skin-lip-1)");
  });

  it("renders the optional accent left-rule through its token", () => {
    const { paper } = sheetOf(<TornSheet rule="accent-1">text</TornSheet>);
    const rules = [...paper.querySelectorAll("span")].filter((s) =>
      (s.getAttribute("style") ?? "").includes("var(--accent-1)"),
    );
    expect(rules.length, "exactly one accent rule").toBe(1);
  });
});
