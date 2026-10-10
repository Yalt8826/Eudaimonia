// Pure torn-shape helpers shared by TornSheet and its tests. Kept out of the
// component file so it exports only components (react-refresh rule).

/** Deterministic PRNG (mulberry32) so a sheet's tear never changes between renders. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Static jagged clip path: straight left/right edges (the accent rule sits
 * there cleanly), torn top and bottom. Pure function of (seed, amp) — the
 * same sheet always tears the same way. Values are percentages of the
 * element box; `amp` bounds how deep the tear bites in from top/bottom.
 */
export function tornClipPath(seed: string, amp: number, steps = 20): string {
  const rand = mulberry32(hashSeed(seed));
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * 100;
    top.push(`${x.toFixed(2)}% ${(rand() * amp).toFixed(3)}%`);
    bottom.push(`${x.toFixed(2)}% ${(100 - rand() * amp).toFixed(3)}%`);
  }
  bottom.reverse();
  return `polygon(${["0% 0%", ...top, "100% 100%", ...bottom].join(", ")})`;
}
