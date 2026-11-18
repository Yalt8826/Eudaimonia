// The meals screen (T2.6, 04 /meals): day cards, item rows, totals —
// every estimated number through est() so the ~ is structural (law 11).
// Rows are canonical: the totals are the sum of rows, and a payload that
// disagrees fires the mismatch flag instead of being smoothed (03 §4).
// The "log a meal" affordance deep-links the capture sheet prefilled
// #meal — the tag IS the classification (the meal path skips clio).
import { useCallback, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { est, fetchMealsRecent, groupIntoDays, type DayCard } from "../../data/meals";
import { colors, fontFamily } from "../../theme/tokens";

export default function MealsScreen() {
  const [days, setDays] = useState<DayCard[] | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const insets = useSafeAreaInsets();

  const refresh = useCallback(async () => {
    const rows = await fetchMealsRecent();
    if (rows === null) {
      setUnreachable(true);
      return;
    }
    setUnreachable(false);
    setDays(groupIntoDays(rows));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const card = (d: DayCard) => (
    <View key={d.date} style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.date}>{d.date}</Text>
        <Text style={styles.total}>
          {est(d.kcal_est_total)} kcal · {est(d.protein_g_est_total)} g protein
        </Text>
      </View>
      {d.mismatch ? (
        <Text style={styles.mismatch}>
          ⚠ a stored total disagrees with the rows above — the rows are the record
        </Text>
      ) : null}
      {d.meals.map((meal) => (
        <View key={meal.meal_ref} style={styles.meal}>
          {meal.items.map((item, i) => (
            <View key={`${meal.meal_ref}-${i}`} style={styles.item}>
              <Text style={styles.itemLabel}>{item.label}</Text>
              <Text style={styles.itemNumbers}>
                {est(item.kcal_est)} kcal · {est(item.protein_g_est)} g
              </Text>
            </View>
          ))}
          <Text style={styles.basis} numberOfLines={1}>
            bases: {meal.items.map((i) => i.basis).join(", ")}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <Text accessibilityRole="header" accessibilityLabel="Meals" style={styles.heading}>
        MEALS
      </Text>
      <Text style={styles.muted}>
        {unreachable ? "server unreachable — no meals shown rather than stale ones" : "estimates carry ~ — provenance in the bases line"}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="log a meal"
        style={styles.logBtn}
        onPress={() => void Linking.openURL("web+eudaimonia://capture?meal=1")}
      >
        <Text style={styles.logLabel}>log a meal</Text>
      </Pressable>
      {days !== null && days.length > 0 ? (
        <ScrollView style={styles.list}>{days.map(card)}</ScrollView>
      ) : (
        <Text style={styles.muted}>
          {days === null
            ? unreachable
              ? "meals · server unreachable"
              : "meals · loading"
            : "no meals logged yet — capture with #meal and Hygeia estimates the items"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors["--bg"],
    padding: 24,
    gap: 14,
  },
  heading: {
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 16,
    letterSpacing: 1.6,
  },
  muted: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  logBtn: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors["--accent-1"],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  logLabel: {
    color: colors["--accent-1"],
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  list: {
    gap: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: colors["--muted"],
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 10,
  },
  cardHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  date: {
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
  total: {
    color: colors["--accent-1"],
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  mismatch: {
    color: colors["--accent-2"],
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  meal: {
    gap: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors["--muted"],
    paddingTop: 6,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  itemLabel: {
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 14,
    flex: 1,
  },
  itemNumbers: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  basis: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 10,
    opacity: 0.8,
  },
});
