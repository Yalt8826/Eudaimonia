/**
 * M0 — the Skia spike host app. One mint sheet, full screen, nothing else.
 * No routing, no data, no navigation: those are M1-M8.
 *
 * EXPO_PUBLIC_WRONG_MODE exists only for the measurement's sanity checks
 * (brief §7: a metric must be shown to fail on a deliberately wrong
 * render); it is never set for the real render.
 */

import React from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";

import { MintSheet } from "./src/MintSheet";

const WRONG_MODE = process.env.EXPO_PUBLIC_WRONG_MODE as
  | undefined
  | "multiply"
  | "flat"
  | "nofringe"
  | "rim";

export default function App() {
  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <MintSheet
        blend={WRONG_MODE === "multiply" ? "multiply" : "softLight"}
        texture={WRONG_MODE !== "flat"}
        fringe={WRONG_MODE !== "nofringe"}
        rimStroke={WRONG_MODE === "rim"}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0B0B0C",
  },
});
