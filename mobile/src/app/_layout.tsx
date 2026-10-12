// Root layout: the matte skin behind every route, the dark status bar,
// and the IBM Plex faces (theme.css body font, plus the mono faces the
// Plaza header, headings and pills ride). Font loading is
// fire-and-forget — stubs must not block on assets, and RN falls back to
// the system face until the fonts land.
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
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

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        key={fontsKey}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors["--bg"] },
        }}
      />
    </SafeAreaProvider>
  );
}
