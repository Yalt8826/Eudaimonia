// The capture sheet (T2.3, 04 /capture): one textarea, one send — the
// phone's door into the same inbox fuzzel feeds. Offline it queues via
// the T2.1 armor (the outbox's generic door: kind `capture_raw`) and the
// status claims the OUTBOX DEPTH, exactly like the wake screen: never a
// fabricated sync (law 9; failure must not read as success).
//
// Triage is the server's business after landing (agent_invoke, 180 s,
// background) — this screen's whole job is to not lose the text.
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { appOutbox } from "../../data/appOutbox";
import {
  fetchRecentCaptures,
  requestRetriage,
  type RecentCapture,
} from "../../data/captureList";
import { colors, fontFamily } from "../../theme/tokens";

const MAX_LEN = 4096; // the server's cap (app/app/capture.py MAX_TEXT_LEN)

export default function CaptureScreen() {
  const [text, setText] = useState("");
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const box = appOutbox();
    const refresh = async (): Promise<void> => {
      const depth = await box.outbox.depth();
      // read AFTER the sync settles (the wake screen's rule — M5's weak
      // assertion was a claim that never re-read the store): depth 0 means
      // the server took it, > 0 means it is still honestly queued.
      if (depth === 0) setStatus("sent");
      else setStatus(`queued · will sync (${depth})`);
    };
    void box.outbox
      .enqueue("capture_raw", { text: trimmed })
      .then(async () => {
        setText("");
        await refresh();
        // the immediate sync may still be in flight when the first depth
        // read lands — refine the claim when it settles
        void box
          .sync()
          .then(refresh)
          .catch(() => {
            /* the funnel swallows its own errors */
          });
      })
      .catch(() => setStatus("could not queue — try again"))
      .finally(() => setBusy(false));
  }, [text, busy]);

  // returning to the sheet: refetch the queue depth so the claim matches
  // what the outbox actually holds (the wake screen's honesty rule)
  const [recent, setRecent] = useState<RecentCapture[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      const box = appOutbox();
      void box.outbox.depth().then((depth) => {
        if (live && depth > 0) setStatus(`queued · will sync (${depth})`);
      });
      // the capture list: every capture with its honest triage state —
      // failed ones carry the manual retry affordance (T2.3: failures are
      // visible, and the human decides when to retry)
      void fetchRecentCaptures().then((list) => {
        if (live) setRecent(list);
      });
      return () => {
        live = false;
      };
    }, []),
  );

  const retry = useCallback(
    async (ref: string) => {
      await requestRetriage(ref);
      const list = await fetchRecentCaptures();
      setRecent(list);
    },
    [],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <Text accessibilityRole="header" accessibilityLabel="Capture" style={styles.heading}>
        CAPTURE
      </Text>
      <TextInput
        accessibilityLabel="capture text"
        style={styles.input}
        multiline
        autoFocus
        maxLength={MAX_LEN}
        placeholder="one thought, action, question, meal…"
        placeholderTextColor={colors["--muted"]}
        value={text}
        onChangeText={setText}
        onSubmitEditing={send}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="send capture"
        accessibilityState={{ disabled: busy || !text.trim() }}
        style={[styles.send, (!text.trim() || busy) && styles.sendDisabled]}
        disabled={!text.trim() || busy}
        onPress={send}
      >
        <Text style={styles.sendLabel}>SEND</Text>
      </Pressable>
      {status !== null ? (
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {status}
        </Text>
      ) : null}
      <Text style={styles.counter}>
        {text.length}/{MAX_LEN}
      </Text>

      {recent !== null && recent.length > 0 ? (
        <View style={styles.recentBox}>
          <Text style={styles.recentHeading}>RECENT</Text>
          {recent.map((c) => (
            <View key={c.capture_id} style={styles.recentRow}>
              <View style={styles.recentMain}>
                <Text numberOfLines={1} style={styles.recentText}>
                  {c.text ?? c.photo_ref ?? "(photo)"}
                </Text>
                <Text style={styles.recentState}>
                  {c.state === "triaged"
                    ? `triaged · ${c.target}`
                    : c.state === "failed"
                      ? `failed · ${c.reason}`
                      : "untriaged"}
                </Text>
              </View>
              {c.state !== "triaged" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`retry triage: ${c.text ?? c.photo_ref ?? ""}`}
                  style={styles.recentRetry}
                  onPress={() => void retry(c.external_ref)}
                >
                  <Text style={styles.recentRetryLabel}>retry</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  recentBox: {
    gap: 6,
    maxHeight: 180,
  },
  recentHeading: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 12,
    letterSpacing: 1.2,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recentMain: {
    flex: 1,
  },
  recentText: {
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  recentState: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  recentRetry: {
    borderWidth: 1,
    borderColor: colors["--accent-1"],
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  recentRetryLabel: {
    color: colors["--accent-1"],
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
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
  input: {
    flex: 1,
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 16,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: colors["--muted"],
    borderRadius: 12,
    padding: 12,
  },
  send: {
    backgroundColor: colors["--accent-1"],
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    height: 56,
  },
  sendDisabled: {
    opacity: 0.4,
  },
  sendLabel: {
    color: colors["--bg"],
    fontFamily: fontFamily.regular,
    fontSize: 16,
    letterSpacing: 1.6,
  },
  status: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
  counter: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 12,
    textAlign: "right",
  },
});
