import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { usePathname } from "expo-router";

import { MOTION } from "../theme/motion";

// The shell's screen transition (M4, 01 §8): the incoming screen fades in
// over the matte skin for exactly MOTION.stateChangeMs — the one §8 band
// number, pinned by motion.test.ts. The wrapper is keyed by pathname so a
// navigation remounts it and the fade plays; the bubble cluster is NOT
// inside it (the cluster is chrome, and must not blink on navigation).
//
// Reduce-motion drops the travel, never the state change (§8): the plain
// View branch swaps screens on the same frame, no fade.
//
// WHY A SHARED VALUE AND NOT `entering={FadeIn}`. It was the layout
// animation, and on device it did nothing: a screen recording of a
// navigation shows mean luminance going 11 -> 105 in ONE frame at 60fps,
// a hard cut with no opacity ramp anywhere. Reanimated's layout
// animations are the one mechanism in this client not otherwise proven
// here; withTiming is proven several times over (it is what the fan
// travels on, measured at 170ms). So the fade is driven the same way the
// rest of the client's motion is, and it is measurable for the same
// reason.
//
// The wake route never passes through here — it sits outside the (shell)
// group, and the root Stack presents it with animation "none" (law 9; the
// config is pinned in motion.test.ts). A five-second tap target appears,
// it does not arrive.
export function ScreenFade({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  // keyed by pathname: a navigation remounts this, so the value starts at
  // 0 and there is no frame of the new screen at full opacity first
  return reduceMotion ? (
    <View key={pathname} style={styles.fill}>
      {children}
    </View>
  ) : (
    <Fade key={pathname}>{children}</Fade>
  );
}

function Fade({ children }: { children: ReactNode }) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withTiming(1, { duration: MOTION.stateChangeMs });
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.fill, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
