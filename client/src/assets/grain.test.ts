import { describe, expect, it } from "vitest";
import grainSource from "./grain.svg?raw";

// Gate 4 (01 v2 §7): the grain asset is static — no animation constructs of
// any kind — and every opacity constant stays under the ceiling. The ceiling
// is 8% as amended 2026-10-10 (01 §2 L0): the skin is crumpled black stock,
// which needs a coarse fold scale as well as fine tooth, and 2% was set when
// it was a flat field. The ceiling is bounded by the only text that sits on
// the skin — the Plaza header — which rides a dark scrim so the texture is
// not capped by it. The real bound is the rendered result, matched to the
// reference by measurement: mean 13.7 and std [4.4, 3.6, 2.7, 2.2] across
// successive 2x downsamples, against the reference's 12.5 and
// [4.6, 3.5, 2.8, 2.6]. Vite's ?raw import hands the test the asset's
// exact source at bundle time.

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

  it("is well-formed XML — a malformed asset renders as nothing", () => {
    // A double hyphen is illegal inside an XML comment, and writing a CSS
    // custom property name in one silently malforms the whole file: the
    // browser drops it and the skin goes flat black with no warning. That
    // shipped once (2026-10-10). The parser is the gate now.
    const parsed = new DOMParser().parseFromString(GRAIN, "image/svg+xml");
    const error = parsed.querySelector("parsererror");
    expect(error?.textContent ?? null, "grain.svg must parse as SVG").toBeNull();
    expect(parsed.documentElement.tagName.toLowerCase()).toBe("svg");
    // And the specific cause, named: no double hyphen inside a comment
    // BODY (the terminator's own "--" is not a match).
    for (const [, body] of GRAIN.matchAll(/<!--([\s\S]*?)-->/g)) {
      expect(body, "a double hyphen inside a comment malforms the asset").not.toContain("--");
    }
  });

  it("is an SVG noise asset (feTurbulence)", () => {
    expect(GRAIN).toMatch(/<feTurbulence/i);
  });

  it("keeps every layer zero-mean, so the skin stays black", () => {
    // feDiffuseLighting returns sin(elevation) on flat ground, not 0.5 —
    // centring a transfer on 0.5 washed the skin from #0B to #1C. Each
    // layer must map its own flat value to black.
    const transfers = [...GRAIN.matchAll(/slope="([0-9.]+)"\s+intercept="(-?[0-9.]+)"/g)].map(
      (m) => [Number.parseFloat(m[1]), Number.parseFloat(m[2])] as const,
    );
    expect(transfers.length, "both layers carry a linear transfer").toBeGreaterThanOrEqual(6);
    for (const [slope, intercept] of transfers) {
      if (slope === 0) continue; // the alpha flattener
      const flatMapsTo = slope * (-intercept / slope);
      expect(Math.abs(flatMapsTo + intercept)).toBeLessThan(1e-6);
      // Flat ground lands at black: intercept = -slope * flatValue.
      const flatValue = -intercept / slope;
      expect(flatValue).toBeGreaterThan(0.4);
      expect(flatValue).toBeLessThan(0.95);
    }
  });

  it("carries the reference's texture scales — crinkle, broad, tooth", () => {
    const frequencies = [...GRAIN.matchAll(/baseFrequency\s*=\s*["']([^"']+)["']/g)].map(
      (m) => Number.parseFloat(m[1].trim().split(/\s+/)[0]),
    );
    expect(frequencies.length, "three turbulence scales").toBeGreaterThanOrEqual(3);
    // The reference measures a dominant feature around 4.5px — a fine dense
    // crinkle, not big soft folds. A broad whisper underneath keeps the
    // texture from vanishing under downsampling the way folds-only did.
    expect(Math.min(...frequencies), "a broad scale").toBeLessThan(0.05);
    expect(Math.max(...frequencies), "a fine tooth").toBeGreaterThan(0.5);
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
