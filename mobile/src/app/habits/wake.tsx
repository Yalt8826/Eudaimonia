// Wake screen — ported from client/src/routes/WakeScreen.tsx at M3 (04 wake
// spec; 02 §2 law 9): bare, full-bleed teal, one giant target — no nav, no
// header, no animation, zero live blur of any kind. The tap time shown is
// pre-filled from the client clock; the event's ts is captured at tap time
// by the outbox. Offline it queues silently — never blocks — and the
// immediate sync is the port of the browser firing `online` at page load.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { appOutbox } from "../../data/appOutbox";
import { SkiaLabel } from "../../plaza/ui";
import { colors, fontFamily } from "../../theme/tokens";

type TapMethod = "tap" | "recall";

function formatTapTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function WakeScreen() {
  const [openedAt] = useState<Date>(() => new Date());
  const [queued, setQueued] = useState(false);

  const logTap = (method: TapMethod): void => {
    void appOutbox()
      .outbox.enqueue("habit_tap", { method })
      .then(() => {
        setQueued(true);
        // best-effort immediate round-trip; offline it resolves without
        // posting and the event waits for the foreground/reconnect triggers
        void appOutbox().sync();
      })
      .catch(() => {
        // never blocks (04 wake spec): a queue-write failure must not wedge
        // the wake screen; it stays usable, "will sync" simply not claimed.
      });
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.greeting}>GOOD MORNING</Text>
      <Text style={styles.tapTime}>{formatTapTime(openedAt)} tap time</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="I'M AWAKE"
        style={styles.awake}
        onPress={() => logTap("tap")}
      >
        {/* Skia, not <Text>: on a cold direct-link start Fabric measured
            this label with fallback metrics and painted "I'M" alone. Same
            fault as the M2 coverage lines; same fix. */}
        <SkiaLabel accessible={false} color={colors["--accent-1"]} fontSize={28}>
          I&apos;M AWAKE
        </SkiaLabel>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={styles.recall}
        onPress={() => logTap("recall")}
      >
        <Text style={styles.recallLabel}>~recall instead</Text>
      </Pressable>
      {queued ? (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          will sync
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // web: position fixed inset 0, background var(--accent-1), padding 1.5rem,
  // gap 1.5rem, centered column
  screen: {
    flex: 1,
    backgroundColor: colors["--accent-1"],
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    padding: 24,
  },
  greeting: {
    color: colors["--bg"],
    fontFamily: fontFamily.regular,
    fontSize: 16,
    letterSpacing: 1.6, // web: 0.1em at 1rem
  },
  tapTime: {
    color: colors["--bg"],
    fontFamily: fontFamily.regular,
    fontSize: 16,
    opacity: 0.8,
  },
  // web: width 100%, height 96, 1.75rem, weight 600, radius 16,
  // border 1px solid var(--bg), background var(--bg), color var(--accent-1)
  awake: {
    width: "100%",
    height: 96,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors["--bg"],
    backgroundColor: colors["--bg"],
    alignItems: "center",
    justifyContent: "center",
  },
  recall: {
    minHeight: 40,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  recallLabel: {
    color: colors["--bg"],
    fontFamily: fontFamily.regular,
    fontSize: 16,
    opacity: 0.65,
  },
  status: {
    color: colors["--bg"],
    fontFamily: fontFamily.regular,
    fontSize: 16,
  },
});
