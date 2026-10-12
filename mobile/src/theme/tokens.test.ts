import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { aurora, colors } from "./tokens";

// Gate 2 (01 v2 §7): every 01 §1 token name resolves in the dark palette
// (the port of theme.css :root), and every state x surface ink-pair exists
// as a PAIR — state x {glass, paper}, plum x {glass, paper}. Dormancy has
// no token of its own: it renders --muted on every surface, and that
// absence is asserted too.

// The port keeps the web test's discipline of checking the SOURCE FILE for
// the comment-backed assertions: a comment that asserts a ruling must keep
// asserting it where the next editor will read it.
const SOURCE = readFileSync(join(__dirname, "tokens.ts"), "utf8");

// Jest has no expect(value, message) form (the web suite is vitest), so
// the web suite's failure messages ride this helper.
function assertThat(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const ALL_TOKENS: readonly string[] = [
  "--bg",
  "--text",
  "--muted",
  "--accent-1",
  "--accent-2",
  "--accent-2-ink",
  "--glass-fill",
  "--glass-border",
  "--scrim",
  "--paper-cream",
  "--paper-mint",
  "--paper-sky",
  "--paper-blush",
  "--paper-butter",
  "--paper-violet",
  "--paper-ink",
  "--alive-glass",
  "--alive-paper",
  "--dead-glass",
  "--dead-paper",
  "--paused-glass",
  "--paused-paper",
];

const STATES: readonly string[] = ["alive", "dead", "paused"];

const AURORA_TOKENS: readonly string[] = [
  "--bg",
  "--text",
  "--muted",
  "--accent-1",
  "--accent-2",
  "--glass-fill",
  "--glass-border",
  "--paper-fill",
  "--scrim",
];

describe("theme tokens (01 §1, gate 2)", () => {
  it("resolves every 01 §1 token name in the dark palette", () => {
    for (const name of ALL_TOKENS) {
      const value = colors[name as keyof typeof colors];
      assertThat(
        value !== undefined && value.length > 0,
        `${name} must resolve in the dark palette`,
      );
    }
  });

  it("keeps every state x surface ink-pair as a pair", () => {
    for (const state of STATES) {
      assertThat(colors[`--${state}-glass` as keyof typeof colors] !== undefined, `--${state}-glass must exist`);
      assertThat(colors[`--${state}-paper` as keyof typeof colors] !== undefined, `--${state}-paper must exist`);
    }
  });

  it("keeps the plum pair as a pair: glass + paper", () => {
    assertThat(colors["--accent-2"] !== undefined, "--accent-2 (plum on glass) must exist");
    assertThat(colors["--accent-2-ink"] !== undefined, "--accent-2-ink (plum on paper) must exist");
  });

  it("has no dormant token — dormancy renders --muted on every surface", () => {
    const dormant = Object.keys(colors).filter((name) => name.startsWith("--dormant"));
    assertThat(dormant.length === 0, `dormancy must never become a state hue (found ${dormant})`);
    expect(colors["--muted"]).toBeDefined();
    expect(SOURCE).toMatch(/dormant/i);
  });

  it("ships the v1 Aurora picker entry as its own palette", () => {
    for (const name of AURORA_TOKENS) {
      assertThat(
        aurora[name as keyof typeof aurora] !== undefined,
        `${name} must exist in the aurora palette`,
      );
    }
  });

  it("actually flips the base — aurora's bg differs from the matte base", () => {
    expect(aurora["--bg"]).not.toBe(colors["--bg"]);
  });

  it("leaves state colors palette-invariant — aurora never redefines them", () => {
    for (const state of STATES) {
      expect(aurora[`${state}-glass` as keyof typeof aurora]).toBeUndefined();
      expect(aurora[`${state}-paper` as keyof typeof aurora]).toBeUndefined();
    }
  });
});
