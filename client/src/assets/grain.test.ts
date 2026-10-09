import { describe, expect, it } from "vitest";
import grainSource from "./grain.svg?raw";

// Gate 4 (01 v2 §7): the grain asset is static — no animation constructs of
// any kind — and its opacity constant stays at or below the 2% ceiling.
// Vite's ?raw import hands the test the asset's exact source at bundle time.

const GRAIN = grainSource;

describe("grain asset (01 §2 L0, gate 4)", () => {
  it("is static — contains no animation constructs", () => {
    expect(GRAIN).not.toMatch(/<animate/i);
    expect(GRAIN).not.toMatch(/<animatemotion/i);
    expect(GRAIN).not.toMatch(/<animatetransform/i);
    expect(GRAIN).not.toMatch(/<script/i);
    expect(GRAIN).not.toMatch(/\bonload\b|\bsetinterval\b|\brequestanimationframe\b/i);
    expect(GRAIN).not.toMatch(/animation\s*:|@keyframes/i);
  });

  it("is an SVG noise asset (feTurbulence)", () => {
    expect(GRAIN).toMatch(/<feTurbulence/i);
  });

  it("stays at or below the 2% opacity ceiling", () => {
    const opacities = [...GRAIN.matchAll(/opacity\s*=\s*["']([0-9]*\.?[0-9]+)["']/g)].map((m) =>
      Number.parseFloat(m[1]),
    );
    expect(opacities.length, "the grain must declare its opacity constant").toBeGreaterThan(0);
    for (const opacity of opacities) {
      expect(opacity, `grain opacity ${opacity} must be <= 0.02 (2%)`).toBeLessThanOrEqual(0.02);
    }
  });
});
