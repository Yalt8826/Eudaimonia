import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The paper surface is a measured palette with a texture blended through
// it, and the blend can quietly destroy the measurement. That happened:
// `multiply` against a greyscale fibre centred on #808080 halved the
// paper's lightness — mint rendered #526B61 instead of #A9DCC7 and its ink
// contrast fell from 9.81 to 2.58, under the 4.5 floor, while every token
// in theme.css still measured fine. contrast.test.ts checks tokens; this
// checks what the component does to them.

function readRepoFile(relative: string): string {
  for (const base of [process.cwd(), join(process.cwd(), "client")]) {
    try {
      return readFileSync(join(base, relative), "utf8");
    } catch {
      // try the next base
    }
  }
  throw new Error(`cannot locate ${relative} from ${process.cwd()}`);
}

const CSS = readRepoFile("src/components/paper/torn-paper.css");

/** Blends that leave a mid-grey source pixel equal to the backdrop. */
const TINT_SAFE_BLENDS = ["soft-light", "overlay", "normal"];

/** Blends that shift a tint when the texture is centred on mid-grey. */
const TINT_DESTROYING_BLENDS = ["multiply", "darken", "color-burn", "screen", "lighten"];

describe("torn-paper.css — the component must not undo the measured palette", () => {
  it("blends the fibre texture with a mid-grey-neutral mode", () => {
    const modes = [...CSS.matchAll(/background-blend-mode:\s*([a-z-]+)/g)].map((m) => m[1]);
    expect(modes.length, "the paper blends a texture").toBeGreaterThan(0);
    for (const mode of modes) {
      expect(
        TINT_SAFE_BLENDS,
        `background-blend-mode: ${mode} shifts the paper tint against a mid-grey ` +
          `texture, which silently breaks the measured ink contrast`,
      ).toContain(mode);
      expect(TINT_DESTROYING_BLENDS).not.toContain(mode);
    }
  });

  it("takes every PAINT colour from a token, never a literal", () => {
    // A palette flip stays a token edit (01 v2 §7 gate 5). The accent-hex
    // grep only guards accent and state hexes; paper tints would slip past
    // it, so the rule is enforced here for this file.
    //
    // Two things are not paint and are exempt: comments (which quote
    // measured values on purpose), and the mask's own solid stencil, where
    // `linear-gradient(#000, #000)` is an opacity rather than a colour —
    // it says "keep these pixels", and no token could express it.
    const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const withoutMaskStencil = withoutComments.replace(/linear-gradient\(#000, #000\)/g, "");
    const hexes = [...withoutMaskStencil.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    expect(hexes, `torn-paper.css must paint from tokens, found ${hexes.join(", ")}`).toEqual([]);
  });

  it("keeps paper matte — no blur on any paper layer (spec §8)", () => {
    expect(CSS).not.toMatch(/backdrop-filter/);
    expect(CSS).not.toMatch(/filter:\s*[^;]*\bblur\(/);
  });

  it("casts the skin's edge inward, and only seats the sheet outward", () => {
    // The skin is the top layer: it falls onto the paper beneath it. A
    // sheet casting a large shadow outward would render the stack upside
    // down and read as a floating card (spec §4.3).
    expect(CSS).toContain("--skin-cast-max");
    const seat = /filter:\s*drop-shadow\(0 (\d+)px (\d+)px/.exec(CSS);
    expect(seat, "the sheet keeps a seat").not.toBeNull();
    expect(Number(seat?.[2]), "the outward shadow stays tight, not a card glow").toBeLessThanOrEqual(4);
  });

  it("reaches each replaceable asset through exactly one property (spec §6)", () => {
    for (const prop of ["--tear-top", "--tear-bottom", "--paper-fiber", "--fringe-top", "--fringe-bottom"]) {
      const declarations = [...CSS.matchAll(new RegExp(`${prop}:\\s*url\\(`, "g"))];
      expect(declarations.length, `${prop} is declared and swappable`).toBeGreaterThan(0);
    }
    // The mask and the fringe are different assets doing different jobs
    // (spec §2.3): shape versus material. Collapsing them loses the tear.
    expect(CSS).toContain("--paper-fiber: url");
    expect(CSS).toContain("--fringe-top: url");
    // The fringe must not paint a background of its own, or it covers the
    // continuous black skin it is supposed to sit on.
    const fringeRule = /\.torn-section__fringe \{[^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(fringeRule).not.toMatch(/background-color/);
    expect(fringeRule).toContain("background-image");
  });

  it("tiles the tear instead of stretching it over the section height", () => {
    // A single mask stretched over a tall section elongates the contour
    // (spec §8). Top and bottom keep natural proportions; the middle flexes.
    expect(CSS).toContain("mask-repeat: repeat-x, no-repeat, repeat-x");
    expect(CSS).toMatch(/mask-size:\s*var\(--tear-w\) var\(--tear-h\)/);
  });
});
