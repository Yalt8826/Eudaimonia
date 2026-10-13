/**
 * The radial gesture's state machine — pure, clock-injected: events in,
 * actions out. BubbleCluster.tsx feeds it from gesture-handler callbacks and
 * PERFORMS the actions (animate the fan, navigate, open the sheet); every
 * threshold the machine consults lives in theme/motion.ts and is pinned
 * there. Keeping the machine pure is what makes the gesture's laws testable
 * without a finger: the jest suite drives real event sequences through
 * step() and asserts the actions with real numbers, and the device session
 * only has to prove the wiring.
 *
 * WHY ACTIVATION IS AN EVENT, NOT A TIMER: on device, gesture-handler's
 * Reanimated integration runs the touch callbacks on the UI thread as
 * worklets, where a JS setTimeout and the model are remote functions —
 * calling them crashes the app (measured, see M4-MEASUREMENTS.md). The
 * hold (150ms) and drag-sooner (10px) thresholds are therefore enforced
 * NATIVELY — Gesture.Pan().activateAfterLongPress(holdMs) and
 * activeOffsetX/Y(±dragOpenPx) — and both funnel into ONE machine event,
 * "activated". The thresholds still live here as pinned constants; the
 * machine stays the spec, the native handler its enforcer.
 *
 * The contract (PHASE-M §M4):
 *   - press-and-HOLD ~150ms fans out; a drag past ~10px opens it sooner
 *     (both arrive as "activated")
 *   - a quick tap stays a plain tap through to /capture
 *   - selection is BY ANGLE past a small dead zone (theme/motion.ts)
 *   - release on a spoke acts; release on nothing folds it back
 */
import { MOTION, selectSpokeByAngle, type SpokeKey } from "../theme/motion";

export type RadialEvent =
  | { type: "down"; t: number }
  | { type: "activated" }
  | { type: "move"; t: number; dx: number; dy: number }
  | { type: "up"; t: number; dx: number; dy: number }
  | { type: "cancel" };

export type RadialAction =
  | { kind: "openFan" }
  | { kind: "fold" }
  /** the highlighted spoke changed (null = none); the component drives the
      highlight from this, not from re-reading internal state */
  | { kind: "select"; spoke: SpokeKey | null }
  | { kind: "captureTap" }
  | { kind: "act"; spoke: SpokeKey };

export interface RadialState {
  phase: "idle" | "pressing" | "open";
  /** timestamp of the current press, for the quick-tap decision */
  startedAt: number | null;
  selection: SpokeKey | null;
}

export function initialState(): RadialState {
  return { phase: "idle", startedAt: null, selection: null };
}

/** Distance travelled, px — reused for the tap-slop test. */
function travel(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

export function step(
  state: RadialState,
  e: RadialEvent,
): { state: RadialState; actions: RadialAction[] } {
  switch (e.type) {
    case "down":
      if (state.phase !== "idle") return { state, actions: [] };
      return { state: { phase: "pressing", startedAt: e.t, selection: null }, actions: [] };

    case "activated":
      // the native handler crossed EITHER threshold: the hold elapsed or
      // the drag passed the slop. Both mean: fan out now.
      if (state.phase !== "pressing") return { state, actions: [] };
      return {
        state: { phase: "open", startedAt: state.startedAt, selection: null },
        actions: [{ kind: "openFan" }, { kind: "select", spoke: null }],
      };

    case "move": {
      if (state.phase === "pressing") {
        // defensive: with native activation this cannot fire (the handler
        // activates first), but the machine stays honest if the wiring
        // ever changes
        if (travel(e.dx, e.dy) >= MOTION.dragOpenPx) {
          const spoke = selectSpokeByAngle(e.dx, e.dy);
          return {
            state: { phase: "open", startedAt: state.startedAt, selection: spoke },
            actions: [{ kind: "openFan" }, { kind: "select", spoke }],
          };
        }
        return { state, actions: [] };
      }
      if (state.phase === "open") {
        const spoke = selectSpokeByAngle(e.dx, e.dy);
        if (spoke === state.selection) return { state, actions: [] };
        return {
          state: { phase: "open", startedAt: state.startedAt, selection: spoke },
          actions: [{ kind: "select", spoke }],
        };
      }
      return { state, actions: [] };
    }

    case "up": {
      if (state.phase === "pressing") {
        // Still pressing AT release means the fan never opened: neither
        // did the hold elapse (that arrives as "activated") nor did a move
        // cross the slop. So the duration is already decided by the phase,
        // and re-deciding it from a second clock only adds a race.
        //
        // It did exactly that on device. The hold is a JS timer and the
        // timestamps are taken on the JS thread, so under load a ~100ms
        // physical tap measured >150ms while its own 150ms timer had not
        // yet run: the elapsed test said "not a tap", the phase said "the
        // fan never opened", and the tap resolved to nothing at all.
        // /capture was unreachable by tap. The phase is the authority.
        if (travel(e.dx, e.dy) < MOTION.tapSlopPx) {
          // quick tap: a plain tap through to /capture (PHASE-M §M4)
          return { state: initialState(), actions: [{ kind: "captureTap" }] };
        }
        // A flick that never crossed into the fan: noise, not a tap.
        return { state: initialState(), actions: [] };
      }
      if (state.phase === "open") {
        // release on a spoke acts; release on nothing folds it back
        const spoke = state.selection;
        const actions: RadialAction[] = spoke
          ? [{ kind: "act", spoke }, { kind: "fold" }]
          : [{ kind: "fold" }];
        return { state: initialState(), actions };
      }
      return { state, actions: [] };
    }

    case "cancel":
      if (state.phase === "open") {
        return { state: initialState(), actions: [{ kind: "fold" }] };
      }
      return { state: initialState(), actions: [] };
  }
}

/**
 * The stateful driver the component holds. Repeated "up" deliveries (the
 * touch-stream callback AND the handler's onEnd both fire after an active
 * gesture) are naturally absorbed: the machine is idle after the first.
 */
export class RadialGesture {
  private s = initialState();

  get state(): RadialState {
    return this.s;
  }

  send(e: RadialEvent): RadialAction[] {
    const next = step(this.s, e);
    this.s = next.state;
    return next.actions;
  }

  reset(): void {
    this.s = initialState();
  }
}
