// The waiting-on inbox (T2.2, 04 /inbox): one list, two tabs — owed by
// me / owed to me — rows sorted by age, each with done · roll · drop as
// three TEXT buttons, no icons, no confirm modals (a reply already sent
// needs no "are you sure"). Drop asks a one-line reason the FIRST time
// per source only (durable flag in the outbox kv); the reason rides the
// event payload.
//
// Resolutions ride the T2.1 armor: they enqueue through the outbox's
// generic door and the status claims the DEPTH (queued · will sync (N)),
// never optimism — a resolution that flips to done on a dead connection
// is the exact failure this phase exists to kill. The server applies the
// cache row when the event drains; the next fetch shows it settled.
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appOutbox } from "../../data/appOutbox";
import {
  fetchOpenLoops,
  resolutionPayload,
  RESOLUTIONS,
  type OpenLoops,
  type ResolutionKind,
} from "../../data/loops";
import { colors, fontFamily } from "../../theme/tokens";

const DROP_ASKED_KEY = "drop-reason-asked:human";

type Tab = "owed-by-me" | "owed-to-me";

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<OpenLoops | null>(null);
  const [tab, setTab] = useState<Tab>("owed-by-me");
  const [status, setStatus] = useState<string | null>(null);
  const [dropping, setDropping] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [reasonAsked, setReasonAsked] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    const d = await fetchOpenLoops();
    setData(d);
    const kv = appOutbox().kv;
    // getItem returns NULL (not undefined) for a missing key — the
    // owner-measured bug: the reason prompt never showed because null
    // !== undefined read as "already asked". != null covers both.
    setReasonAsked((await kv.getItem(DROP_ASKED_KEY)) != null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const resolve = useCallback(
    async (kind: ResolutionKind, loopId: number, withReason?: string) => {
      const box = appOutbox();
      const payload = resolutionPayload(kind, loopId, withReason);
      await box.outbox.enqueue(kind, payload);
      const depth = await box.outbox.depth();
      // read after the sync settles — the depth is the claim's truth
      void box
        .sync()
        .then(async () => {
          const settled = await box.outbox.depth();
          if (settled === 0) setStatus("resolution sent");
          else setStatus(`queued · will sync (${settled})`);
        })
        .catch(() => undefined);
      setStatus(depth === 0 ? "resolution sent" : `queued · will sync (${depth})`);
      setDropping(null);
      setReason("");
    },
    [],
  );

  const onDrop = useCallback(
    async (loopId: number) => {
      // first drop per source asks; the flag is durable (outbox kv)
      if (reasonAsked) {
        await resolve("loop_dropped", loopId);
      } else {
        setDropping(loopId);
      }
    },
    [reasonAsked, resolve],
  );

  const confirmDrop = useCallback(
    async (loopId: number) => {
      const box = appOutbox();
      await box.kv.setItem(DROP_ASKED_KEY, "1");
      setReasonAsked(true);
      await resolve("loop_dropped", loopId, reason.trim() || undefined);
    },
    [reason, resolve],
  );

  const rows = (data?.loops ?? []).filter((l) => l.direction === tab);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <Text accessibilityRole="header" accessibilityLabel="Inbox" style={styles.heading}>
        WAITING ON
      </Text>
      <View style={styles.tabs}>
        {(["owed-by-me", "owed-to-me"] as const).map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityLabel={t.replace("-", " ")}
            accessibilityState={{ selected: tab === t }}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === "owed-by-me" ? "owed by me" : "owed to me"}
              {data ? ` (${t === "owed-by-me" ? data.owed_by_me : data.owed_to_me})` : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      {data === null ? (
        <Text style={styles.muted}>waiting on · server unreachable</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.muted}>nothing open in this tab</Text>
      ) : (
        rows.map((loop) => (
          <View key={loop.id} style={styles.row}>
            <View style={styles.rowHead}>
              <Text style={styles.rowText}>{loop.text}</Text>
              <Text style={styles.age}>
                {loop.age_days === 0 ? "today" : `${loop.age_days}d`}
              </Text>
            </View>
            {dropping === loop.id ? (
              <View style={styles.reasonBox}>
                <TextInput
                  accessibilityLabel="drop reason"
                  style={styles.reasonInput}
                  placeholder="why drop it? (one line)"
                  placeholderTextColor={colors["--muted"]}
                  value={reason}
                  onChangeText={(t) => {
                      console.log("DEBUG onChangeText:", JSON.stringify(t));
                    setReason(t);
                  }}
                  autoFocus
                  maxLength={500}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="confirm drop"
                  style={styles.resBtn}
                  onPress={() => void confirmDrop(loop.id)}
                >
                  <Text style={styles.resLabel}>drop</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.resRow}>
                {RESOLUTIONS.map((res) => (
                  <Pressable
                    key={res.kind}
                    accessibilityRole="button"
                    accessibilityLabel={`${res.label}: ${loop.text}`}
                    style={styles.resBtn}
                    onPress={() => {
                      if (res.kind === "loop_dropped") void onDrop(loop.id);
                      else void resolve(res.kind, loop.id);
                    }}
                  >
                    <Text style={styles.resLabel}>{res.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ))
      )}

      {status !== null ? (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {status}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors["--bg"],
    padding: 24,
    // the top inset rides inline: styles are module-level, the inset is
    // per-device — edge-to-edge means the status bar overlays the screen
    gap: 16,
  },
  heading: {
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 16,
    letterSpacing: 1.6,
  },
  tabs: {
    flexDirection: "row",
    gap: 8,
  },
  tab: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors["--muted"],
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  tabActive: {
    borderColor: colors["--accent-1"],
    backgroundColor: colors["--accent-1"],
  },
  tabLabel: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  tabLabelActive: {
    color: colors["--bg"],
  },
  row: {
    borderWidth: 1,
    borderColor: colors["--muted"],
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  rowHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  rowText: {
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 15,
    flex: 1,
  },
  age: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  resRow: {
    flexDirection: "row",
    gap: 8,
  },
  resBtn: {
    borderWidth: 1,
    borderColor: colors["--muted"],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  resLabel: {
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  reasonBox: {
    gap: 8,
  },
  reasonInput: {
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors["--accent-1"],
    borderRadius: 8,
    padding: 8,
  },
  muted: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
  status: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
});
