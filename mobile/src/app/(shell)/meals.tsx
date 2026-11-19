// The meals screen (T2.6, 04 /meals): day cards, item rows, totals —
// every estimated number through est() so the ~ is structural (law 11).
// Rows are canonical: the totals are the sum of rows, and a payload that
// disagrees fires the mismatch flag instead of being smoothed (03 §4).
// The page owns no inline log button: the GLOBAL ＋ (bubble cluster)
// becomes the meal logger here — CAPTURE_CONTEXTS in routeMap.ts swaps
// its glyph to the meal mark and a tap opens capture prefilled #meal
// (the tag IS the classification; the meal path skips clio).
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  dayHeading,
  est,
  fetchMealsRecent,
  fetchWeightsRecent,
  groupIntoDays,
  type DayCard,
  type WeightPoint,
} from "../../data/meals";
import { fetchCoverage, type CoverageRow } from "../../data/coverage";
import { colors, fontFamily } from "../../theme/tokens";

export default function MealsScreen() {
  const [days, setDays] = useState<DayCard[] | null>(null);
  const [weights, setWeights] = useState<WeightPoint[] | null>(null);
  const [tenancy, setTenancy] = useState<CoverageRow | null>(null);
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
    void fetchWeightsRecent().then((w) => setWeights(w));
    void fetchCoverage().then((rows2) => {
      if (rows2 !== null) {
        const me = rows2.find((r) => r.source === "hygeia-meals");
        setTenancy(me ?? null);
      }
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const card = (d: DayCard) => (
    <View key={d.date} style={styles.card}>
      {/* the day subheading — a torn-paper band (01 §2): wellness takes
          cream, always (§1 tint law). The foods hang under it. */}
      <View style={styles.dayHead}>
        <Text style={styles.dayTitle}>{dayHeading(d.date, new Date())}</Text>
        <Text style={styles.totalMono}>
          <Text style={styles.totalKcal}>{est(d.kcal_est_total)} kcal</Text>
          {" · "}
          <Text style={styles.totalProtein}>{est(d.protein_g_est_total)} g protein</Text>
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
      {tenancy !== null && tenancy.hint ? (
        <Text style={styles.muted}>
          nutrition · {tenancy.days_fresh_7} of 7 · {tenancy.hint}
        </Text>
      ) : null}
      {weights !== null && weights.length > 0 ? (
        <Text style={styles.muted}>
          {"measured "}
          {weights
            .slice(0, 3)
            .map((w) => `${w.weight_kg} kg · ${w.date}`)
            .join("  ·  ")}
        </Text>
      ) : null}
      <Text style={styles.muted}>
        {unreachable ? "server unreachable — no meals shown rather than stale ones" : "estimates carry ~ — provenance in the bases line"}
      </Text>
      {days !== null && days.length > 0 ? (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {days.map(card)}
        </ScrollView>
      ) : (
        <Text style={styles.muted}>
          {days === null
            ? unreachable
              ? "meals · server unreachable"
              : "meals · loading"
            : "no meals logged yet — the ＋ logs a meal on this page (capture opens prefilled #meal)"}
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
    fontSize: 30,
    letterSpacing: 2.4,
  },
  muted: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: 16,
    paddingBottom: 24,
  },
  card: {
    gap: 8,
  },
  /* the day subheading band — torn-paper under-layer (01 §2): the black
     skin tears open over cream. Wellness takes cream, always (§1 tint
     law); the band carries the date + day and the day's totals. */
  dayHead: {
    backgroundColor: colors["--paper-cream"],
    borderTopLeftRadius: 10,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },
  dayTitle: {
    color: colors["--paper-ink"],
    fontFamily: fontFamily.regular,
    fontSize: 15,
    fontWeight: "700",
    flexShrink: 1,
  },
  totalMono: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors["--paper-ink"],
    flexShrink: 0,
  },
  // the ink-weight law (01 §4): kcal vs protein differ by font WEIGHT
  // only — bold vs regular, never a hue. No color here on purpose: the
  // pair inherits the band's --paper-ink from totalMono.
  totalKcal: { fontWeight: "700" },
  totalProtein: { fontWeight: "400" },
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
