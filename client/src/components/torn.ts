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

/** How many edge-mask variants `scripts/gen_torn_edges.py` emits. */
export const TORN_VARIANTS = 3;

/** The strip width the generator writes, in px — the tiling period. */
export const TORN_STRIP_WIDTH = 1600;

export interface TornEdgePlan {
  /** Which generated variant this sheet's top/bottom edge uses (1-indexed). */
  topVariant: number;
  bottomVariant: number;
  /**
   * Horizontal offset into the tiled strip, in px. Two sheets that happen to
   * draw the same variant still tear differently, because the strip is
   * seamless and can be started anywhere along its width.
   */
  topOffset: number;
  bottomOffset: number;
}

/**
 * Pick a sheet's tear deterministically: same seed, same tear, every render
 * (gate 4 — nothing here moves, and nothing is random at paint time).
 *
 * The tear itself is a raster alpha mask, not a clip path. Paper separates
 * along its fibres, which is a soft multi-scale boundary with strands pulled
 * loose; a polygon with N random vertices reads as a sawtooth however many
 * vertices it has. The masks are generated and committed by
 * `scripts/gen_torn_edges.py`.
 */
export function tornEdgePlan(seed: string): TornEdgePlan {
  const rand = mulberry32(hashSeed(seed));
  const pick = (): number => 1 + Math.floor(rand() * TORN_VARIANTS);
  // Offsets wrap inside the strip's own width; the component scales them
  // with the strip, so a sheet's tear stays put whatever the render scale.
  const offset = (): number => Math.floor(rand() * TORN_STRIP_WIDTH);
  return {
    topVariant: pick(),
    topOffset: offset(),
    bottomVariant: pick(),
    bottomOffset: offset(),
  };
}
