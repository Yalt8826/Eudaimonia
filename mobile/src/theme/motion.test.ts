import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

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
