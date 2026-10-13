import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
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
// The wake route never passes through here — it sits outside the (shell)
// group, and the root Stack presents it with animation "none" (law 9; the
// config is pinned in motion.test.ts). A five-second tap target appears,
// it does not arrive.
export function ScreenFade({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  if (reduceMotion) {
    return (
      <View key={pathname} style={styles.fill}>
        {children}
      </View>
    );
  }
  return (
    <Animated.View
      key={pathname}
      entering={FadeIn.duration(MOTION.stateChangeMs)}
      style={styles.fill}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
