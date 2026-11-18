// The routine day detail (T2.7, 07 §18): the plan's blocks as tickable
// planned structure — one tap per item, skip for a planned-but-not-done
// slot. Ticks are optional evidence, never duty: unticked renders
// unticked (no amber, no red), a skipped row renders covered-but-not-done
// in muted, and a day with no interaction renders its coverage line —
// never a row of zeros. A tick made after the block's window passed is a
// RECALL (renders ~ forever, law 11); the method is chosen here at the
// source so no window downstream can flatter a recall into a tap.
//
// Writes ride T2.1's queue (data/routines.ts → appOutbox): offline they
// queue and show at once (local-first overlay of the pending records);
// no streak logic exists in this module (the denominator is the planned
// set of the day, never consecutive days).
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchPlanToday, type PlanToday } from "../../data/plan";
import {
  cacheDay,
  dayCountLine,
  fetchRoutineDay,
  planDate,
  readLocalDay,
  tickMethod,
  writeTick,
  type RoutineDay,
  type TickState,
} from "../../data/routines";
import { parsePlan, type PlanBlock } from "../../plaza/planModel";
import { colors, fontFamily } from "../../theme/tokens";

export default function RoutineScreen() {
  const [plan, setPlan] = useState<PlanToday | null>(null);
  const [day, setDay] = useState<RoutineDay | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [failed, setFailed] = useState(false);
  const insets = useSafeAreaInsets();

  const refresh = useCallback(async () => {
    const now = new Date();
    const date = planDate(now);
    // local first: the phone's copy + queued ticks, then the server's
    try {
      setDay(await readLocalDay(date));
    } catch {
      // the store could not open — the server copy below still renders
    }
    const fetched = await fetchPlanToday();
    setPlan(fetched);
    const serverTicks = await fetchRoutineDay(date);
    if (serverTicks === null) {
      setUnreachable(true);
      return;
    }
    setUnreachable(false);
    cacheDay(date, serverTicks);
    try {
      setDay(await readLocalDay(date));
    } catch {
      setDay({ date, ticks: serverTicks, pending: 0 });
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const blocks: PlanBlock[] =
    plan?.plan === "ok" ? parsePlan(plan.plan_lines, plan.plan_keys).blocks : [];
  const tickable = blocks.filter((b) => b.key !== undefined);
  const countLine = day === null ? null : dayCountLine(day.ticks, tickable.length);

  const tick = useCallback(
    async (block: PlanBlock) => {
      if (block.key === undefined || day === null) return;
      try {
        await writeTick("routine_done", {
          routine_key: block.key,
          date: day.date,
          method: tickMethod(block.end, new Date()),
        });
        setFailed(false);
        setDay(await readLocalDay(day.date));
      } catch {
        // failure can never read as success (02 §6): the tick did NOT
        // queue, and the screen says so instead of leaving the row unticked
        setFailed(true);
      }
    },
    [day],
  );

  const skip = useCallback(
    async (block: PlanBlock) => {
      if (block.key === undefined || day === null) return;
      try {
        await writeTick("routine_skip", { routine_key: block.key, date: day.date });
        setFailed(false);
        setDay(await readLocalDay(day.date));
      } catch {
        setFailed(true);
      }
    },
    [day],
  );

  const row = (b: PlanBlock) => {
    const state: TickState | undefined = b.key !== undefined && day !== null ? day.ticks.get(b.key) : undefined;
    const done = state === "done" || state === "recall";
    const skipped = state === "skip";
    return (
      <View key={b.key ?? `x-${b.time}-${b.title}`} style={styles.row}>
        <Text
          style={[styles.glyph, done ? styles.glyphDone : skipped ? styles.glyphSkipped : styles.glyphOpen]}
          accessibilityLabel={
            state === undefined ? "not ticked" : state === "skip" ? "skipped" : "done"
          }
        >
          {state === "recall" ? "~●" : done ? "●" : skipped ? "–" : "○"}
        </Text>
        <View style={styles.rowText}>
          <Text style={[styles.title, (skipped || done) && styles.muted]}>
            {b.title || b.time}
          </Text>
          <Text style={styles.time}>
            {b.time}
            {state === "skip" ? " · skipped — covered, not done" : state === "recall" ? " · recalled" : ""}
          </Text>
        </View>
        {b.key !== undefined && !done && !skipped ? (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`mark ${b.title || b.time} done`}
              style={styles.actionBtn}
              onPress={() => void tick(b)}
            >
              <Text style={styles.actionLabel}>done</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`mark ${b.title || b.time} skipped`}
              style={styles.actionBtn}
              onPress={() => void skip(b)}
            >
              <Text style={[styles.actionLabel, styles.skipLabel]}>skip</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  const dateLabel = day?.date ?? planDate(new Date());
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <Text accessibilityRole="header" accessibilityLabel="Routine" style={styles.heading}>
        ROUTINE
      </Text>
      <Text style={styles.muted}>
        {dateLabel}
        {countLine !== null ? ` · ${countLine}` : ""} ·{" "}
        {plan?.plan === "ok"
          ? `fresh ${plan.days_fresh_7} of 7`
          : "plan · missing"}
        {day !== null && day.pending > 0 ? ` · ${day.pending} queued` : ""}
        {unreachable ? " · server unreachable" : ""}
        {failed ? " · tick failed — not queued" : ""}
      </Text>
      <Text style={styles.caption}>
        ~ marks a recall — logged after the block passed. skip renders covered, not done.
      </Text>
      {plan?.plan === "ok" && blocks.length > 0 ? (
        <ScrollView style={styles.list}>{blocks.map(row)}</ScrollView>
      ) : (
        <Text style={styles.muted}>
          {plan === null
            ? "plan · loading"
            : plan.plan === "missing"
              ? "no live plan — the routine reads the Week Plan's blocks"
              : "no time blocks in this week's plan"}
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
    gap: 16,
  },
  heading: {
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 16,
    letterSpacing: 1.6,
  },
  list: {
    gap: 8,
  },
  row: {
    borderWidth: 1,
    borderColor: colors["--muted"],
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  time: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  glyph: {
    fontSize: 16,
    width: 30,
    textAlign: "center",
  },
  glyphOpen: {
    color: colors["--muted"],
  },
  glyphDone: {
    color: colors["--accent-1"],
  },
  glyphSkipped: {
    color: colors["--muted"],
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: colors["--accent-1"],
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  actionLabel: {
    color: colors["--accent-1"],
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  skipLabel: {
    color: colors["--muted"],
  },
  muted: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
  caption: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 12,
    opacity: 0.8,
  },
});
