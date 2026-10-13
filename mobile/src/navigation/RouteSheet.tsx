import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { useRouter } from "expo-router";

import { colors } from "../theme/tokens";
import { MOTION } from "../theme/motion";

// The More bubble's full route sheet, ported from the web BubbleCluster's
// data-sheet (two-tap law: every route within two taps). Same seventeen
// entries, same order, same active-route teal. The sheet is glass over the
// cluster's corner: the web spends its screen's one live blur here, the
// Expo client spends none — the --bubble-veil carries legibility instead.
// It fades in inside the §8 band, instantly under reduce-motion.

/** ISO week URL, verbatim from the web BubbleCluster (and M2's port). */
export function currentIsoWeekUrl(now: Date): string {
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNumber = date.getUTCDay() || 7; // ISO: Mon=1 .. Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber); // the nearest Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `/week/${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const WEEK_URL = currentIsoWeekUrl(new Date());

/** The Week bubble's target, shared with the cluster (one computation). */
export { WEEK_URL };

const ROUTE_SHEET: readonly (readonly [string, string])[] = [
  ["Plaza", "/"],
  ["Inbox", "/inbox"],
  ["Week", WEEK_URL],
  ["Questions", "/questions"],
  ["Timeline", "/timeline"],
  ["Reading", "/reading"],
  ["Meals", "/meals"],
  ["Agents", "/agents"],
  ["Server", "/server"],
  ["Capture", "/capture"],
  ["Notes", "/notes"],
  ["Mail", "/mail"],
  ["Projects", "/projects"],
  ["Goals", "/goals"],
  ["Routine", "/routine"],
  ["Chat", "/chat"],
  ["Settings", "/settings"],
];

export const SHEET_ENTRY_COUNT = ROUTE_SHEET.length;

/** web: width 11rem, maxHeight min(68vh, 32rem) */
const SHEET_WIDTH = 176;
export const SHEET_MAX_HEIGHT = Math.min(Dimensions.get("window").height * 0.68, 512);
/** web: bottom = FAB + GAP + 2·(DOT + GAP) — the sheet sits above the row */
export const SHEET_BOTTOM = 185.6;

export function RouteSheet({
  open,
  activePath,
  onClose,
}: {
  open: boolean;
  activePath: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  if (!open) return null;

  const row = (label: string, to: string) => {
    // pathname comparison matches the cluster's isActive: exact for "/",
    // prefix elsewhere
    const active = to === "/" ? activePath === "/" : activePath.startsWith(to);
    return (
      <Pressable
        key={to}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => {
          onClose();
          router.push(to);
        }}
        style={styles.row}
      >
        <Text style={[styles.rowText, active && { color: colors["--accent-1"] }]}>{label}</Text>
      </Pressable>
    );
  };

  const body = (
    <View style={styles.sheetGlass}>
      <View style={styles.sheetFill} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        // the web hides the scrollbar on this sheet (bubble-cluster.css);
        // RN shows one by default — hidden for the same reason: a gutter
        // down the right edge of a small floating glass panel is louder
        // than the list. The sheet is sized so scrolling is the exception,
        // which keeps the hidden affordance honest.
        showsVerticalScrollIndicator={false}
      >
        {ROUTE_SHEET.map(([label, to]) => row(label, to))}
      </ScrollView>
    </View>
  );

  return (
    <>
      {/* An invisible catch-all that folds the sheet on outside taps. The
          cluster ROOT is window-sized (box-none) precisely so this can
          receive touches anywhere — Android never dispatches touches to a
          child outside its parent's bounds. The web has no outside-dismiss
          at all; this is a touch-UX addition, not parity. */}
      <Pressable
        accessibilityLabel="Close route sheet"
        onPress={onClose}
        style={styles.scrim}
      />
      {reduceMotion ? (
        <View style={styles.sheetBox}>{body}</View>
      ) : (
        <Animated.View entering={FadeIn.duration(MOTION.stateChangeMs)} style={styles.sheetBox}>
          {body}
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scrim: {
    // explicit fill: this RN typeset exposes absoluteFill(Object) only as
    // opaque registered styles, which cannot take the background override
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
  },
  sheetBox: {
    position: "absolute",
    right: 0,
    bottom: SHEET_BOTTOM,
    width: SHEET_WIDTH,
    maxHeight: SHEET_MAX_HEIGHT,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors["--glass-border"],
    overflow: "hidden",
    // seat shadow — web: 0 6px 16px var(--scrim)
    elevation: 6,
    shadowColor: colors["--scrim"],
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  // the veil UNDER the fill — the same stack the bubbles use (see
  // --bubble-veil: glass alone is illegible over the light sheets)
  sheetGlass: {
    flex: 1,
    backgroundColor: colors["--bubble-veil"],
  },
  sheetFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors["--glass-fill"],
  },
  scroll: {
    flex: 1,
  },
  // web: padding 0.6rem 0.75rem, gap 0.15rem
  scrollContent: {
    paddingVertical: 9.6,
    paddingHorizontal: 12,
    gap: 2.4,
  },
  // web: padding 0.2rem 0.35rem, radius 8
  row: {
    paddingVertical: 3.2,
    paddingHorizontal: 5.6,
    borderRadius: 8,
  },
  // web: fontSize 0.875rem
  rowText: {
    color: colors["--text"],
    fontSize: 14,
  },
});
