import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { Link, useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import Svg, { Circle, Path, Rect as SvgRect } from "react-native-svg";

import { colors, geometry } from "../theme/tokens";
import {
  MOTION,
  REM_PX,
  RING_BUBBLE_REM,
  RING_SPOKES,
  spokeTravelPx,
  type SpokeKey,
} from "../theme/motion";
import { RadialGesture, type RadialAction } from "./radialModel";
import { RouteSheet, WEEK_URL } from "./RouteSheet";
import { captureMode } from "../plaza/captureMode";

// The bubble cluster (01 §3): six glass bubbles anchored to the BOTTOM-RIGHT
// corner by the ＋ capture FAB, now (M4) a real radial gesture per PHASE-M
// §M4 and the ratified motion amendment (01 §8):
//
//   press-and-HOLD ~150ms on capture fans the five spokes out onto the ring
//   (two alternating radii — theme/motion.ts RING_SPOKES); a drag past
//   ~10px opens it sooner; a quick tap stays a plain tap through to
//   /capture. While open, selection is BY ANGLE past a small dead zone —
//   each spoke owns the wedge nearest its angle, out to infinity — release
//   on a spoke acts, release on nothing folds it back.
//
// The folded cluster is exactly M2's static layout, and the fan does not
// teleport: the folded column sits ON the ring's 90° ray and the folded row
// ON its 180° ray, so opening is a rotation from the collapsed arc onto the
// ring (travel endpoints asserted in radialModel.test.ts). The parked web
// attempt (c0740e8) died because an <a href> handle made Blink start a
// native HTML5 link drag mid-gesture; react-native-gesture-handler has no
// equivalent problem, and the FAB here is a GestureDetector with
// programmatic navigation — deliberately NOT a Link.
//
// Where the parked attempt showed the anchor as an ✕ at spoke weight while
// open, this port keeps that: the anchor scales 4.4rem → 3rem and the ＋
// crossfades to ✕ with the same travel (teal stays — folding is your
// action, 01 §4).
//
// State changes travel exactly MOTION.stateChangeMs (§8 band), instantly
// under reduce-motion — the travel drops, the ring still arrives. Gesture
// thresholds and ring geometry live in theme/motion.ts; the decision logic
// in radialModel.ts (pure, jest-driven); this file only wires.

const stroke = {
  fill: "none",
  stroke: colors["--text"],
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ICON_SIZE = 20;

const ICONS = {
  plaza: (
    <Svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}>
      <Path {...stroke} d="M4 11 12 4l8 7" />
      <Path {...stroke} d="M6 9.5V20h12V9.5" />
    </Svg>
  ),
  inbox: (
    <Svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}>
      <SvgRect {...stroke} x="5" y="4" width="14" height="17" rx="2" />
      <Path {...stroke} d="M9 4.5v4h6v-4M9 12h6M9 16h4" />
    </Svg>
  ),
  week: (
    <Svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}>
      <SvgRect {...stroke} x="4" y="5" width="16" height="15" rx="2" />
      <Path {...stroke} d="M4 9.5h16M8.5 3v4M15.5 3v4" />
    </Svg>
  ),
  more: (
    <Svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}>
      <Path {...stroke} d="M12 5v14M5 12h14" opacity={0} />
      <Circle cx="6" cy="12" r="1.4" fill={colors["--text"]} />
      <Circle cx="12" cy="12" r="1.4" fill={colors["--text"]} />
      <Circle cx="18" cy="12" r="1.4" fill={colors["--text"]} />
    </Svg>
  ),
  settings: (
    <Svg viewBox="0 0 24 24" width={ICON_SIZE} height={ICON_SIZE}>
      <Circle {...stroke} cx="12" cy="12" r="3.2" />
      <Path
        {...stroke}
        d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1"
      />
    </Svg>
  ),
  plus: (
    <Svg viewBox="0 0 24 24" width={26} height={26}>
      <Path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke={colors["--accent-1"]}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  ),
  // the anchor's open-state glyph: same stroke, same teal — the ＋
  // crossfades to this with the fan travel
  xmark: (
    <Svg viewBox="0 0 24 24" width={26} height={26}>
      <Path
        d="M6 6 18 18M18 6 6 18"
        fill="none"
        stroke={colors["--accent-1"]}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  ),
} as const;

// Capture's size, and the gap between neighbours. The rest derives.
const FAB = geometry.navBubbleSizes.fab; // 4.4rem
const DOT = geometry.navBubbleSizes.dot; // 3rem
const GAP = geometry.navBubbleSizes.gap; // 0.4rem
/** Centre a DOT-sized bubble on capture's centre line. */
const ALIGN = FAB / 2 - DOT / 2;

/** How small a spoke is while folded into the anchor — it grows from here. */
const FOLDED_SCALE = 0.35;

/** The anchor's open-state scale: six bubbles, ALL 3rem in the ring. */
const ANCHOR_OPEN_SCALE = (RING_BUBBLE_REM * REM_PX) / FAB; // 48 / 70.4

type Pos = { right: number; bottom: number };

/** M2's folded cluster, verbatim: a column rising from capture (settings,
    then more) and a row running LEFT from it (plaza, week, inbox). */
const FOLDED_POS: Record<SpokeKey, Pos> = {
  more: { right: ALIGN, bottom: FAB + GAP + DOT + GAP },
  settings: { right: ALIGN, bottom: FAB + GAP },
  plaza: { right: FAB + GAP, bottom: ALIGN },
  week: { right: FAB + GAP + DOT + GAP, bottom: ALIGN },
  inbox: { right: FAB + GAP + 2 * (DOT + GAP), bottom: ALIGN },
};

/** Folded bubble CENTRES relative to the anchor centre — the fan's origin.
    left counts LEFTWARD, up UPWARD, so the folded column sits on the ring's
    90° ray and the folded row on its 180° ray. */
const FOLDED_CENTRE: Record<SpokeKey, { left: number; up: number }> = {
  more: { left: 0, up: FAB + GAP + DOT + GAP + DOT / 2 - FAB / 2 }, // 120
  settings: { left: 0, up: FAB + GAP + DOT / 2 - FAB / 2 }, // 65.6
  plaza: { left: FAB + GAP + DOT / 2 - FAB / 2, up: 0 }, // 65.6
  week: { left: FAB + GAP + DOT + GAP + DOT / 2 - FAB / 2, up: 0 }, // 120
  inbox: { left: FAB + GAP + 2 * (DOT + GAP) + DOT / 2 - FAB / 2, up: 0 }, // 174.4
};

/** Screen-px translation per spoke, folded position → ring position.
    dx rightward, dy downward; measured and asserted in radialModel.test. */
const TRAVEL: Record<SpokeKey, { dx: number; dy: number }> = (() => {
  const out = {} as Record<SpokeKey, { dx: number; dy: number }>;
  for (const s of RING_SPOKES) {
    const f = FOLDED_CENTRE[s.key];
    // screen coords: leftward is negative dx, upward is negative dy
    out[s.key] = spokeTravelPx(-f.left, -f.up, s);
  }
  return out;
})();

/** Where a spoke acts to. More is not a route — it opens the sheet. */
const SPOKE_ROUTES: Record<Exclude<SpokeKey, "more">, string> = {
  settings: "/settings",
  plaza: "/",
  week: WEEK_URL,
  inbox: "/inbox",
};

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function logDev(message: string): void {
  if (__DEV__) console.log(message);
}

/** Animation-settle log, called back on the JS thread from the timing's
    completion worklet: the §8 travel measured on-device, in ms. */
function logSettle(label: string, t0: number): void {
  logDev(`[m4] fan ${label} settled travelMs=${(now() - t0).toFixed(1)}`);
}

interface SharedFan {
  fan: SharedValue<number>;
  selection: SharedValue<SpokeKey | null>;
}

/** One spoke of the cluster: static glass translated onto the ring by the
    fan progress, with a teal ring that rides the BY-ANGLE highlight.
    POSITIONING belongs to the wrapper (see spokeBubble); this view only
    carries the travel transform. */
function FanBubble(props: {
  spokeKey: SpokeKey;
  size: number;
  shared: SharedFan;
  activeRing: boolean;
  children: React.ReactNode;
}) {
  const { spokeKey, size, shared, activeRing, children } = props;
  const travel = TRAVEL[spokeKey];
  // At rest every spoke sits at translate(0,0) — exactly under the anchor.
  // Travel alone therefore leaves five opaque bubbles stacked in the
  // corner, which is not "only the capture button at rest": it is six
  // bubbles in a pile. The fan drives opacity and scale as well, so the
  // ring grows out of the anchor and collapses back into it.
  const fanStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shared.fan.value, [0, 0.25, 1], [0, 0.35, 1]),
    transform: [
      { translateX: interpolate(shared.fan.value, [0, 1], [0, travel.dx]) },
      { translateY: interpolate(shared.fan.value, [0, 1], [0, travel.dy]) },
      { scale: interpolate(shared.fan.value, [0, 1], [FOLDED_SCALE, 1]) },
    ],
  }));
  // selection feedback is instant (finger-tracked, not a state change) and
  // teal — the active hue, never a state hue (01 §3)
  const selectStyle = useAnimatedStyle(() => ({
    opacity: shared.selection.value === spokeKey ? 1 : 0,
  }));
  return (
    <Animated.View style={fanStyle}>
      <View style={{ width: size, height: size }}>
        <View
          style={[
            styles.bubble,
            { width: size, height: size, backgroundColor: colors["--bubble-veil"] },
          ]}
        >
          <View style={[StyleSheet.absoluteFill, styles.bubbleFill]} />
          <View style={styles.iconBox}>{children}</View>
        </View>
        {activeRing ? (
          <View aria-hidden pointerEvents="none" style={[ringBox(size), styles.ring]} />
        ) : null}
        <Animated.View
          aria-hidden
          pointerEvents="none"
          style={[ringBox(size), styles.ring, selectStyle]}
        />
      </View>
    </Animated.View>
  );
}

export function BubbleCluster() {
  const pathname = usePathname();
  // global, not local: the cluster sits in the shell LAYOUT, whose own
  // params never carry the current screen's query string
  const params = useGlobalSearchParams<{ snap?: string }>();
  const router = useRouter();
  const win = useWindowDimensions();

  const fan = useSharedValue(0);
  const selection = useSharedValue<SpokeKey | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const anchorFanStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(fan.value, [0, 1], [1, ANCHOR_OPEN_SCALE]) }],
  }));
  const plusStyle = useAnimatedStyle(() => ({
    opacity: interpolate(fan.value, [0, 1], [1, 0]),
  }));
  const xStyle = useAnimatedStyle(() => ({
    opacity: interpolate(fan.value, [0, 1], [0, 1]),
  }));

  const reduceMotion = useReducedMotion();
  const reduceRef = useRef(reduceMotion);
  // gesture callbacks read the live value through the ref; the commit-time
  // update is fine — a reduce-motion flip mid-gesture is not a scenario
  useEffect(() => {
    reduceRef.current = reduceMotion;
  }, [reduceMotion]);

  // Opacity is animated; interactivity and accessibility are not. A
  // folded spoke is invisible but still sits ON TOP of the anchor, so
  // without this it swallows the tap that was meant for capture and the
  // screen reader offers five buttons that are not on screen.
  const [ringOpen, setRingOpen] = useState(false);

  const modelRef = useRef(new RadialGesture());
  const downAtRef = useRef(0);
  // The last finger position in DP. RNGH ends the touch before reporting
  // it, so an UP can arrive with no touches at all; without this a tap
  // classifies against (0,0) and reads as a flick hundreds of dp long.
  // The gesture's own TRANSLATION — how far the finger has moved since it
  // landed. Absolute positions were tried and are a trap: RNGH reports
  // screen coordinates while measureInWindow reports window coordinates,
  // and on this device they differ by the status bar. A touch dead on the
  // anchor measured 48dp away from its own centre, so every angle was
  // computed from a point the button is not at — you had to drag PAST a
  // spoke before the maths landed in its wedge. Translation has no frame
  // to get wrong, and it is measured from where the finger actually
  // started, which is what a radial menu means anyway.
  const lastTravel = useRef<{ dx: number; dy: number } | null>(null);
  const drag = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);



  const perform = useCallback(
    (actions: RadialAction[]) => {
      /* eslint-disable react-hooks/immutability -- Reanimated shared values
         are mutable by design; these writes ARE the animation API (the §8
         travel), not render-phase mutation */
      for (const a of actions) {
        switch (a.kind) {
          case "openFan": {
            setSheetOpen(false);
            setRingOpen(true);
            if (reduceRef.current) {
              // reduce-motion drops the travel, never the state change:
              // the ring arrives on this frame
              fan.value = 1;
              logDev("[m4] fan open: reduce-motion, travel dropped, ring arrived");
            } else {
              const t0 = now();
              logDev("[m4] fan open requested");
              fan.value = withTiming(1, { duration: MOTION.stateChangeMs }, (finished) => {
                if (finished) runOnJS(logSettle)("open", t0);
              });
            }
            break;
          }
          case "fold": {
            setRingOpen(false);
            if (reduceRef.current) {
              fan.value = 0;
              logDev("[m4] fan fold: reduce-motion, travel dropped");
            } else {
              const t0 = now();
              fan.value = withTiming(0, { duration: MOTION.stateChangeMs }, (finished) => {
                if (finished) runOnJS(logSettle)("fold", t0);
              });
            }
            selection.value = null;
            break;
          }
          case "select":
            selection.value = a.spoke;
            break;
          case "captureTap":
            router.push("/capture");
            break;
          case "act":
            if (a.spoke === "more") setSheetOpen(true);
            else router.push(SPOKE_ROUTES[a.spoke]);
            break;
        }
      }
      /* eslint-enable react-hooks/immutability */
    },
    [fan, selection, router],
  );

  // a navigation from any path folds the ring — the ring never survives a
  // screen change (the machine absorbs the repeat: it is already idle
  // after a spoke's own act+fold)
  useEffect(() => {
    if (modelRef.current.state.phase !== "idle") {
      perform(modelRef.current.send({ type: "cancel" }));
    }
  }, [pathname, perform]);

  // The gesture's thresholds are enforced by the NATIVE handler —
  // activateAfterLongPress(holdMs) is the press-and-HOLD, activeOffsetX/Y
  // is the drag-opens-sooner — because on device, gesture-handler's
  // Reanimated integration runs these callbacks on the UI thread as
  // worklets, where a JS timer or the model are remote functions and
  // calling them crashes the app (measured; M4-MEASUREMENTS.md). Every
  // callback therefore does nothing but runOnJS into the pure JS machine
  // with serializable numbers; the model stays the spec, the handler its
  // enforcer. The refs/react-hooks disables stand for the same reason the
  // closures touch refs only from events, never render.
  /* eslint-disable react-hooks/refs */


  const clearHold = () => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const jsDown = () => {
    downAtRef.current = now();
    lastTravel.current = null;
    drag.current = true;
    logDev("[m4] down");
    clearHold();
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      perform(modelRef.current.send({ type: "activated" }));
    }, MOTION.holdMs);
    setSheetOpen(false);
    perform(modelRef.current.send({ type: "down", t: downAtRef.current }));
  };

  const jsMove = (dx: number, dy: number) => {
    const g = drag.current;
    if (g === null) return;
    lastTravel.current = { dx, dy };
    perform(modelRef.current.send({ type: "move", t: now(), dx, dy }));
  };
  const jsUp = () => {
    clearHold();
    // The touch-up event carries no translation, so the last one seen is
    // the release point. A gesture that never moved has none: {0,0}, which
    // is exactly a tap.
    const { dx, dy } = lastTravel.current ?? { dx: 0, dy: 0 };
    const t = now();
    const actions = modelRef.current.send({ type: "up", t, dx, dy });
    logDev(
      `[m4] up d=${dx.toFixed(0)},${dy.toFixed(0)} travel=${Math.hypot(dx, dy).toFixed(1)} ` +
        `-> [${actions.map((a) => a.kind).join(",") || "nothing"}]`,
    );
    perform(actions);
  };

  const jsCancel = () => {
    clearHold();
    drag.current = false;
    logDev(`[m4] cancel (phase was ${modelRef.current.state.phase})`);
    perform(modelRef.current.send({ type: "cancel" }));
  };

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        // minDistance(0): the handler ACTIVATES ON TOUCH and does nothing
        // else. It used to enforce both thresholds —
        // activateAfterLongPress(holdMs) for the hold, activeOffsetX/Y for
        // the drag — and those two cannot coexist on one Pan: RNGH treats
        // movement before the long-press delay as the press being broken,
        // so the handler FAILED. Measured on device: a press-and-drag
        // produced exactly one callback, onTouchesDown, and then silence —
        // no activation, no up, no cancel. Pressing and dragging, which is
        // the whole gesture, did nothing at all.
        //
        // So policy moved to where it was always specified: radialModel,
        // a pure machine with its own tests. The hold is a JS timer in
        // jsDown; the drag threshold is the model's own move branch. The
        // handler streams touches and enforces nothing.
        .minDistance(0)
        .hitSlop(8)
        .withTestId("capture-fab-gesture")
        .onTouchesDown(() => {
          runOnJS(jsDown)();
        })
        .onUpdate((e) => {
          runOnJS(jsMove)(e.translationX, e.translationY);
        })
        .onTouchesUp(() => {
          runOnJS(jsUp)();
        })
        .onTouchesCancelled(() => {
          runOnJS(jsCancel)();
        })
        .onFinalize(() => {
          // safety net for a gesture that ends through a path the touch
          // stream missed; repeated delivery is absorbed by the machine
          runOnJS(jsCancel)();
        }),
    // the JS handlers close over refs and callbacks that are stable across
    // renders; the memo keeps the gesture object identity stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [win.width, win.height],
  );
  /* eslint-enable react-hooks/refs */

  const isActive = (to: string): boolean =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  // The capture harness (renders/MEASUREMENTS) hides the floating cluster:
  // the web reference full-page renders carry no fixed chrome, and a
  // translated column would otherwise stamp the cluster into every band.
  // The flag is the deterministic signal (see captureMode.ts — the query
  // alone races the shell layout on a cold-start deep link).
  // Every hook runs BEFORE this return — rules of hooks.
  if (params.snap !== undefined || captureMode.active) return null;

  const shared: SharedFan = { fan, selection };

  const spokeBubble = (
    key: SpokeKey,
    label: string,
    icon: React.ReactNode,
    to?: string,
  ): React.ReactNode => {
    // the WRAPPER carries the folded position; FanBubble inside carries
    // only the travel transform — so the absolute anchor for right/bottom
    // is the cluster root, exactly as in M2
    const positioned = (bubble: React.ReactNode) => (
      <View
        key={key}
        style={[styles.slot, FOLDED_POS[key]]}
        pointerEvents={ringOpen ? "box-none" : "none"}
        aria-hidden={!ringOpen}
        importantForAccessibility={ringOpen ? "yes" : "no-hide-descendants"}
      >
        {bubble}
      </View>
    );
    if (to === undefined) {
      // More: the one spoke without a route — folded, it toggles the route
      // sheet (web parity); from the ring, release-on-More opens it
      return positioned(
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ expanded: sheetOpen }}
          hitSlop={2}
          onPress={() => setSheetOpen((open) => !open)}
          style={styles.cover}
        >
          <FanBubble spokeKey={key} size={DOT} shared={shared} activeRing={false}>
            {icon}
          </FanBubble>
        </Pressable>,
      );
    }
    return positioned(
      <Link href={to} aria-label={label} asChild>
        <Pressable accessibilityRole="button" hitSlop={2} style={styles.cover}>
          <FanBubble
            spokeKey={key}
            size={DOT}
            shared={shared}
            activeRing={isActive(to)}
          >
            {icon}
          </FanBubble>
        </Pressable>
      </Link>,
    );
  };

  return (
    <View
      testID="data-nav"
      aria-label="Primary"
      pointerEvents="box-none"
      style={[
        styles.cluster,
        {
          right: geometry.navClusterInset.right,
          bottom: geometry.navClusterInset.bottom,
          width: win.width - geometry.navClusterInset.right,
          height: win.height - geometry.navClusterInset.bottom,
        },
      ]}
    >
      {spokeBubble("more", "More", ICONS.more)}
      {spokeBubble("settings", "Settings", ICONS.settings, "/settings")}
      {spokeBubble("plaza", "Plaza", ICONS.plaza, "/")}
      {spokeBubble("week", "Week", ICONS.week, WEEK_URL)}
      {spokeBubble("inbox", "Inbox", ICONS.inbox, "/inbox")}

      {/* the anchor: the gesture handle. A quick tap pushes /capture here —
          deliberately NOT a Link, which is what killed the web attempt
          (Blink link drag). The fan's origin is this bubble's centre. The
          a11y action keeps the capture path reachable without the touch
          gesture (screen readers never see the fan). */}
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[styles.slot, { right: 0, bottom: 0 }, anchorFanStyle]}
          accessible
          accessibilityRole="button"
          accessibilityLabel="＋ capture"
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === "activate") router.push("/capture");
          }}
        >
          {/* the measured node: a plain View (the transform scales about
              the centre, so the measured centre is valid in both states) */}
          <View style={{ width: FAB, height: FAB }}>
            <View
              style={[
                styles.bubble,
                { width: FAB, height: FAB, backgroundColor: colors["--bubble-veil"] },
              ]}
            >
              <View style={[StyleSheet.absoluteFill, styles.bubbleFill]} />
              <View style={styles.iconBox}>
                <Animated.View style={[styles.glyph, plusStyle]}>{ICONS.plus}</Animated.View>
                <Animated.View style={[styles.glyph, styles.glyphUnder, xStyle]}>
                  {ICONS.xmark}
                </Animated.View>
              </View>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>

      <RouteSheet open={sheetOpen} activePath={pathname} onClose={() => setSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  cluster: {
    // window-sized minus the corner inset, box-none: only bubbles catch
    // touches. Replaces M2's corner-hugging 14.6rem × 11.2rem box so the
    // route sheet and its dismiss surface can be touched ABOVE it —
    // Android never dispatches touches to a child outside the parent's
    // bounds, and a corner-sized parent would make the sheet dead.
    position: "absolute",
    zIndex: 40,
    pointerEvents: "box-none",
  },
  slot: {
    position: "absolute",
  },
  // the wrapper Pressable/Link around a FanBubble: it must not paint, only
  // carry the tap (the bubble paints itself)
  cover: {
    backgroundColor: "transparent",
  },
  bubble: {
    // glass border, seat shadow (web: 0 3px 8px var(--scrim))
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors["--glass-border"],
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    elevation: 4,
    shadowColor: colors["--scrim"],
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  bubbleFill: {
    // --glass-fill rides OVER the veil painted by the parent's background
    borderRadius: 9999,
    backgroundColor: colors["--glass-fill"],
  },
  iconBox: {
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    alignItems: "center",
    justifyContent: "center",
  },
  // the ✕ sits under the ＋ in the same box; the crossfade is fan-driven
  glyphUnder: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  ring: {
    // the active-route and selection ring — teal, never a state hue (01 §3)
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: colors["--accent-1"],
  },
});

/** The active/selection ring frame — a sibling circle just OUTSIDE the
    border box (the web's boxShadow 0 0 0 2px spreads outside; a thicker
    border would eat into the bubble, which must stay overflow-hidden so
    its fill never escapes the circle). */
function ringBox(size: number) {
  return {
    width: size + 4,
    height: size + 4,
    left: -2,
    top: -2,
    position: "absolute" as const,
  };
}
