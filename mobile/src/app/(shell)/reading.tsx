// The reading queue (T3.1, 04 /reading): the digest's papers, oldest
// thinking first. The banner is EVIDENCE-DRIVEN — paused renders only
// from a recorded job_paused event (law 5), never a hardcoded date.
// Status transitions and rating taps queue through the outbox (they are
// ordinary registered kinds) and stay visible offline; the list itself
// needs the server and says so honestly when it cannot reach it.
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  fetchReadingQueue,
  writeRating,
  writeReadingStatus,
  type ReadingItem,
  type ReadingQueue,
} from "../../data/reading";
import { colors, fontFamily } from "../../theme/tokens";

const NEXT_LABEL: Record<ReadingItem["status"], string> = {
  new: "skim",
  skimmed: "digest",
  digested: "done",
  dismissed: "dismissed",
};
const NEXT_STATUS: Record<ReadingItem["status"], ReadingItem["status"]> = {
  new: "skimmed",
  skimmed: "digested",
  digested: "dismissed",
  dismissed: "dismissed",
};

export default function ReadingScreen() {
  const [queue, setQueue] = useState<ReadingQueue | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const insets = useSafeAreaInsets();

  const refresh = useCallback(async () => {
    const q = await fetchReadingQueue();
    if (q === null) {
      setUnreachable(true);
      return;
    }
    setUnreachable(false);
    setQueue(q);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const row = (item: ReadingItem) => (
    <View key={item.arxiv_id} style={styles.row}>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.meta}>
        {item.edition_date ?? ""} · arXiv:{item.arxiv_id} · {item.status}
        {item.rating !== null ? ` · rated ${item.rating}` : ""}
      </Text>
      {item.status !== "dismissed" ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`mark ${NEXT_LABEL[item.status]}: ${item.title}`}
            style={styles.actionBtn}
            onPress={() => void writeReadingStatus(item.arxiv_id, NEXT_STATUS[item.status])}
          >
            <Text style={styles.actionLabel}>{NEXT_LABEL[item.status]}</Text>
          </Pressable>
          <View style={styles.rating} accessibilityRole="radiogroup" accessibilityLabel={`rate ${item.title}`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityState={{ selected: item.rating === n }}
                accessibilityLabel={`rate ${n} of 5: ${item.title}`}
                hitSlop={6}
                onPress={() => void writeRating(item.arxiv_id, n)}
              >
                <Text style={[styles.star, item.rating !== null && n <= item.rating && styles.starOn]}>
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <Text accessibilityRole="header" accessibilityLabel="Reading" style={styles.heading}>
        READING
      </Text>
      {queue !== null && queue.banner.paused ? (
        <Text style={styles.banner}>
          digest paused{queue.banner.since ? ` since ${queue.banner.since.slice(0, 10)}` : ""}
          {queue.banner.actor ? ` by ${queue.banner.actor}` : ""} — the queue below is the archive
        </Text>
      ) : null}
      <Text style={styles.muted}>
        {unreachable ? "server unreachable — the queue needs the network; writes still queue" : `${queue?.items.length ?? 0} in the queue`}
      </Text>
      {queue !== null && queue.items.length > 0 ? (
        <ScrollView style={styles.list}>{queue.items.map(row)}</ScrollView>
      ) : (
        <Text style={styles.muted}>
          {queue === null
            ? unreachable
              ? "reading · server unreachable"
              : "reading · loading"
            : "the queue is empty — the digest feeds it when it runs"}
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
  banner: {
    color: colors["--accent-2"],
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  muted: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  list: {
    gap: 8,
  },
  row: {
    borderWidth: 1,
    borderColor: colors["--muted"],
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  title: {
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  meta: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 4,
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
  rating: {
    flexDirection: "row",
    gap: 10,
  },
  star: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 13,
    paddingHorizontal: 2,
  },
  starOn: {
    color: colors["--accent-1"],
  },
});
