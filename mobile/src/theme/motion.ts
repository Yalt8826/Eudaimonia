/**
 * Motion tokens — 01-design-system §8, the motion amendment ratified
 * 2026-10-13. The amendment permits motion that a touch causes and a touch
 * can interrupt (gesture transforms, radial menus, screen transitions) and
 * explicitly did NOT loosen four things; every number below lives under
 * those four:
 *
 *   - 150–200ms for state changes  → MOTION.stateChangeMs, the ONE duration
 *     every animated state change in this client uses (fan travel, route
 *     sheet, shell screen transition).
 *   - reduce-motion drops the travel, never the state change.
 *   - no entrance animation on the wake screen (it sits outside the shell
 *     and the root Stack presents it with animation "none" — pinned in
 *     motion.test.ts, which parses the layout config).
 *   - motion never conveys data: nothing below may be chosen FROM a state
 *     value, and motion.test.ts scans every source line that names an
 *     animation construct for the data vocabulary.
 *
 * Ground rule 3: a value that a comment asserts gets a test. motion.test.ts
 * pins every number here (including proving the band metric rejects wrong
 * values); radialModel.test.ts pins the ring geometry.
 */

/** 1rem = 16 CSS px = 1 dp — tokens.ts convention. */
export const REM_PX = 16;

export const MOTION = {
  /**
   * §8: "150–200ms for state changes. A state change that takes longer is
   * not motion, it is latency with a curve on it." One number for the whole
   * client, so the band is one assertion, not a style.
   */
  stateChangeMs: 160,

  /**
   * Press-and-HOLD duration that opens the radial fan (PHASE-M §M4:
   * "~150ms"). A release before it, with travel under tapSlopPx, is a plain
   * tap and navigates through to /capture. The value feeds BOTH the native
   * handler's activateAfterLongPress (enforcement, on the UI thread) and
   * the quick-tap decision in the pure machine (radialModel.ts) — one
   * number, two consumers, one test.
   */
  holdMs: 150,

  /**
   * Drag distance, px, past which the fan opens without waiting out the
   * hold — a drag opens it sooner (PHASE-M §M4: "~10px"). Feeds the native
   * handler's activeOffsetX/Y the same way holdMs feeds
   * activateAfterLongPress.
   */
  dragOpenPx: 10,

  /**
   * Travel under this distance never opens the fan by drag; it is what
   * keeps a still finger a tap. Same number as dragOpenPx on purpose: one
   * slop, two consequences (tap through vs open).
   */
  tapSlopPx: 10,

  /**
   * Selection radius, px, around the anchor centre. Inside it the pointer
   * has no wedge: the anchor bubble's own footprint while open (3rem, half
   * = 24) plus thumb slop. Jitter on the anchor can therefore never
   * highlight a spoke. Past it, selection is by angle alone, out to
   * infinity (PHASE-M §M4).
   */
  selectDeadZonePx: 32,

  /**
   * How long the wake surface holds its confirmation before it exits
   * itself to the Plaza (T2.1, owner-measured 2026-10-24: a surface that
   * never confirms reads as a dead tap — one morning produced four events
   * from one wake). This is a HOLD, not a state-change duration: it is how
   * long the done state is guaranteed readable, not how long a transition
   * runs, so it sits outside the §8 band on purpose. Long enough to
   * register groggy; short enough to feel like the surface, not the user,
   * ended the interaction. Law 9 kept: the exit is the surface doing the
   * navigating, so the user never has to.
   */
  wakeExitHoldMs: 1200,
} as const;

/* ---- the ring (PHASE-M §M4; measured off the parked web attempt's render,
   docs/images/review/nav-ring.png) --------------------------------------- */

export type SpokeKey = "more" | "settings" | "plaza" | "week" | "inbox";

/** Six bubbles, ALL 3rem, capture anchoring the bottom-right corner. */
export const RING_BUBBLE_REM = 3;

export interface SpokeSpec {
  key: SpokeKey;
  /** Degrees, math convention: 90 = straight up, 180 = straight left. */
  angleDeg: number;
  radiusRem: number;
}

/**
 * Five spokes on ONE radius, 22.5° apart, from straight up (90°) to
 * straight left (180°) — the quarter the corner leaves free.
 *
 * It was two alternating radii (outer 8.2rem, inner 5.4rem) to keep the
 * cluster compact: five 3rem bubbles on one arc need room, and alternating
 * buys it by staggering neighbours instead of spacing them. It reads as
 * what it is — a zigzag, with the outer spokes thrown out of the ring —
 * so it is one radius now, and the radius is whatever actually fits.
 *
 * Adjacent centres sit a chord apart: 2·R·sin(11.25°). At 8.8rem that is
 * 54.9dp between 3rem (48dp) bubbles — a 6.9dp gap, the tightest true
 * circle that does not collide. 8.2rem leaves 3.2dp and they touch.
 */
const RING_RADIUS_REM = 8.8;

export const RING_SPOKES: readonly SpokeSpec[] = [
  { key: "more", angleDeg: 90, radiusRem: RING_RADIUS_REM },
  { key: "settings", angleDeg: 112.5, radiusRem: RING_RADIUS_REM },
  { key: "plaza", angleDeg: 135, radiusRem: RING_RADIUS_REM },
  { key: "week", angleDeg: 157.5, radiusRem: RING_RADIUS_REM },
  { key: "inbox", angleDeg: 180, radiusRem: RING_RADIUS_REM },
];

/**
 * Spoke centre relative to the ANCHOR centre, in screen px: dx rightward,
 * dy downward — so straight up (90°) is dx 0, dy −radius.
 */
export function spokeOffsetPx(spoke: SpokeSpec): { dx: number; dy: number } {
  const r = spoke.radiusRem * REM_PX;
  const rad = (spoke.angleDeg * Math.PI) / 180;
  return { dx: r * Math.cos(rad), dy: -r * Math.sin(rad) };
}

/**
 * Wedge selection — BY ANGLE, never by hit-testing circles (PHASE-M §M4):
 * past the selection dead zone each spoke owns the sector of pointer angles
 * nearest its own angle — boundaries at the midpoints between neighbours,
 * wrapping the whole circle — at ANY distance ("out to infinity"). Returns
 * null inside the dead zone. Angle ties (a pointer exactly on a boundary)
 * resolve to the earlier spoke in RING_SPOKES order; the test pins it.
 */
export function selectSpokeByAngle(dx: number, dy: number): SpokeKey | null {
  const distSq = dx * dx + dy * dy;
  if (distSq < MOTION.selectDeadZonePx * MOTION.selectDeadZonePx) return null;
  // screen y grows downward, so "up" is −dy; atan2 gives 90° = up
  const raw = (Math.atan2(-dy, dx) * 180) / Math.PI;
  const angle = raw < 0 ? raw + 360 : raw;
  let best: SpokeKey = RING_SPOKES[0].key;
  let bestDist = 361;
  for (const s of RING_SPOKES) {
    const d = Math.abs(angle - s.angleDeg);
    const angular = Math.min(d, 360 - d);
    if (angular < bestDist) {
      bestDist = angular;
      best = s.key;
    }
  }
  return best;
}

/**
 * Translation a spoke travels when the fan opens: from its folded cluster
 * position (centre relative to the anchor centre, screen px) to its ring
 * position. The folded column/row IS the collapsed arc — the column sits on
 * the 90° ray and the row on the 180° ray — so the fan is a rotation onto
 * the arc, not a teleport. radialModel.test.ts asserts the endpoints.
 */
export function spokeTravelPx(
  foldedDx: number,
  foldedDy: number,
  spoke: SpokeSpec,
): { dx: number; dy: number } {
  const target = spokeOffsetPx(spoke);
  return { dx: target.dx - foldedDx, dy: target.dy - foldedDy };
}
