import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The contrast lint COMPUTES, it does not transcribe (T0.4): it parses the
// hexes out of theme.css at test time, composites the glass fill over the
// matte base per channel, computes every WCAG ratio, and asserts the floors
// from 01 v2 §7 gate 1 — >=4.5 text/ink, >=3.0 non-text paper dots — with
// the measured column of 01 §1 in every assertion message (tolerance 0.3).
// A failing assertion means a token is wrong, never that the floor is strict.

// vitest's import.meta.url is not a file:// URL under jsdom, so anchor on
// cwd (pnpm runs the suites from client/) with a repo-root fallback.
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

const CSS = readRepoFile("src/theme.css");

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function rootBlock(): string {
  const match = /:root\s*\{([^}]*)\}/.exec(CSS);
  expect(match, ":root block must exist in theme.css").not.toBeNull();
  return match?.[1] ?? "";
}

function customProps(block: string): Map<string, string> {
  const props = new Map<string, string>();
  for (const match of block.matchAll(/--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
    props.set(`--${match[1]}`, match[2].trim());
  }
  return props;
}

const ROOT = customProps(rootBlock());

function token(name: string): Rgba {
  const raw = ROOT.get(name);
  if (raw === undefined) throw new Error(`missing token ${name} in :root`);
  return parseColor(raw);
}

function parseColor(raw: string): Rgba {
  const value = raw.trim();
  const hex = /^#([0-9a-fA-F]{6})$/.exec(value);
  if (hex !== null) {
    const n = Number.parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgb !== null) {
    const parts = rgb[1].split(",").map((part) => Number.parseFloat(part.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  throw new Error(`unparseable color in theme.css: "${raw}"`);
}

/** Alpha compositing, per channel (glass fill = white @6% over the base). */
function compositeOver(top: Rgba, bottom: Rgba): Rgba {
  const channel = (t: number, b: number): number => t * top.a + b * bottom.a * (1 - top.a);
  return {
    r: channel(top.r, bottom.r),
    g: channel(top.g, bottom.g),
    b: channel(top.b, bottom.b),
    a: top.a + bottom.a * (1 - top.a),
  };
}

function channelLuminance(channel: number): number {
  const s = channel / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance(color: Rgba): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

function contrastRatio(fg: Rgba, bg: Rgba): number {
  const lf = relativeLuminance(fg);
  const lb = relativeLuminance(bg);
  const [hi, lo] = lf >= lb ? [lf, lb] : [lb, lf];
  return (hi + 0.05) / (lo + 0.05);
}

const BG = token("--bg");
const GLASS = compositeOver(token("--glass-fill"), BG);
const CREAM = token("--paper-cream");

const TOLERANCE = 0.3;
const TEXT_FLOOR = 4.5;
const NON_TEXT_FLOOR = 3.0;

/** [token, surface, measured CR from 01 §1] — text/ink tier, floor >= 4.5. */
const TEXT_PAIRS: ReadonlyArray<readonly [string, Rgba, number, string]> = [
  ["--text", GLASS, 14.83, "on glass"],
  ["--muted", GLASS, 6.15, "on glass"],
  ["--accent-1", GLASS, 9.34, "on glass"],
  ["--accent-2", GLASS, 5.57, "on glass"],
  ["--accent-2-ink", CREAM, 5.98, "on cream"],
];

/** [tint token, measured ink CR from 01 §1] — warm dark ink over each tint. */
const PAPER_INK_PAIRS: ReadonlyArray<readonly [string, number]> = [
  ["--paper-cream", 12.43],
  ["--paper-mint", 12.16],
  ["--paper-sky", 12.19],
  ["--paper-blush", 12.06],
  ["--paper-butter", 12.58],
];

/** [token, measured CR from 01 §1] — state glass tier, floor >= 4.5. */
const STATE_GLASS_PAIRS: ReadonlyArray<readonly [string, number]> = [
  ["--alive-glass", 6.85],
  ["--dead-glass", 5.19],
  ["--paused-glass", 6.89],
];

/** [token, measured CR from 01 §1] — state paper dots, floor >= 3.0 non-text. */
const STATE_PAPER_PAIRS: ReadonlyArray<readonly [string, number]> = [
  ["--alive-paper", 3.26],
  ["--dead-paper", 3.75],
  ["--paused-paper", 4.22],
];

describe("contrast lint (01 v2 §7 gate 1) — computed, not transcribed", () => {
  it("parses a non-empty :root palette out of theme.css", () => {
    expect(ROOT.size).toBeGreaterThanOrEqual(21);
  });

  for (const [name, surface, measured, where] of TEXT_PAIRS) {
    it(`${name} ${where}: >= ${TEXT_FLOOR} (measured ${measured})`, () => {
      const ratio = contrastRatio(token(name), surface);
      expect(
        ratio,
        `${name} ${where}: computed ${ratio.toFixed(2)}, measured ${measured} (01 §1)`,
      ).toBeGreaterThanOrEqual(TEXT_FLOOR);
      expect(
        Math.abs(ratio - measured),
        `${name} ${where}: computed ${ratio.toFixed(2)} drifted from measured ${measured} — check the compositing, never soften the floor`,
      ).toBeLessThanOrEqual(TOLERANCE);
    });
  }

  for (const [surfaceToken, measured] of PAPER_INK_PAIRS) {
    it(`--paper-ink on ${surfaceToken}: >= ${TEXT_FLOOR} (measured ${measured})`, () => {
      const ratio = contrastRatio(token("--paper-ink"), token(surfaceToken));
      expect(
        ratio,
        `--paper-ink on ${surfaceToken}: computed ${ratio.toFixed(2)}, measured ${measured} (01 §1)`,
      ).toBeGreaterThanOrEqual(TEXT_FLOOR);
      expect(
        Math.abs(ratio - measured),
        `--paper-ink on ${surfaceToken}: computed ${ratio.toFixed(2)} drifted from measured ${measured} — check the compositing, never soften the floor`,
      ).toBeLessThanOrEqual(TOLERANCE);
    });
  }

  for (const [name, measured] of STATE_GLASS_PAIRS) {
    it(`${name} on glass: >= ${TEXT_FLOOR} (measured ${measured})`, () => {
      const ratio = contrastRatio(token(name), GLASS);
      expect(
        ratio,
        `${name} on glass: computed ${ratio.toFixed(2)}, measured ${measured} (01 §1)`,
      ).toBeGreaterThanOrEqual(TEXT_FLOOR);
      expect(
        Math.abs(ratio - measured),
        `${name} on glass: computed ${ratio.toFixed(2)} drifted from measured ${measured} — check the compositing, never soften the floor`,
      ).toBeLessThanOrEqual(TOLERANCE);
    });
  }

  for (const [name, measured] of STATE_PAPER_PAIRS) {
    it(`${name} on cream: >= ${NON_TEXT_FLOOR} non-text (measured ${measured})`, () => {
      const ratio = contrastRatio(token(name), CREAM);
      expect(
        ratio,
        `${name} on cream: computed ${ratio.toFixed(2)}, measured ${measured} (01 §1)`,
      ).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
      expect(
        Math.abs(ratio - measured),
        `${name} on cream: computed ${ratio.toFixed(2)} drifted from measured ${measured} — check the compositing, never soften the floor`,
      ).toBeLessThanOrEqual(TOLERANCE);
    });
  }
});
