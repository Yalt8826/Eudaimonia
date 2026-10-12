import { View, StyleSheet } from "react-native";

import { colors, geometry } from "../theme/tokens";

// The bubble cluster's M1 placeholder. The web Shell rides every route
// except /habits/wake and carries the cluster; the routes test asserts the
// chrome structurally (`[data-nav]` present on shell routes, absent on
// wake). This placeholder carries the same `data-nav` marker so the
// structural law is testable from M1; M4 replaces it with the real
// radial cluster (the static bubbles are M2, the gesture is M4).
// pointerEvents="none": a marker must never eat a tap meant for a sheet.

export function ChromePlaceholder() {
  const inset = geometry.navClusterInset;
  return (
    <View
      testID="data-nav"
      pointerEvents="none"
      style={[
        styles.cluster,
        {
          top: inset.top ?? undefined,
          right: inset.right,
          bottom: inset.bottom,
          left: inset.left ?? undefined,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  cluster: {
    position: "absolute",
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors["--bubble-veil"],
  },
});
