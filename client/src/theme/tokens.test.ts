import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Gate 2 (01 v2 §7): every 01 §1 token name resolves in :root of theme.css,
// and every state x surface ink-pair exists as a PAIR — state x {glass,
// paper}, plum x {glass, paper}. Dormancy has no token of its own: it
// renders --muted on every surface, and that absence is asserted too.

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

function blockFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(CSS);
  expect(match, `${selector} block must exist in theme.css`).not.toBeNull();
  return match?.[1] ?? "";
}

function customProps(block: string): Map<string, string> {
  const props = new Map<string, string>();
  for (const match of block.matchAll(/--([a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)) {
    props.set(`--${match[1]}`, match[2].trim());
  }
  return props;
}

const ROOT = customProps(blockFor(":root"));
const AURORA = customProps(blockFor('[data-theme="aurora"]'));

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
  it("resolves every 01 §1 token name in :root", () => {
    for (const name of ALL_TOKENS) {
      const value = ROOT.get(name);
      expect(value, `${name} must resolve in :root`).toBeDefined();
      expect(value?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("keeps every state x surface ink-pair as a pair", () => {
    for (const state of STATES) {
      expect(ROOT.has(`--${state}-glass`), `--${state}-glass must exist`).toBe(true);
      expect(ROOT.has(`--${state}-paper`), `--${state}-paper must exist`).toBe(true);
    }
  });

  it("keeps the plum pair as a pair: glass + paper", () => {
    expect(ROOT.has("--accent-2"), "--accent-2 (plum on glass) must exist").toBe(true);
    expect(ROOT.has("--accent-2-ink"), "--accent-2-ink (plum on paper) must exist").toBe(true);
  });

  it("has no dormant token — dormancy renders --muted on every surface", () => {
    const dormant = [...ROOT.keys()].filter((name) => name.startsWith("--dormant"));
    expect(dormant, "dormancy must never become a state hue").toEqual([]);
    expect(ROOT.has("--muted"), "dormant renders the muted tier").toBe(true);
    expect(CSS, "the muted-tier ruling is noted in a comment").toMatch(/dormant/i);
  });

  it("ships the v1 Aurora picker entry as its own token block", () => {
    for (const name of AURORA_TOKENS) {
      expect(AURORA.has(name), `${name} must exist in [data-theme="aurora"]`).toBe(true);
    }
  });

  it("actually flips the base — aurora's bg differs from the matte base", () => {
    expect(AURORA.get("--bg")).not.toBe(ROOT.get("--bg"));
  });

  it("leaves state colors palette-invariant — aurora never redefines them", () => {
    for (const state of STATES) {
      expect(AURORA.has(`--${state}-glass`)).toBe(false);
      expect(AURORA.has(`--${state}-paper`)).toBe(false);
    }
  });
});
