// Root layout: the matte skin behind every route, the dark status bar,
// and the IBM Plex faces (theme.css body font, plus the mono faces the
// Plaza header, headings and pills ride). Font loading is
// fire-and-forget — stubs must not block on assets, and RN falls back to
// the system face until the fonts land.
import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  useFonts,
  IBMPlexSans_400Regular,
  IBMPlexSans_700Bold,
} from "@expo-google-fonts/ibm-plex-sans";
import {
  useFonts as useMonoFonts,
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from "@expo-google-fonts/ibm-plex-mono";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { installSyncTriggers } from "../data/appOutbox";
import { colors } from "../theme/tokens";

export default function RootLayout() {
  const [sansLoaded] = useFonts({ IBMPlexSans_400Regular, IBMPlexSans_700Bold });
  const [monoLoaded] = useMonoFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  // Text mounted BEFORE the fonts register keeps its fallback typeface on
  // Fabric even after the hook re-renders (the native text attributes never
  // change, so the face is never re-resolved — it took a second navigation
  // to reveal this: every cold-start screenshot rendered Roboto until the
  // screen remounted). Keying the Stack on font-readiness remounts the tree
  // once, ~1s in, and every face after that resolves correctly. The first
  // paint is the fallback — the same FOUT the web client ships with.
  const fontsKey = sansLoaded && monoLoaded ? "plex" : "fallback";

  // The offline queue's replay triggers (foreground + network return + the
  // immediate drain at open) — the native port of the web client's
  // main.tsx wiring. Install failure must never block the shell, exactly
  // like the web's SW registration.
  useEffect(() => {
    let uninstall: (() => void) | undefined;
    try {
      uninstall = installSyncTriggers();
    } catch {
      // the queue is allowed to be invisible, never ambiguous (law 9):
      // taps enqueue per-screen and never wedge the shell either way.
    }
    return () => uninstall?.();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {/* M4: the radial gesture's GestureDetector needs a root view. expo-router
          provides one on device, but owning it here keeps the app correct
          under any host (and under the jest route tree). */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack
          key={fontsKey}
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors["--bg"] },
            // M4 (01 §8): the root Stack presents instantly. Every ANIMATED
            // transition in this client is the shell's ScreenFade — one
            // measured 160ms — because the native stack's duration is the
            // platform's, not ours. Presenting instantly here also keeps the
            // wake route free of any entrance (law 9): it appears, it does
            // not arrive. motion.test.ts pins this config.
            animation: "none",
          }}
        />
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
