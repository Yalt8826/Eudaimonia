// The Plaza's slide-up sheet: a Modal over a dimmed backdrop, glass on the
// matte skin (--bg under --glass-fill — the surface the contrast suite
// measures), travel in the one §8 duration (none under reduce-motion).
// Closed by dragging the header down, tapping the backdrop, or Back.
//
// `requestClose` is handed to the children so a button inside can close
// the sheet WITH its travel (the parent's `open` only drops at the end).
import { useEffect, useRef, useState, type ReactNode } from "react";
// RN's ScrollView, not RNGH's: the drag lives on the header only, and RNGH's
// ScrollView dropped keyboardShouldPersistTaps — the first tap on "Add" with
// the keyboard up only closed the keyboard (measured on the A059).
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
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

  // The keyboard slides OVER the sheet; the sheet never moves. The scroll
  // content grows by the keyboard's height so its last rows can still be
  // reached, and the focused field scrolls up into the visible part.
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboard(e.endCoordinates.height);
      // scroll ONLY when the keyboard would cover the focused field
      const keyboardTop = e.endCoordinates.screenY;
      const input = TextInput.State.currentlyFocusedInput();
      const content = contentRef.current;
      if (input && content) {
        input.measureInWindow((_x, winY, _w, h) => {
          const overlap = winY + h + 16 - keyboardTop;
          if (overlap > 0) {
            input.measureLayout(
              content,
              (_x2, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 140), animated: true }),
              () => undefined,
            );
          }
        });
      }
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboard(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
        <View style={styles.keyboard} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.sheet,
              // a page with inputs is pinned by its TOP, so a window resize
              // for the keyboard cannot lift it
              fullHeight
                ? { position: "absolute", left: 0, right: 0, top: windowHeight - sheetHeight, height: sheetHeight }
                : { maxHeight: sheetHeight },
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
              ref={scrollRef}
              contentContainerStyle={[styles.body, { paddingBottom: 12 + keyboard }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View ref={contentRef} collapsable={false}>
                {children(requestClose)}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
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
