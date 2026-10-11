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

  // The Plaza is mid-migration (spec §10): Today's Plan is rebuilt on
  // TornPaperSection, the other four stay on the previous sheet until it
  // is approved. Both are torn paper; they differ in how the tear is cut.
  it("renders every section as torn paper — one on the spec sheet, four on the old", () => {
    const container = plaza();
    const sections = [...container.querySelectorAll("section")];

    const spec = sections.filter((el) => el.classList.contains("torn-section"));
    expect(spec.length, "Today's Plan, on TornPaperSection").toBe(1);
    expect(spec[0].classList.contains("torn-section--mint")).toBe(true);

    const legacy = sections.filter((el) =>
      (el.children[1]?.getAttribute("style") ?? "").includes("mask-image"),
    );
    expect(legacy.length, "the four not yet migrated").toBe(4);
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
