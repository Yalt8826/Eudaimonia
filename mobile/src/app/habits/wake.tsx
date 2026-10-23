// Wake screen — ported from client/src/routes/WakeScreen.tsx at M3 (04 wake
// spec; 02 §2 law 9): bare, full-bleed teal, one giant target — no nav, no
// header, no animation, zero live blur of any kind. The tap time shown is
// pre-filled from the client clock; the event's ts is captured at tap time
// by the outbox. Offline it queues silently — never blocks.
//
// T2.1, owner-measured 2026-10-24 (event ids 1–4: one wake, four taps): a
// surface that never confirms reads as a dead tap, and a groggy user taps
// again. So the surface is now ONE-SHOT — the first tap (either path) makes
// both targets inert, the status claims the OUTBOX DEPTH (registered at 0,
// "will sync" above it — never a state variable's optimism, the M5 weak
// assertion closed), and after a pinned hold (MOTION.wakeExitHoldMs) the
// surface exits itself to the Plaza. Law 9 kept: the exit is the surface
// doing the navigating, so the user never has to. router.replace, never
// push: system back from the Plaza must not land on a spent wake screen.
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";

import { appOutbox } from "../../data/appOutbox";
import { SkiaLabel } from "../../plaza/ui";
import { colors, fontFamily } from "../../theme/tokens";
import { MOTION } from "../../theme/motion";

type TapMethod = "tap" | "recall";

/** The post-tap state: which path was logged, and the outbox depth read
 * AFTER the immediate sync attempt — the only honest source for the claim. */
interface Done {
  method: TapMethod;
  depth: number;
}

function formatTapTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function statusText(depth: number): string {
  // "will sync" is the offline claim the M5 device leg asserts on — keep
  // the literal. Depth 0 means the server took it: say so, plainly.
  return depth === 0 ? "registered" : depth === 1 ? "queued · will sync" : `${depth} queued · will sync`;
}

export default function WakeScreen() {
  const [openedAt] = useState<Date>(() => new Date());
  const [done, setDone] = useState<Done | null>(null);
  // Synchronous one-shot guard: done-as-state leaves the in-flight enqueue
  // window (enqueue → depth read) open, and the 4-event morning happened in
  // exactly that window. A ref closes it on the same tick as the press.
  const busy = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const logTap = (method: TapMethod): void => {
    if (busy.current) return;
    busy.current = true;

    const box = appOutbox();
    const refresh = async (): Promise<void> => {
      const depth = await box.outbox.depth();
      if (mounted.current) setDone({ method, depth });
    };

    void box.outbox
      .enqueue("habit_tap", { method })
      .then(async () => {
        // paint the done state from the store before the network answers…
        await refresh();
        // …then let the immediate sync refine it in place when it settles
        void box
          .sync()
          .then(refresh)
          .catch(() => {
            /* sync funnels its own errors; a failed run is the queue's job */
          });
        timer.current = setTimeout(() => {
          router.replace("/");
        }, MOTION.wakeExitHoldMs);
      })
      .catch(() => {
        // never blocks (04 wake spec): a queue-write failure must not wedge
        // the wake screen; it stays usable, no claim is made, and the guard
        // releases so the tap can be retried.
        busy.current = false;
      });
  };

  const spent = done !== null;

  return (
    <View style={styles.screen}>
      <Text style={styles.greeting}>GOOD MORNING</Text>
      <Text style={styles.tapTime}>{formatTapTime(openedAt)} tap time</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="I'M AWAKE"
        accessibilityState={{ disabled: spent }}
        style={styles.awake}
        disabled={spent}
        onPress={() => logTap("tap")}
      >
        {/* Skia, not <Text>: on a cold direct-link start Fabric measured
            this label with fallback metrics and painted "I'M" alone. Same
            fault as the M2 coverage lines; same fix. */}
        <SkiaLabel accessible={false} color={colors["--accent-1"]} fontSize={28}>
          {done === null || done.method === "tap" ? "I'M AWAKE" : "LOGGED ~"}
        </SkiaLabel>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="recall instead"
        accessibilityState={{ disabled: spent }}
        style={styles.recall}
        disabled={spent}
        onPress={() => logTap("recall")}
      >
        <Text style={styles.recallLabel}>~recall instead</Text>
      </Pressable>
      {done !== null ? (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {statusText(done.depth)}
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
