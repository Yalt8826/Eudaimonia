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

import { appOutbox } from "../../data/appOutbox";
import { colors, fontFamily } from "../../theme/tokens";

const MAX_LEN = 4096; // the server's cap (app/app/capture.py MAX_TEXT_LEN)

export default function CaptureScreen() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    const box = appOutbox();
    void box.outbox
      .enqueue("capture_raw", { text: trimmed })
      .then(async () => {
        const depth = await box.outbox.depth();
        setStatus(depth === 0 ? "sent" : `queued · will sync (${depth})`);
        setText("");
      })
      .catch(() => setStatus("could not queue — try again"))
      .finally(() => setBusy(false));
  }, [text, busy]);

  // returning to the sheet: refetch the queue depth so the claim matches
  // what the outbox actually holds (the wake screen's honesty rule)
  useFocusEffect(
    useCallback(() => {
      let live = true;
      const box = appOutbox();
      void box.outbox.depth().then((depth) => {
        if (live && depth > 0) setStatus(`queued · will sync (${depth})`);
      });
      return () => {
        live = false;
      };
    }, []),
  );

  return (
    <View style={styles.screen}>
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
