import { describe, expect, it } from "vitest";
import litSource from "./skin-fold-lit.svg?raw";
import darkSource from "./skin-fold-dark.svg?raw";

// The matte skin's crumple (01 §2 L0, amended 2026-10-10): TWO zero-mean
// fold layers — one lit, one shadow — coarse scale for the big folds, fine
// scale inside them via octaves. Each layer's alpha is capped at the
// ratified 8% ceiling; both are static (gate 4: relief, never animation).

for (const [name, source] of [
  ["skin-fold-lit", litSource],
  ["skin-fold-dark", darkSource],
] as const) {
  describe(`${name} (01 §2 L0 amended)`, () => {
    it("is static — contains no animation constructs", () => {
      expect(source).not.toMatch(/<animate/i);
      expect(source).not.toMatch(/<animatemotion/i);
      expect(source).not.toMatch(/<animatetransform/i);
      expect(source).not.toMatch(/<script/i);
      expect(source).not.toMatch(/\bonload\b|\bsetinterval\b|\brequestanimationframe\b/i);
      expect(source).not.toMatch(/animation\s*:|@keyframes/i);
    });

    it("is fold relief — fractal noise with stitchTiles (seamless tiling)", () => {
      expect(source).toMatch(/<feTurbulence/i);
      expect(source).toMatch(/stitchTiles="stitch"/);
    });

    it("stays at or below the 13% per-layer ceiling", () => {
      const opacities = [...source.matchAll(/opacity\s*=\s*["']([0-9]*\.?[0-9]+)["']/g)].map(
        (m) => Number.parseFloat(m[1]),
      );
      expect(opacities.length, "the layer must declare its opacity constant").toBeGreaterThan(0);
      for (const opacity of opacities) {
        expect(opacity, `${name} opacity ${opacity} must be <= 0.13`).toBeLessThanOrEqual(0.13);
      }
    });

    it("maps noise into alpha — zero-mean, the skin's average stays black", () => {
      expect(source).toMatch(/feColorMatrix/i);
      const matrix = /feColorMatrix[^>]*values="([^"]+)"/.exec(source);
      expect(matrix).not.toBeNull();
      // the alpha row must derive from the noise RGB (non-zero offsets),
      // not pass the noise through as flat coverage
      const row = matrix?.[1].trim().split(/\s+/).slice(15, 20).map(Number.parseFloat);
      expect(row?.[0]).toBeGreaterThan(0);
    });
  });
}
