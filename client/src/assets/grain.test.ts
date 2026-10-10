import { describe, expect, it } from "vitest";
import grainSource from "./grain.svg?raw";

// Gate 4 (01 v2 §7): the grain asset is static — no animation constructs of
// any kind — and every opacity constant stays under the ceiling. The ceiling
// is 8% as amended 2026-10-10 (01 §2 L0): the skin is crumpled black stock,
// which needs a coarse fold scale as well as fine tooth, and 2% was set when
// it was a flat field. Vite's ?raw import hands the test the asset's exact
// source at bundle time.

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

  it("carries both texture scales — the crumple and the tooth", () => {
    const frequencies = [...GRAIN.matchAll(/baseFrequency\s*=\s*["']([^"']+)["']/g)].map(
      (m) => Number.parseFloat(m[1].trim().split(/\s+/)[0]),
    );
    expect(frequencies.length, "two turbulence scales").toBeGreaterThanOrEqual(2);
    // A fold scale an order of magnitude below the tooth: without it the
    // skin is a flat field with static on top, which is what 2% looked like.
    expect(Math.min(...frequencies)).toBeLessThan(0.05);
    expect(Math.max(...frequencies)).toBeGreaterThan(0.3);
  });

  it("stays at or below the 8% opacity ceiling (amended 2026-10-10)", () => {
    const opacities = [...GRAIN.matchAll(/opacity\s*=\s*["']([0-9]*\.?[0-9]+)["']/g)].map((m) =>
      Number.parseFloat(m[1]),
    );
    expect(opacities.length, "the grain must declare its opacity constant").toBeGreaterThan(0);
    for (const opacity of opacities) {
      expect(opacity, `grain opacity ${opacity} must be <= 0.08 (8%)`).toBeLessThanOrEqual(0.08);
    }
  });
});
