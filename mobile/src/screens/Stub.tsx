import { View, Text, StyleSheet } from "react-native";

import { colors, fontFamily, geometry } from "../theme/tokens";

// Ported from client/src/routes/routes.tsx: every route a P0-style stub
// that renders its route name — a route missing now is a 404 the two-tap
// law trips over in M2/M3. The web stub renders on a cream TornSheet; the
// torn-paper surface lands with the Plaza in M2, so the M1 stub is text on
// the matte skin and nothing else.

export function Stub({ name }: { name: string }) {
  return (
    <View style={styles.page}>
      <View accessibilityRole="header">
        <Text style={styles.title}>{name}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors["--bg"],
    // web stub: padding: 1.25rem 1rem
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  title: {
    color: colors["--text"],
    fontFamily: fontFamily.bold,
    fontSize: 28,
  },
});

// Re-exported so the shell layouts and tests share one geometry source.
export const NAV_INSET = geometry.navClusterInset;
