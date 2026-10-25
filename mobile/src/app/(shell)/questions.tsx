// The questions screen (T2.5): the open queue with the ask dispatch. A
// question sent to a profile renders plum-attributed picked_up; the
// server's single writer settles answered/open from the invocation
// outcome (08 s20's writer contract). The ask is a DIRECT dispatch — the
// lifecycle's writer lives server-side, and an offline ask would sit
// picked_up forever; unreachable says so honestly instead.
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import {
  askQuestion,
  fetchOpenQuestions,
  type OpenQuestions,
  type OpenQuestion,
} from "../../data/questionQueue";
import { colors, fontFamily } from "../../theme/tokens";

const PROFILE = "clio"; // the picker widens in P4 (08: profiles glob-enumerated)

export default function QuestionsScreen() {
  const [queue, setQueue] = useState<OpenQuestions | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [asking, setAsking] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const q = await fetchOpenQuestions();
    setQueue(q);
    setUnreachable(q === null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const ask = useCallback(
    async (id: number) => {
      setAsking(id);
      await askQuestion(id);
      await refresh();
      setAsking(null);
    },
    [refresh],
  );

  const row = (q: OpenQuestion) => (
    <View key={q.id} style={styles.row}>
      <Text style={styles.text}>{q.text}</Text>
      <View style={styles.rowFoot}>
        <Text
          style={[
            styles.status,
            q.status === "picked_up" && styles.pickedUp,
          ]}
        >
          {q.status === "picked_up" ? `picked up · ${PROFILE}` : "open"}
        </Text>
        {q.status === "open" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`send to ${PROFILE}: ${q.text}`}
            disabled={asking !== null}
            style={[styles.askBtn, asking !== null && styles.askDisabled]}
            onPress={() => void ask(q.id)}
          >
            <Text style={styles.askLabel}>send to {PROFILE}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" accessibilityLabel="Questions" style={styles.heading}>
        QUESTIONS
      </Text>
      {unreachable ? (
        <Text style={styles.muted}>questions · server unreachable</Text>
      ) : queue !== null && queue.count === 0 ? (
        <Text style={styles.muted}>
          no open questions — capture one and triage it to question
        </Text>
      ) : queue !== null ? (
        <ScrollView style={styles.list}>{queue.questions.map(row)}</ScrollView>
      ) : null}
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
    gap: 8,
  },
  text: {
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  rowFoot: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  status: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  pickedUp: {
    color: colors["--accent-2"],
  },
  askBtn: {
    borderWidth: 1,
    borderColor: colors["--accent-1"],
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  askDisabled: {
    opacity: 0.4,
  },
  askLabel: {
    color: colors["--accent-1"],
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  muted: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
});
