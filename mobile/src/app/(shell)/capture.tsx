// The capture sheet (T2.3, 04 /capture): one textarea, one send — the
// phone's door into the same inbox fuzzel feeds. Offline it queues via
// the T2.1 armor (the outbox's generic door: kind `capture_raw`) and the
// status claims the OUTBOX DEPTH, exactly like the wake screen: never a
// fabricated sync (law 9; failure must not read as success).
//
// Triage is the server's business after landing (agent_invoke, 180 s,
// background) — this screen's whole job is to not lose the text.
//
// The tag chips (single-select): #meal is the server's CONTRACT
// (capture.py MEAL_TAG — the tag IS the human's classification, it skips
// clio and routes straight to Hygeia). The other four carry their word
// so clio's classifier lands on the same noun; the RECENT list still
// shows what actually landed — the chip steers, it never promises.
// The tag table and the compose rule live in data/captureTags.ts; the
// icons (stroke glyphs, tinted by active state) live here.
import { useCallback, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect as SvgRect } from "react-native-svg";

import { appOutbox } from "../../data/appOutbox";
import {
  fetchRecentCaptures,
  requestRetriage,
  type RecentCapture,
} from "../../data/captureList";
import { TAGS, composeCapture } from "../../data/captureTags";
import { colors, fontFamily } from "../../theme/tokens";

const MAX_LEN = 4096; // the server's cap (app/app/capture.py MAX_TEXT_LEN)

const stroke = (color: string) => ({
  fill: "none",
  stroke: color,
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

/** Each tag's glyph, tinted by state: the sheet ink when active, muted
    at rest — the icon is part of the chip's honesty, same rule as text. */
const TAG_ICONS: Record<string, (c: string) => ReactNode> = {
  meal: (c) => (
    <Svg viewBox="0 0 24 24" width={15} height={15}>
      <Path {...stroke(c)} d="M4 11h16M5 11a7 7 0 0 0 14 0M9 21h6M12 18v3" />
    </Svg>
  ),
  task: (c) => (
    <Svg viewBox="0 0 24 24" width={15} height={15}>
      <SvgRect {...stroke(c)} x={3.5} y={3.5} width={17} height={17} rx={4} />
      <Path {...stroke(c)} d="M8 12.2l2.8 2.8 5.2-6" />
    </Svg>
  ),
  question: (c) => (
    <Svg viewBox="0 0 24 24" width={15} height={15}>
      <Path {...stroke(c)} d="M8.8 9a3.2 3.2 0 1 1 4.7 2.8c-.9.5-1.5 1.1-1.5 2.2v.5" />
      <Circle cx={12} cy={18.6} r={1.3} fill={c} />
    </Svg>
  ),
  waiting: (c) => (
    <Svg viewBox="0 0 24 24" width={15} height={15}>
      <Circle {...stroke(c)} cx={12} cy={12} r={8.5} />
      <Path {...stroke(c)} d="M12 7.5V12l3 2" />
    </Svg>
  ),
  note: (c) => (
    <Svg viewBox="0 0 24 24" width={15} height={15}>
      <SvgRect {...stroke(c)} x={4.5} y={3} width={15} height={18} rx={2} />
      <Path {...stroke(c)} d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </Svg>
  ),
};

export default function CaptureScreen() {
  // T2.6: the meal deep-link (?meal=1, the FAB's contextual tap on
  // /meals) arrives with the meal chip already active — the composed
  // capture carries #meal and the server routes it to Hygeia
  const { meal } = useLocalSearchParams<{ meal?: string }>();
  const [text, setText] = useState("");
  const [tag, setTag] = useState<string | null>(meal !== undefined ? "meal" : null);
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // the text the outbox carries: the chip's prefix rides at the FRONT
  // (capture.py matches startswith on #meal) — composeCapture in
  // data/captureTags.ts owns the rule
  const compose = useCallback((): string => composeCapture(text, tag), [text, tag]);

  const toggleTag = useCallback((key: string) => {
    // single-select: a capture lands as EXACTLY ONE noun (the server's
    // classifier is one-of-six), so the chips are too
    setTag((cur) => (cur === key ? null : key));
  }, []);

  const send = useCallback(() => {
    const composed = compose();
    if (!composed || busy) return;
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
      .enqueue("capture_raw", { text: composed })
      .then(async () => {
        setText("");
        setTag(null);
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
  }, [compose, busy]);

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
      {/* the tag chips — single-select classification shortcuts. Active
          wears its sheet paper + ink; resting is glass + muted. */}
      <View style={styles.tagRow}>
        {TAGS.map((t) => {
          const active = tag === t.key;
          return (
            <Pressable
              key={t.key}
              accessibilityRole="button"
              accessibilityLabel={`tag ${t.label}`}
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && { backgroundColor: t.paper, borderColor: t.paper }]}
              onPress={() => toggleTag(t.key)}
            >
              {TAG_ICONS[t.key]?.(active ? t.ink : colors["--muted"])}
              <Text style={[styles.chipLabel, { color: active ? t.ink : colors["--muted"] }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="send capture"
        accessibilityState={{ disabled: busy || !compose() }}
        style={[styles.send, (!compose() || busy) && styles.sendDisabled]}
        disabled={!compose() || busy}
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
        {compose().length}/{MAX_LEN}
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
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors["--glass-fill"],
    borderWidth: 1,
    borderColor: colors["--glass-border"],
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
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
