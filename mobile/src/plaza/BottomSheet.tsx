// The Plaza's slide-up sheet: a Modal over a dimmed backdrop, glass on the
// matte skin (--bg under --glass-fill — the surface the contrast suite
// measures), travel in the one §8 duration (none under reduce-motion).
// Closed by dragging the header down, tapping the backdrop, or Back.
//
// `requestClose` is handed to the children so a button inside can close
// the sheet WITH its travel (the parent's `open` only drops at the end).
import { useEffect, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView, ScrollView } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../theme/tokens";
import { MOTION } from "../theme/motion";

export const SHEET_PAD_X = 20;
const SHEET_RADIUS = 24;
/** Drag past this, or flick faster than DISMISS_VELOCITY, and it closes. */
const DISMISS_DRAG = 110;
const DISMISS_VELOCITY = 900;

export function BottomSheet({
  open,
  onClose,
  closeLabel,
  header,
  children,
  heightRatio = 0.82,
  fullHeight = false,
}: {
  open: boolean;
  onClose: () => void;
  /** The backdrop's accessible name, e.g. "Close the plan". */
  closeLabel: string;
  /** The drag handle area's content (title lines). */
  header: ReactNode;
  children: (requestClose: () => void) => ReactNode;
  heightRatio?: number;
  /** Always take heightRatio of the screen (pages with inputs), rather than
      hugging the content. */
  fullHeight?: boolean;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(windowHeight);
  const backdrop = useSharedValue(0);

  const ms = reduceMotion ? 0 : MOTION.stateChangeMs;

  useEffect(() => {
    if (open) {
      offset.set(windowHeight);
      offset.set(withTiming(0, { duration: ms }));
      backdrop.set(withTiming(1, { duration: ms }));
    }
  }, [open, ms, windowHeight, offset, backdrop]);

  const requestClose = () => {
    offset.set(withTiming(windowHeight, { duration: ms }));
    backdrop.set(withTiming(0, { duration: ms }));
    setTimeout(onClose, ms);
  };

  // JS-thread callbacks: the drag only moves the sheet, and the decision to
  // close is plain JS (no worklet hop needed for a two-number comparison)
  const drag = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetY(8)
    .onUpdate((e) => {
      offset.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > DISMISS_DRAG || e.velocityY > DISMISS_VELOCITY) requestClose();
      else offset.set(withTiming(0, { duration: ms }));
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));

  if (!open) return null;

  const sheetHeight = windowHeight * heightRatio;

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={requestClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable accessibilityLabel={closeLabel} onPress={requestClose} style={{ flex: 1 }} />
        </Animated.View>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboard}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.sheet,
              fullHeight ? { height: sheetHeight } : { maxHeight: sheetHeight },
              { paddingBottom: insets.bottom + 12 },
              sheetStyle,
            ]}
          >
            <View style={styles.fill} pointerEvents="none" />
            <GestureDetector gesture={drag}>
              <View style={styles.handleArea}>
                <View style={styles.grabber} />
                {header}
              </View>
            </GestureDetector>
            <ScrollView
              contentContainerStyle={styles.body}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {children(requestClose)}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: colors["--scrim"],
  },
  keyboard: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors["--bg"],
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors["--glass-border"],
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors["--glass-fill"],
  },
  handleArea: {
    paddingHorizontal: SHEET_PAD_X,
    paddingTop: 10,
    paddingBottom: 12,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors["--muted"],
    marginBottom: 14,
  },
  body: {
    paddingHorizontal: SHEET_PAD_X,
    paddingBottom: 12,
  },
});
