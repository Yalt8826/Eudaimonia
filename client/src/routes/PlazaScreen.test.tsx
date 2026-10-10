import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PlazaScreen } from "./PlazaScreen";

// The Plaza (04 `/`): five torn-paper sheets over the continuous black page,
// per the torn-paper implementation spec. Until the P1 adapters land, every
// strip renders its TRUE state — honest uninstrumented lines, never
// fabricated counts (law 7; 09 §2#1's fifth state).

afterEach(cleanup);

function plaza(): HTMLElement {
  const { container } = render(
    <MemoryRouter initialEntries={["/"]}>
      <PlazaScreen />
    </MemoryRouter>,
  );
  return container;
}

const VARIANTS = ["mint", "sky", "blush", "butter", "lavender"] as const;

describe("PlazaScreen (04 `/`, torn-paper interface spec)", () => {
  it("renders the header hierarchy: date label, title, tagline, settings", () => {
    const container = plaza();
    expect(screen.getByRole("heading", { name: "Eudaimonia" })).toBeTruthy();
    expect(container.textContent).toContain("Today ·");
    expect(container.textContent).toContain("A calmer, more intentional you");
    expect(container.querySelector('a[aria-label="Settings"]')).not.toBeNull();
  });

  it("renders five torn sections, one per variant, in the mockup's order", () => {
    const container = plaza();
    const sections = [...container.querySelectorAll(".torn-section")];
    expect(sections.length).toBe(5);
    const order = VARIANTS.map(
      (v) => sections.findIndex((s) => s.className.includes(`torn-section--${v}`)),
    );
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i], `${VARIANTS[i]} must follow ${VARIANTS[i - 1]}`).toBeGreaterThan(
        order[i - 1],
      );
    }
  });

  it("each section carries the paper layer, the fringe layer, and real content", () => {
    const container = plaza();
    expect(container.querySelectorAll(".torn-section__paper")).toHaveLength(5);
    expect(container.querySelectorAll(".torn-section__fringe")).toHaveLength(5);
    expect(container.querySelectorAll(".torn-section__content")).toHaveLength(5);
  });

  it("every strip is honest — uninstrumented lines, never fabricated counts", () => {
    const container = plaza();
    const text = container.textContent ?? "";
    const honest = (text.match(/not yet instrumented/g) ?? []).length;
    expect(honest, "each data-less strip names its true state").toBeGreaterThanOrEqual(5);
    expect(text, "no synthesized streak/progress numbers (law 7)").not.toMatch(/\d of 7/);
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
});
