import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PlazaScreen } from "./PlazaScreen";

// The Plaza (04 `/`) rendered in the torn-paper language per the ratified
// mockup — with the honesty laws asserted: until the P1 adapters land, every
// strip shows its true uninstrumented state and NO fabricated counts
// (law 7; 09 §2#1's "not yet instrumented" fifth state).

afterEach(cleanup);

function plaza(): HTMLElement {
  const { container } = render(
    <MemoryRouter initialEntries={["/"]}>
      <PlazaScreen />
    </MemoryRouter>,
  );
  return container;
}

describe("PlazaScreen (04 `/`, mockup-ratified torn-paper language)", () => {
  it("renders the header hierarchy: date label, title, tagline", () => {
    const container = plaza();
    expect(screen.getByRole("heading", { name: "Eudaimonia" })).toBeTruthy();
    expect(container.textContent).toContain("Today ·");
    expect(container.textContent).toContain("A calmer, more intentional you");
  });

  it("renders the five mockup sections in order", () => {
    const container = plaza();
    const text = container.textContent ?? "";
    const order = ["Today's Plan", "Waiting On", "Habits", "Yesterday", "Agents"];
    let last = -1;
    for (const title of order) {
      const at = text.indexOf(title);
      expect(at, `${title} strip must render`).toBeGreaterThan(last);
      last = at;
    }
  });

  it("every strip is honest — uninstrumented lines, never fabricated counts", () => {
    const container = plaza();
    const text = container.textContent ?? "";
    const honest = (text.match(/not yet instrumented/g) ?? []).length;
    expect(honest, "each data-less strip names its true state").toBeGreaterThanOrEqual(5);
    expect(text, "no synthesized streak/progress numbers (law 7)").not.toMatch(/\d of 7/);
    expect(text).not.toMatch(/4 of 7/);
  });

  it("the wake chip deep-links the real precached hard-mode screen", () => {
    plaza();
    const chip = screen.getByText("tap when you wake");
    const link = chip.closest("a");
    expect(link?.getAttribute("href")).toBe("/habits/wake");
  });

  it("links each strip to its real route", () => {
    const container = plaza();
    for (const href of ["/routine", "/inbox", "/meals", "/timeline", "/agents", "/settings"]) {
      expect(container.querySelector(`a[href="${href}"]`), href).not.toBeNull();
    }
  });

  it("renders all five sections on the one torn-paper primitive", () => {
    const container = plaza();
    const spec = [...container.querySelectorAll("section.torn-section")];
    expect(spec.length, "every sheet is a TornPaperSection").toBe(5);
    // One primitive, five sheets (01 §2: no second sheet component).
    const legacy = [...container.querySelectorAll("section")].filter((el) =>
      (el.children[1]?.getAttribute("style") ?? "").includes("mask-image"),
    );
    expect(legacy.length, "nothing left on the previous sheet").toBe(0);
  });

  it("gives every sheet its own tint, for life (tint-as-taxonomy)", () => {
    const container = plaza();
    const spec = [...container.querySelectorAll("section.torn-section")];
    const tints = spec.map(
      (el) => [...el.classList].find((c) => /^torn-section--(?!tear-)/.test(c)) ?? "",
    );
    expect(tints).toEqual([
      "torn-section--mint",
      "torn-section--sky",
      "torn-section--blush",
      "torn-section--butter",
      "torn-section--lavender",
    ]);
    expect(new Set(tints).size, "no tint is reused").toBe(5);
  });

  it("never shows the same silhouette twice in the same place", () => {
    // Three authored contours cover five sheets, so two must repeat a
    // shape. What must not repeat is the shape AND its phase into the
    // tiled strip — that is a visibly stamped page (spec §2.2).
    const container = plaza();
    const spec = [...container.querySelectorAll("section.torn-section")];
    const cut = spec.map((el) => {
      const tear = [...el.classList].find((c) => c.startsWith("torn-section--tear-")) ?? "tear-a";
      const offset = (el as HTMLElement).style.getPropertyValue("--tear-x") || "0px";
      return `${tear}@${offset}`;
    });
    expect(new Set(cut).size, `two sheets cut identically: ${cut.join(", ")}`).toBe(cut.length);
    // And no two ADJACENT sheets share even the contour, since their
    // edges meet across one band of skin.
    for (let i = 1; i < cut.length; i += 1) {
      expect(cut[i].split("@")[0], "adjacent sheets share a contour").not.toBe(
        cut[i - 1].split("@")[0],
      );
    }
  });

  it("gives the spec sheet its own torn cross-section, cut by the same contour", () => {
    const container = plaza();
    const section = container.querySelector("section.torn-section");
    expect(section).not.toBeNull();
    // Four graded bands of skin, then the paper — the skin is the layer on
    // top, so its thickness shows along the tear.
    const bands = section?.querySelectorAll(".torn-section__skin") ?? [];
    expect(bands.length, "graded bands of the skin's cut face").toBe(5);
    expect(section?.querySelector(".torn-section__paper")).not.toBeNull();
    // Fibre and relief ride their own layer, generated from the same contour.
    expect(section?.querySelector(".torn-section__fringe")).not.toBeNull();
    // The shadow runs inward, cast by the skin onto the paper beneath it.
    expect(section?.querySelectorAll(".torn-section__cast").length).toBe(2);
  });
});
