import { afterAll, describe, expect, it } from "@jest/globals";
import { colors, dotWell, lipBands } from "./tokens";

// The contrast lint COMPUTES, it does not transcribe (T0.4): it reads the
// hexes out of src/theme/tokens.ts (the port of theme.css), composites the
// glass fill over the matte base per channel, computes every WCAG ratio,
// and asserts the floors from 01 v2 §7 gate 1 — >=4.5 text/ink, >=3.0
// non-text paper dots — with the measured column of 01 §1 in every
// assertion message (tolerance 0.3). A failing assertion means a token is
// wrong, never that the floor is strict.

// Jest has no expect(value, message) form (the web suite is vitest), so
// the web suite's failure messages ride this helper.
function assertThat(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function token(name: keyof typeof colors): Rgba {
  return parseColor(colors[name]);
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
  throw new Error(`unparseable color in tokens.ts: "${raw}"`);
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
const TEXT_PAIRS: ReadonlyArray<readonly [keyof typeof colors, Rgba, number, string]> = [
  ["--text", GLASS, 14.83, "on glass"],
  ["--muted", GLASS, 6.15, "on glass"],
  ["--accent-1", GLASS, 9.34, "on glass"],
  ["--accent-2", GLASS, 5.57, "on glass"],
  ["--accent-2-ink", CREAM, 5.98, "on cream"],
  // The Plaza's greeting is a teal->plum gradient clipped to the text, so
  // BOTH endpoints are the heading's colour somewhere along its length and
  // both must clear the floor against the page itself, not against glass.
  ["--accent-1", BG, 10.57, "on the page (greeting gradient start)"],
  ["--accent-2", BG, 6.30, "on the page (greeting gradient end)"],
];

/**
 * [accent token, sheet token, measured CR] — the hue-law accent painted
 * onto the sheet that carries it. Non-text, floor >= 3.0.
 */
const ACCENT_SHEET_PAIRS: ReadonlyArray<
  readonly [keyof typeof colors, keyof typeof colors, number]
> = [
  ["--accent-1-ink", "--sheet-mint", 3.58],
  ["--accent-2-ink", "--sheet-lavender", 3.55],
];

/** [tint token, measured ink CR from 01 §1] — warm dark ink over each tint. */
const PAPER_INK_PAIRS: ReadonlyArray<readonly [keyof typeof colors, number]> = [
  // Section tints resampled from the ratified mockup 2026-10-10 and
  // remeasured here; cream keeps its original value and stays the reading
  // surface, where 500+ words need a pale ground (01 §1, two-tier note).
  ["--paper-cream", 12.43],
  ["--paper-mint", 8.59],
  ["--paper-sky", 7.4],
  ["--paper-blush", 7.7],
  ["--paper-butter", 9.4],
  ["--paper-violet", 5.85],
];

/** The saturated section tints — every state dot on them needs a well. */
const SECTION_TINTS = [
  "--paper-mint",
  "--paper-sky",
  "--paper-blush",
  "--paper-butter",
  "--paper-violet",
] as const;

/** The five sheets the Plaza actually renders (spec §2.1 palette). */
const SHEET_TINTS = [
  "--sheet-mint",
  "--sheet-sky",
  "--sheet-blush",
  "--sheet-butter",
  "--sheet-lavender",
] as const;

/** [token, measured CR from 01 §1] — state glass tier, floor >= 4.5. */
const STATE_GLASS_PAIRS: ReadonlyArray<readonly [keyof typeof colors, number]> = [
  ["--alive-glass", 6.85],
  ["--dead-glass", 5.19],
  ["--paused-glass", 6.89],
];

/** [token, measured CR from 01 §1] — state paper dots, floor >= 3.0 non-text. */
const STATE_PAPER_PAIRS: ReadonlyArray<readonly [keyof typeof colors, number]> = [
  ["--alive-paper", 3.26],
  ["--dead-paper", 3.75],
  ["--paused-paper", 4.22],
];

describe("contrast lint (01 v2 §7 gate 1) — computed, not transcribed", () => {
  it("resolves a non-empty palette out of tokens.ts", () => {
    expect(Object.keys(colors).length).toBeGreaterThanOrEqual(21);
  });

  it("the dot well's two layers composite to exactly the glass surface", () => {
    // theme.css: --dot-well is --glass-fill stacked over --bg. The token
    // carries the pair; this holds the pair to the surface every glass
    // assertion below measures against.
    expect(dotWell.fill).toBe(colors["--glass-fill"]);
    expect(dotWell.base).toBe(colors["--bg"]);
  });

  for (const [name, surface, measured, where] of TEXT_PAIRS) {
    it(`${name} ${where}: >= ${TEXT_FLOOR} (measured ${measured})`, () => {
      const ratio = contrastRatio(token(name), surface);
      expect(ratio).toBeGreaterThanOrEqual(TEXT_FLOOR);
      assertThat(
        Math.abs(ratio - measured) <= TOLERANCE,
        `${name} ${where}: computed ${ratio.toFixed(2)} drifted from measured ${measured} — check the compositing, never soften the floor`,
      );
    });
  }

  for (const [surfaceToken, measured] of PAPER_INK_PAIRS) {
    it(`--paper-ink on ${surfaceToken}: >= ${TEXT_FLOOR} (measured ${measured})`, () => {
      const ratio = contrastRatio(token("--paper-ink"), token(surfaceToken));
      expect(ratio).toBeGreaterThanOrEqual(TEXT_FLOOR);
      assertThat(
        Math.abs(ratio - measured) <= TOLERANCE,
        `--paper-ink on ${surfaceToken}: computed ${ratio.toFixed(2)} drifted from measured ${measured} — check the compositing, never soften the floor`,
      );
    });
  }

  for (const [name, measured] of STATE_GLASS_PAIRS) {
    it(`${name} on glass: >= ${TEXT_FLOOR} (measured ${measured})`, () => {
      const ratio = contrastRatio(token(name), GLASS);
      expect(ratio).toBeGreaterThanOrEqual(TEXT_FLOOR);
      assertThat(
        Math.abs(ratio - measured) <= TOLERANCE,
        `${name} on glass: computed ${ratio.toFixed(2)} drifted from measured ${measured} — check the compositing, never soften the floor`,
      );
    });
  }

  // The self-glass law, generalised to tinted sheets (01 §5, amended
  // 2026-10-10). Two assertions, and the first is the reason for the second:
  // the paper pair genuinely fails on these grounds, so the dot gets a well
  // back down to the matte skin and carries the GLASS pair there instead.
  describe("the nav bubbles, which float over every surface", () => {
    // A bubble is not backed by --bg: it drifts over the black skin AND
    // over all five sheets as the page scrolls. Measured on the fill
    // alone the icon reads 14.88 on the skin and 1.22 on butter, so the
    // bubble carries a veil beneath the fill. The floor has to hold on
    // the LIGHTEST paper, which is the hardest case.
    const VEIL = token("--bubble-veil");
    const FILL = token("--glass-fill");
    for (const sheet of SHEET_TINTS) {
      it(`--text on a bubble over ${sheet}: >= ${TEXT_FLOOR}`, () => {
        const surface = compositeOver(FILL, compositeOver(VEIL, token(sheet)));
        const ratio = contrastRatio(token("--text"), surface);
        expect(ratio).toBeGreaterThanOrEqual(TEXT_FLOOR);
      });
    }

    it("would fail on paper WITHOUT the veil, which is why it is there", () => {
      for (const sheet of SHEET_TINTS) {
        const ratio = contrastRatio(token("--text"), compositeOver(FILL, token(sheet)));
        assertThat(
          ratio < TEXT_FLOOR,
          `--text on bare glass over ${sheet} computes ${ratio.toFixed(2)} — if this ` +
            `ever clears ${TEXT_FLOOR}, the sheets were paled and the veil may be redundant`,
        );
      }
    });
  });

  describe("the hue-law accent on its own sheet", () => {
    // The accent marks who acts (01 §4). On paper it must use the -ink
    // pair: the raw accents are tuned for glass and the black skin, and
    // on a saturated sheet they disappear. Both assertions matter — the
    // second is why the first one exists.
    for (const [accent, sheet, measured] of ACCENT_SHEET_PAIRS) {
      it(`${accent} on ${sheet}: >= ${NON_TEXT_FLOOR} non-text (measured ${measured})`, () => {
        const ratio = contrastRatio(token(accent), token(sheet));
        expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
        assertThat(
          Math.abs(ratio - measured) <= TOLERANCE,
          `${accent} on ${sheet}: computed ${ratio.toFixed(2)} drifted from ${measured}`,
        );
      });
    }

    it("the RAW accents would be invisible there, which is why the pairs exist", () => {
      for (const [raw, sheet] of [
        ["--accent-1", "--sheet-mint"],
        ["--accent-2", "--sheet-lavender"],
      ] as const) {
        const ratio = contrastRatio(token(raw), token(sheet));
        assertThat(
          ratio < NON_TEXT_FLOOR,
          `${raw} on ${sheet} computes ${ratio.toFixed(2)} — if this ever clears ` +
            `${NON_TEXT_FLOOR}, the sheet was paled and the -ink pair may be redundant`,
        );
      }
    });
  });

  describe("state dots on saturated section tints", () => {
    it("would fail the non-text floor if painted straight onto the tint", () => {
      for (const tintToken of SECTION_TINTS) {
        const ratio = contrastRatio(token("--alive-paper"), token(tintToken));
        assertThat(
          ratio < NON_TEXT_FLOOR,
          `--alive-paper on ${tintToken} computes ${ratio.toFixed(2)} — if this ever ` +
            `clears ${NON_TEXT_FLOOR}, the tint was paled and the well may be redundant`,
        );
      }
    });

    it("clears it in the dot well, which is the glass surface", () => {
      for (const name of ["--alive-glass", "--dead-glass", "--paused-glass", "--muted"] as const) {
        const ratio = contrastRatio(token(name), GLASS);
        expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
      }
    });
  });

  for (const [name, measured] of STATE_PAPER_PAIRS) {
    it(`${name} on cream: >= ${NON_TEXT_FLOOR} non-text (measured ${measured})`, () => {
      const ratio = contrastRatio(token(name), CREAM);
      expect(ratio).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
      assertThat(
        Math.abs(ratio - measured) <= TOLERANCE,
        `${name} on cream: computed ${ratio.toFixed(2)} drifted from measured ${measured} — check the compositing, never soften the floor`,
      );
    });
  }

  it("the five skin lip bands are the measured ramp 32/26/21/17/13, down into the body", () => {
    // theme.css: "this ramp 32 / 26 / 21 / 17 / 13", and anything tracing
    // the contour above luminance 40 reads as a rim (preserved README,
    // rule 4). Luminance here is channel-space luma, the scale the comment
    // measured on (#6E6E74 → 110.5, its documented 110).
    expect(lipBands).toHaveLength(5);
    const RAMP = [32, 26, 21, 17, 13];
    let previous = Infinity;
    lipBands.forEach((name, i) => {
      const c = token(name);
      const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      assertThat(
        Math.abs(lum - RAMP[i]) <= 1,
        `${name}: luma ${lum.toFixed(1)} drifted from the measured band ${RAMP[i]}`,
      );
      assertThat(
        lum <= 40,
        `${name}: luma ${lum.toFixed(1)} must stay under 40 (the rim line)`,
      );
      assertThat(
        lum < previous,
        `${name}: must step DOWN from the band before it (${previous.toFixed(1)})`,
      );
      previous = lum;
    });
  });

  afterAll(() => {
    // Numbers printed, not just asserted — the phase's exit evidence is a
    // measured table, so the run leaves one in the log.
    const rows: Array<[string, number, number]> = [
      ["--text on glass", contrastRatio(token("--text"), GLASS), 14.83],
      ["--muted on glass", contrastRatio(token("--muted"), GLASS), 6.15],
      ["--accent-1 on glass", contrastRatio(token("--accent-1"), GLASS), 9.34],
      ["--accent-2 on glass", contrastRatio(token("--accent-2"), GLASS), 5.57],
      ["--accent-2-ink on cream", contrastRatio(token("--accent-2-ink"), CREAM), 5.98],
      ["--accent-1 on bg", contrastRatio(token("--accent-1"), BG), 10.57],
      ["--accent-2 on bg", contrastRatio(token("--accent-2"), BG), 6.3],
    ];
    for (const [tintToken, measured] of PAPER_INK_PAIRS) {
      rows.push([
        `--paper-ink on ${tintToken}`,
        contrastRatio(token("--paper-ink"), token(tintToken)),
        measured,
      ]);
    }
    for (const [name, measured] of STATE_GLASS_PAIRS) {
      rows.push([`${name} on glass`, contrastRatio(token(name), GLASS), measured]);
    }
    for (const [name, measured] of STATE_PAPER_PAIRS) {
      rows.push([`${name} on cream`, contrastRatio(token(name), CREAM), measured]);
    }
    for (const [accent, sheet, measured] of ACCENT_SHEET_PAIRS) {
      rows.push([`${accent} on ${sheet}`, contrastRatio(token(accent), token(sheet)), measured]);
    }
    console.log("computed contrast ratios (computed / measured in 01 §1):");
    for (const [pair, computed, measured] of rows) {
      console.log(`  ${pair.padEnd(38)} ${computed.toFixed(2)} / ${measured.toFixed(2)}`);
    }
  });
});
