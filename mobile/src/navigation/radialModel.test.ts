import { describe, expect, it } from "@jest/globals";

import {
  MOTION,
  REM_PX,
  RING_BUBBLE_REM,
  RING_SPOKES,
  selectSpokeByAngle,
  spokeOffsetPx,
  spokeTravelPx,
} from "../theme/motion";
import { RadialGesture, initialState, step } from "./radialModel";

// PHASE-M §M4 — the radial gesture's laws, measured. The machine and the
// geometry are pure, so these are the REAL numbers the ring runs on, not
// mocks of them: offsets to 1e-3 px, every threshold boundary, and the
// collision arithmetic that makes the two alternating radii mandatory.
// Verification rule: a metric that cannot fail is not a metric — each
// section includes deliberately wrong inputs that must be rejected.

const close = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;

/** Pointer probe at a given math angle (90 = up, 180 = left) and distance. */
function probe(angleDeg: number, dist: number): { dx: number; dy: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { dx: dist * Math.cos(rad), dy: -dist * Math.sin(rad) };
}

describe("the ring geometry (PHASE-M §M4, theme/motion.ts)", () => {
  it("six bubbles, all 3rem — the ring bubble IS the dot bubble", () => {
    expect(RING_BUBBLE_REM).toBe(3);
    expect(RING_BUBBLE_REM * REM_PX).toBe(48);
  });

  it("five spokes, top to left: More, Settings, Plaza, Week, Inbox", () => {
    expect(RING_SPOKES.map((s) => s.key)).toEqual([
      "more",
      "settings",
      "plaza",
      "week",
      "inbox",
    ]);
    expect(RING_SPOKES.map((s) => s.angleDeg)).toEqual([90, 112.5, 135, 157.5, 180]);
  });

  it("every spoke sits on ONE radius — it is a circle, and the radius is the one that fits", () => {
    const radii = RING_SPOKES.map((s) => s.radiusRem);
    expect(new Set(radii).size).toBe(1);

    // Why this radius and not a smaller one. Adjacent centres are a chord
    // apart, 2·R·sin(11.25°) at the 22.5° step. The bubbles are 3rem, so
    // the chord must exceed 3rem or neighbours overlap.
    const chord = (rem: number) => 2 * rem * Math.sin((11.25 * Math.PI) / 180);
    const R = radii[0];
    // a real gap, not a hairline: 0.4rem (6.4dp) clear between neighbours
    expect(chord(R) - RING_BUBBLE_REM).toBeGreaterThanOrEqual(0.4);

    // The previous layout alternated 8.2/5.4 to fake the room. It fitted,
    // but a staggered arc is not a ring — the outer spokes read as thrown
    // out of it. On ONE radius 8.2rem is what the alternation was hiding:
    // the bubbles clear each other by 0.2rem, about 3dp, which reads as
    // touching.
    expect(chord(8.2) - RING_BUBBLE_REM).toBeLessThan(0.25);
  });

  it("spoke centres sit at their radius and angle, anchor-relative", () => {
    // dy negative = upward on screen. ONE radius, 8.8rem = 140.8px, so
    // every magnitude below is the same — that IS the circle, and the
    // numbers say so: hypot is 140.8 for all five.
    const expected: Record<string, [number, number]> = {
      more: [0, -140.8],
      settings: [-53.882, -130.082], // 140.8·cos112.5°, −140.8·sin112.5°
      plaza: [-99.561, -99.561],
      week: [-130.082, -53.882],
      inbox: [-140.8, 0],
    };
    for (const s of RING_SPOKES) {
      const { dx, dy } = spokeOffsetPx(s);
      expect(close(dx, expected[s.key][0])).toBe(true);
      expect(close(dy, expected[s.key][1])).toBe(true);
      // the circle, asserted as a circle: equidistant from the anchor
      expect(close(Math.hypot(dx, dy), 140.8)).toBe(true);
    }
  });

  it("the folded cluster IS the collapsed arc — travel endpoints, px", () => {
    // mirrors BubbleCluster's FOLDED_CENTRE (centres relative to the anchor
    // centre, leftward/upward positive): the column on the 90° ray, the row
    // on the 180° ray. If either side changes, this breaks loudly.
    const folded = {
      more: { left: 0, up: 120 },
      settings: { left: 0, up: 65.6 },
      plaza: { left: 65.6, up: 0 },
      week: { left: 120, up: 0 },
      inbox: { left: 174.4, up: 0 },
    };
    const expectedTravel: Record<string, [number, number]> = {
      more: [0, -20.8], // rises to the 90° slot
      settings: [-53.882, -64.482], // swings off the column onto the arc
      plaza: [-33.961, -99.561], // the long diagonal: row → arc crown
      week: [-10.082, -53.882],
      inbox: [33.6, 0], // the row's end slides out to the 180° slot
    };
    for (const s of RING_SPOKES) {
      const f = folded[s.key];
      const t = spokeTravelPx(-f.left, -f.up, s);
      expect(close(t.dx, expectedTravel[s.key][0])).toBe(true);
      expect(close(t.dy, expectedTravel[s.key][1])).toBe(true);
    }
  });
});

describe("selection BY ANGLE (PHASE-M §M4: wedges, not hit-testing)", () => {
  it("each spoke's wedge midpoint selects THAT spoke and neither neighbour", () => {
    const want = ["more", "settings", "plaza", "week", "inbox"];
    for (let i = 0; i < RING_SPOKES.length; i++) {
      const got = selectSpokeByAngle(
        probe(RING_SPOKES[i].angleDeg, 200).dx,
        probe(RING_SPOKES[i].angleDeg, 200).dy,
      );
      expect(got).toBe(want[i]);
      // the metric must FAIL on wrong input: the probe of one spoke is
      // neither of its arc neighbours
      if (i > 0) expect(got).not.toBe(want[i - 1]);
      if (i < want.length - 1) expect(got).not.toBe(want[i + 1]);
    }
  });

  it("wedge boundaries sit at the midpoints (pinned to ±1°; the exact edge is measure-zero)", () => {
    // A boundary probe through cos/atan2 round-trips in float noise, so the
    // exact midpoint is pinned by its two STABLE sides instead — the wedge
    // flips within a degree of the computed boundary, which is the law.
    expect(selectSpokeByAngle(probe(100.25, 200).dx, probe(100.25, 200).dy)).toBe("more");
    expect(selectSpokeByAngle(probe(102.25, 200).dx, probe(102.25, 200).dy)).toBe("settings");
    expect(selectSpokeByAngle(probe(122.75, 200).dx, probe(122.75, 200).dy)).toBe("settings");
    expect(selectSpokeByAngle(probe(124.75, 200).dx, probe(124.75, 200).dy)).toBe("plaza");
    expect(selectSpokeByAngle(probe(145.25, 200).dx, probe(145.25, 200).dy)).toBe("plaza");
    expect(selectSpokeByAngle(probe(147.25, 200).dx, probe(147.25, 200).dy)).toBe("week");
    expect(selectSpokeByAngle(probe(167.75, 200).dx, probe(167.75, 200).dy)).toBe("week");
    expect(selectSpokeByAngle(probe(169.75, 200).dx, probe(169.75, 200).dy)).toBe("inbox");
  });

  it("out to infinity — and around the wrap", () => {
    // distance is unlimited past the dead zone
    expect(selectSpokeByAngle(probe(150, 5000).dx, probe(150, 5000).dy)).toBe("week");
    // angles outside [78.75°, 191.25°] wrap to the nearest spoke in angle
    expect(selectSpokeByAngle(probe(45, 200).dx, probe(45, 200).dy)).toBe("more");
    expect(selectSpokeByAngle(probe(270, 200).dx, probe(270, 200).dy)).toBe("inbox");
    // 315° is equidistant from More(90°) and Inbox(180°) — a measure-zero
    // tie; its two stable sides pin the wrap deterministically
    expect(selectSpokeByAngle(probe(313, 200).dx, probe(313, 200).dy)).toBe("inbox");
    expect(selectSpokeByAngle(probe(317, 200).dx, probe(317, 200).dy)).toBe("more");
  });

  it("the dead zone is real and bounded — a wrong input must not select", () => {
    expect(selectSpokeByAngle(0, 0)).toBeNull();
    expect(selectSpokeByAngle(24, 0)).toBeNull(); // inside the 32px zone
    // just past it, selection exists — the zone is bounded, not the world
    const justPast = selectSpokeByAngle(40, -40); // 56.6px, 45°
    expect(justPast).toBe("more");
  });
});

describe("the radial gesture machine (radialModel.ts)", () => {
  const down = (t = 0) => ({ type: "down", t }) as const;
  const move = (t: number, dx: number, dy: number) => ({ type: "move", t, dx, dy }) as const;
  const up = (t: number, dx = 0, dy = 0) => ({ type: "up", t, dx, dy }) as const;
  // the native handler crossed either threshold (hold elapsed OR drag past
  // the slop) — both arrive as this one event
  const activated = { type: "activated" } as const;

  it("a quick tap stays a plain tap through to /capture", () => {
    const r = new RadialGesture();
    expect(r.send(down(0))).toEqual([]);
    const actions = r.send(up(90, 1, 0));
    expect(actions).toEqual([{ kind: "captureTap" }]);
    expect(r.state.phase).toBe("idle");
  });

  it("a release while still pressing is a tap — the PHASE decides, not a clock", () => {
    // Being in "pressing" at release already means the fan never opened:
    // the hold would have arrived as "activated" and a drag past the slop
    // opens in the move branch. So duration is not re-tested here.
    //
    // It used to be, and that cost /capture its tap on device: the hold is
    // a JS timer and these timestamps come from the JS thread, so a ~100ms
    // physical tap under load measured >150ms while its own 150ms timer
    // had not yet fired. Two clocks, one race, no tap. The duration below
    // is deliberately LONGER than holdMs to pin that this no longer
    // matters.
    expect(step(initialState(), down(0)).actions).toEqual([]);
    const slow = step({ phase: "pressing", startedAt: 0, selection: null }, up(MOTION.holdMs + 500, 0, 0));
    expect(slow.actions).toEqual([{ kind: "captureTap" }]);
    expect(slow.state.phase).toBe("idle");
    // 1px under the slop is still a tap
    expect(
      step({ phase: "pressing", startedAt: 0, selection: null }, up(10, MOTION.tapSlopPx - 1, 0)).actions,
    ).toEqual([{ kind: "captureTap" }]);
    // past the slop with no intervening move: noise — never a tap, never an act
    const flick = step({ phase: "pressing", startedAt: 0, selection: null }, up(50, -50, 0));
    expect(flick.actions).toEqual([]);
    expect(flick.state.phase).toBe("idle");
  });

  it("press-and-HOLD activates the fan; release on nothing folds it back", () => {
    const r = new RadialGesture();
    r.send(down(0));
    expect(r.send(activated)).toEqual([
      { kind: "openFan" },
      { kind: "select", spoke: null },
    ]);
    expect(r.state.phase).toBe("open");
    expect(r.send(up(400, 2, 0))).toEqual([{ kind: "fold" }]);
    expect(r.state.phase).toBe("idle");
  });

  it("a drag past 10px activates too — same event, sooner", () => {
    // on device the native activeOffset fires "activated" after ~10px of
    // drag; the machine cannot tell it from the hold path, and must not
    const r = new RadialGesture();
    r.send(down(0));
    // sub-threshold drift stays a press...
    expect(r.send(move(40, -9.9, 0))).toEqual([]);
    // ...but activation from the drag path opens the fan identically
    expect(r.send(activated)).toEqual([
      { kind: "openFan" },
      { kind: "select", spoke: null },
    ]);
    // and the finger, still travelling, selects by angle immediately
    expect(r.send(move(75, -200, 0))).toEqual([{ kind: "select", spoke: "inbox" }]);
    expect(r.send(up(80, -200, 0))).toEqual([{ kind: "act", spoke: "inbox" }, { kind: "fold" }]);
  });

  it("release on a spoke acts and folds; the machine absorbs a repeated up", () => {
    const r = new RadialGesture();
    r.send(down(0));
    r.send(activated);
    r.send(move(200, -200, 0)); // inbox wedge
    const actions = r.send(up(300, -200, 0));
    expect(actions).toEqual([{ kind: "act", spoke: "inbox" }, { kind: "fold" }]);
    expect(r.state.phase).toBe("idle");
    // the touch stream AND the handler's finalize may both report the lift
    expect(r.send(up(301, -200, 0))).toEqual([]);
  });

  it("selection tracks the finger, and the dead zone clears it", () => {
    const r = new RadialGesture();
    r.send(down(0));
    r.send(activated);
    expect(r.send(move(200, -200, -40)).slice(-1)).toEqual([{ kind: "select", spoke: "week" }]);
    expect(r.send(move(210, -20, -120)).slice(-1)).toEqual([{ kind: "select", spoke: "more" }]);
    // dragged back onto the anchor: no wedge owns it
    expect(r.send(move(220, 5, -5))).toEqual([{ kind: "select", spoke: null }]);
    expect(r.state.selection).toBeNull();
    expect(r.send(up(260, 5, -5))).toEqual([{ kind: "fold" }]);
  });

  it("cancel folds only what is open", () => {
    const pressing = new RadialGesture();
    pressing.send(down(0));
    expect(pressing.send({ type: "cancel" })).toEqual([]);
    expect(pressing.state.phase).toBe("idle");

    const open = new RadialGesture();
    open.send(down(0));
    open.send(activated);
    expect(open.send({ type: "cancel" })).toEqual([{ kind: "fold" }]);
    expect(open.state.phase).toBe("idle");
  });
});
