/**
 * The Reanimated jest stub — self-contained BY DESIGN.
 *
 * Why not the official mock (react-native-reanimated/mock)? Two reasons,
 * both learned the hard way in M4:
 *
 *   1. Resolution: the package's react-native field (src/index) redirects
 *      the /mock subpath to src/mock, which does not exist, so the subpath
 *      only resolves through the compiled lib/module tree.
 *   2. Recursion: expo-router's testing-library itself jest.mocks
 *      'react-native-reanimated' with a factory that requires the mock —
 *      and the official mock's dependency graph requires BARE
 *      'react-native-reanimated' (via react-native-worklets), re-entering
 *      that not-yet-cached factory until the stack overflows. The factory's
 *      catch swallows it and returns {} — and react-native-gesture-handler
 *      evaluates Reanimated.default.createAnimatedComponent at import time,
 *      so the empty object detonates every route-tree render with
 *      "Cannot read properties of undefined (reading 'createAnimatedComponent')".
 *
 * A stub with NO dependency on the reanimated graph cannot cycle. It
 * renders the real react-native components (stripping the animated-only
 * props), so children render and the tree is assertable.
 */
const React = require("react");
const RN = require("react-native");

/** Strip animated-only props so the underlying RN component never sees them. */
function animatedPassthrough(Component) {
  return React.forwardRef(function AnimatedPassthrough(props, ref) {
    const { entering, exiting, layout, ...rest } = props;
    return React.createElement(Component, { ...rest, ref });
  });
}

const withTiming = (toValue) => ({ toValue, __withTiming: true });

const Animated = {
  createAnimatedComponent: animatedPassthrough,
};
Animated.View = animatedPassthrough(RN.View);
Animated.Text = animatedPassthrough(RN.Text);
Animated.ScrollView = animatedPassthrough(RN.ScrollView);
Animated.Image = animatedPassthrough(RN.Image);

/** FadeIn et al are builder objects; only .duration() is used here. */
function builder() {
  const b = {};
  b.duration = () => b;
  return b;
}

const stub = {
  __esModule: true,
  default: Animated,
  Animated,
  createAnimatedComponent: animatedPassthrough,

  useSharedValue: (init) => ({ value: init }),
  useAnimatedStyle: (fn) => (typeof fn === "function" ? fn() : {}),
  useDerivedValue: (fn) => ({ value: typeof fn === "function" ? fn() : undefined }),
  useAnimatedProps: (fn) => (typeof fn === "function" ? fn() : {}),
  useAnimatedReaction: () => {},
  useAnimatedScrollHandler: () => ({}),
  useAnimatedRef: () => ({ current: null }),
  useReducedMotion: () => false,
  useEvent: () => () => {},
  useScrollViewOffset: () => ({ value: 0 }),

  withTiming,
  withSpring: (toValue) => ({ toValue, __withSpring: true }),
  withDelay: (_ms, v) => v,
  withSequence: (...vs) => vs,
  withRepeat: (v) => v,
  withDecay: () => ({}),
  cancelAnimation: () => {},
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
  interpolate: () => 0,
  interpolateColor: () => 0,
  Extrapolation: { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" },

  FadeIn: builder(),
  FadeOut: builder(),
  FadeInUp: builder(),
  FadeInDown: builder(),
  FadeInLeft: builder(),
  FadeInRight: builder(),
  FadeOutUp: builder(),
  FadeOutDown: builder(),
  SlideInUp: builder(),
  SlideOutUp: builder(),

  isReanimated3: true,
};

module.exports = stub;
