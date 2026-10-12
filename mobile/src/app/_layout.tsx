// Root layout: the matte skin behind every route, the dark status bar,
// and the IBM Plex Sans faces (theme.css body font). Font loading is
// fire-and-forget — stubs must not block on assets, and RN falls back to
// the system face until the fonts land.
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, IBMPlexSans_400Regular, IBMPlexSans_700Bold } from "@expo-google-fonts/ibm-plex-sans";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors } from "../theme/tokens";

export default function RootLayout() {
  void useFonts({ IBMPlexSans_400Regular, IBMPlexSans_700Bold });

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors["--bg"] },
        }}
      />
    </SafeAreaProvider>
  );
}
