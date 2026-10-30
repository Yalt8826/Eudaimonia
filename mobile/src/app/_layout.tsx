// Root layout: the matte skin behind every route, the dark status bar,
// and the IBM Plex faces (theme.css body font, plus the mono faces the
// Plaza header, headings and pills ride). Font loading is
// fire-and-forget — stubs must not block on assets, and RN falls back to
// the system face until the fonts land.
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StyleSheet, View } from "react-native";
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
import { preloadSkiaAssets } from "../plaza/skiaAssets";
import { colors } from "../theme/tokens";

export default function RootLayout() {
  // FONTS GATE THE FIRST MOUNT (perf, owner-measured 2026-10-24): the old
  // fontsKey remount built the Plaza's Skia tree THREE times on cold start
  // (18 surface creations in waves at +0.8s/+1.1s/+1.5s; sheets up to
  // 1080x4178 re-rasterized per pass; real content past +3s). Mounting
  // once, after the faces settle, makes the first paint the final paint.
  // A font FAILURE degrades to system faces exactly like the old fallback
  // key did. Ready means loaded or failed, never "stuck waiting".
  const [sansLoaded, sansError] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_700Bold,
  });
  const [monoLoaded, monoError] = useMonoFonts({
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  // The Skia fonts + textures load once, during the same boot hold, so the
  // Plaza paints complete on its first frame instead of popping in line by
  // line (skiaAssets.ts). preloadSkiaAssets never rejects.
  const [skiaReady, setSkiaReady] = useState(false);
  useEffect(() => {
    let live = true;
    void preloadSkiaAssets().then(() => {
      if (live) setSkiaReady(true);
    });
    return () => {
      live = false;
    };
  }, []);
  const assetsReady =
    (sansLoaded || sansError != null) &&
    (monoLoaded || monoError != null) &&
    skiaReady;

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

  if (!assetsReady) {
    // The hold is the matte skin itself (01 s1): no logo, no spinner, no
    // arrival. The very surface the app paints a moment later, so the
    // wait reads as the app waking, not as a loader. The faces are bundled
    // assets, not network: this hold is face-load time, tenths of a second.
    return <View style={styles.boot} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {/* M4: the radial gesture's GestureDetector needs a root view. expo-router
          provides one on device, but owning it here keeps the app correct
          under any host (and under the jest route tree). */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack
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

const styles = StyleSheet.create({
  /** The boot hold. 01 s1 matte, the app's own background color. */
  boot: { flex: 1, backgroundColor: colors["--bg"] },
});
