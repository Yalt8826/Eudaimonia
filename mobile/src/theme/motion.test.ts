import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

import { geometry } from "./tokens";
import { MOTION, REM_PX, RING_BUBBLE_REM } from "./motion";

// 01-design-system §8, ratified 2026-10-13. The amendment legalises motion
// on INTERACTION. These are the three things it explicitly did NOT loosen,
// held here because an amendment that only grants permission is licence,
// not law — and because the half that stays forbidden had nothing enforcing
// it on this side at the moment the permission landed.

const ASSETS = join(__dirname, "..", "..", "assets", "tears");
const SRC = join(__dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("01 §8 — what the motion amendment did NOT permit", () => {
  it("the grain asset is static (§2 L0, gate 4 — unchanged by the amendment)", () => {
    const grain = readFileSync(join(ASSETS, "grain.svg"), "utf8");
    expect(grain).not.toMatch(/<animate/i);
    expect(grain).not.toMatch(/<animatemotion/i);
    expect(grain).not.toMatch(/<animatetransform/i);
    expect(grain).not.toMatch(/<script/i);
    expect(grain).not.toMatch(/\bonload\b|\bsetinterval\b|\brequestanimationframe\b/i);
    expect(grain).not.toMatch(/animation\s*:|@keyframes/i);
  });

  it("the grain asset is well-formed — a malformed one renders as nothing", () => {
    // The web client shipped a grain whose whole file was silently dropped
    // because a CSS custom property name inside an XML comment made a
    // double hyphen. It looked fine until someone measured the render.
    const grain = readFileSync(join(ASSETS, "grain.svg"), "utf8");
    const comments = grain.match(/<!--[\s\S]*?-->/g) ?? [];
    for (const c of comments) {
      expect(c.slice(4, -3)).not.toMatch(/--/);
    }
    expect(grain.trimStart().startsWith("<")).toBe(true);
  });

  it("the wake screen declares no entrance animation (§8, and law 9)", () => {
    // At 6am a five-second tap target appears; it does not arrive.
    const wake = readFileSync(join(SRC, "app", "habits", "wake.tsx"), "utf8");
    expect(wake).not.toMatch(/entering=|FadeIn|SlideIn|ZoomIn|BounceIn/);
    expect(wake).not.toMatch(/withTiming|withSpring|withDelay|withSequence/);
    expect(wake).not.toMatch(/Animated\./);
  });

  it("no motion is driven by liveness, staleness or state (§8 new ceiling)", () => {
    // Motion never conveys data. A duration or spring chosen FROM a state
    // value is that ceiling being crossed, so the two must never meet in
    // one expression.
    const offenders: string[] = [];
    for (const file of walk(SRC).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))) {
      const text = readFileSync(file, "utf8");
      for (const line of text.split("\n")) {
        const animates = /withTiming|withSpring|withDelay|duration\s*[:=]|stiffness|damping/.test(line);
        const data = /\b(age_minutes|stale|liveness|alive|dead|paused|dormant|coverage)\b/i.test(line);
        if (animates && data) offenders.push(`${file.replace(SRC, "src")}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("01 §8 — the numbers the amendment runs on (MOTION)", () => {
  /** The §8 band metric. Deliberately a function: the next test proves it
      REJECTS wrong values, per the verification rule that a metric proven
      only on good input is not trusted. */
  function inStateChangeBand(ms: number): boolean {
    return ms >= 150 && ms <= 200;
  }

  it("the band metric itself fails on deliberately wrong durations", () => {
    expect(inStateChangeBand(149)).toBe(false); // 1ms short must fail
    expect(inStateChangeBand(201)).toBe(false); // 1ms long must fail
    expect(inStateChangeBand(100)).toBe(false);
    expect(inStateChangeBand(300)).toBe(false);
    expect(inStateChangeBand(150)).toBe(true);
    expect(inStateChangeBand(200)).toBe(true);
  });

  it("the one state-change duration sits in the §8 band", () => {
    expect(inStateChangeBand(MOTION.stateChangeMs)).toBe(true);
    console.log(`motion: stateChangeMs=${MOTION.stateChangeMs} (band 150-200)`);
  });

  it("gesture thresholds match PHASE-M §M4 exactly", () => {
    expect(MOTION.holdMs).toBe(150); // press-and-HOLD ~150ms
    expect(MOTION.dragOpenPx).toBe(10); // a drag past ~10px
    expect(MOTION.tapSlopPx).toBe(MOTION.dragOpenPx); // one slop, two consequences
    console.log(
      `motion: holdMs=${MOTION.holdMs} dragOpenPx=${MOTION.dragOpenPx} tapSlopPx=${MOTION.tapSlopPx}`,
    );
  });

  it("the selection dead zone brackets the open anchor's footprint", () => {
    // the open anchor is 3rem, half = 24: the zone must clear it ...
    const openAnchorHalf = (RING_BUBBLE_REM * REM_PX) / 2;
    // ... and stay well short of the inner spokes' near edge (inner radius
    // 5.4rem minus half a 3rem bubble)
    const innerSpokeNearEdge = 5.4 * REM_PX - openAnchorHalf;
    expect(MOTION.selectDeadZonePx).toBeGreaterThanOrEqual(openAnchorHalf);
    expect(MOTION.selectDeadZonePx).toBeLessThan(innerSpokeNearEdge);
    console.log(
      `motion: selectDeadZonePx=${MOTION.selectDeadZonePx} ` +
        `(open anchor half ${openAnchorHalf}, inner spoke near edge ${innerSpokeNearEdge})`,
    );
  });

  it("the ring bubble is the dot bubble — six bubbles, all 3rem", () => {
    expect(RING_BUBBLE_REM * REM_PX).toBe(geometry.navBubbleSizes.dot);
  });

  it("the root Stack presents every route with NO animation (law 9 via §8)", () => {
    // The root Stack declares animation "none" as its DEFAULT — the one
    // switch that keeps the wake route entrance-free (a named
    // <Stack.Screen> override for wake was tried and REVERTED: declaring
    // the child regressed cold-start routing on device — "/" landed on
    // /habits/wake instead of the Plaza. The default covers wake; the
    // wake screen itself carries no animation constructs, asserted above.)
    const layout = readFileSync(join(SRC, "app", "_layout.tsx"), "utf8");
    expect(layout).toMatch(/animation:\s*"none"/);
    expect(layout).not.toMatch(/<Stack\.Screen/);
  });

  it("the shell transition is ScreenFade at the §8 duration, and wake is outside it", () => {
    const shell = readFileSync(join(SRC, "app", "(shell)", "_layout.tsx"), "utf8");
    expect(shell).toMatch(/ScreenFade/);
    const fade = readFileSync(join(SRC, "navigation", "ScreenFade.tsx"), "utf8");
    expect(fade).toMatch(/FadeIn\.duration\(MOTION\.stateChangeMs\)/);
    // the wake route must never pass through the shell's fade: structurally,
    // it lives OUTSIDE the (shell) group — the file-tree fact the chrome
    // law (routes.test) also asserts at runtime
    expect(existsSync(join(SRC, "app", "habits", "wake.tsx"))).toBe(true);
    expect(existsSync(join(SRC, "app", "(shell)", "habits", "wake.tsx"))).toBe(false);
  });
});
