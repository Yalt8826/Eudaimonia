import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TornSheet } from "./TornSheet";
import { tornClipPath } from "./torn";

// Gates 3+4 assertion surface: --fringe-w exposed, text padding computed
// from the fringe width (the exclusion zone), tint rides its token, static
// rotation <= 1deg, deterministic tears, and no animation constructs (gate 4).

afterEach(cleanup);

interface SheetParts {
  wrapper: HTMLElement;
  fringe: HTMLElement;
  paper: HTMLElement;
}

function sheetOf(ui: React.ReactElement): SheetParts {
  const { container } = render(ui);
  const wrapper = container.firstElementChild;
  expect(wrapper).not.toBeNull();
  const fringe = wrapper?.firstElementChild;
  expect(fringe).not.toBeNull();
  const paper = fringe?.firstElementChild;
  expect(paper).not.toBeNull();
  return {
    wrapper: wrapper as HTMLElement,
    fringe: fringe as HTMLElement,
    paper: paper as HTMLElement,
  };
}

describe("TornSheet (01 §2 L2, v2 torn paper)", () => {
  it("exposes --fringe-w as a custom property when given", () => {
    const { wrapper } = sheetOf(<TornSheet fringeWidth="1.5rem">text</TornSheet>);
    expect(wrapper.style.getPropertyValue("--fringe-w")).toBe("1.5rem");
  });

  it("computes text padding from the fringe width — the exclusion zone", () => {
    const { paper } = sheetOf(<TornSheet>text</TornSheet>);
    expect(paper.getAttribute("style") ?? "").toContain("calc(var(--fringe-w) * 1.5)");
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
      expect(paper.getAttribute("style") ?? "").toContain(`var(--paper-${tint})`);
    }
  });

  it("clamps the static rotation to <= 1deg", () => {
    const over = sheetOf(<TornSheet rotationDeg={30}>text</TornSheet>);
    expect(over.wrapper.getAttribute("style") ?? "").toContain("rotate(1deg)");
    const under = sheetOf(<TornSheet rotationDeg={-30}>text</TornSheet>);
    expect(under.wrapper.getAttribute("style") ?? "").toContain("rotate(-1deg)");
  });

  it("tears deterministically — same seed, same clip; different seed, different clip", () => {
    expect(tornClipPath("plaza", 6.5)).toBe(tornClipPath("plaza", 6.5));
    expect(tornClipPath("plaza", 6.5)).not.toBe(tornClipPath("waiting", 6.5));
    const { paper } = sheetOf(<TornSheet seed="plaza">text</TornSheet>);
    expect(paper.style.clipPath).toBe(tornClipPath("plaza", 6.5));
  });

  it("is static — no animation constructs in any generated style (gate 4)", () => {
    const { wrapper, fringe, paper } = sheetOf(<TornSheet>text</TornSheet>);
    for (const el of [wrapper, fringe, paper]) {
      const style = el.getAttribute("style") ?? "";
      expect(style.toLowerCase()).not.toContain("animation");
      expect(style.toLowerCase()).not.toContain("transition");
    }
  });

  it("frames the paper with the black fringe behind it (placement ruling)", () => {
    const { fringe } = sheetOf(<TornSheet>text</TornSheet>);
    expect(fringe.getAttribute("style") ?? "").toContain("var(--bg)");
    expect(fringe.style.clipPath).toBeTruthy();
  });

  it("renders the optional accent left-rule through its token", () => {
    const { paper } = sheetOf(
      <TornSheet rule="accent-1">text</TornSheet>,
    );
    const rule = paper.querySelector("span[aria-hidden='true']");
    expect(rule).not.toBeNull();
    expect((rule as HTMLElement).getAttribute("style") ?? "").toContain(
      "var(--accent-1)",
    );
  });
});
