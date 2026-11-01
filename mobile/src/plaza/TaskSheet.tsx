// One task's page, opened from a row on the plan card: a session timer,
// notes left for next time, a subtask checklist, and the history of past
// sessions. Everything writes through the outbox (offline-safe) and shows
// at once; Hermes writes the same thread from olympus (app/app/tasks.py).
//
// Plain RN text on the sheet's glass: --text 14.88, --muted 6.17, the
// teal 9.38, and --bg on the teal button well above 4.5.
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from "react-native";

import { appOutbox } from "../data/appOutbox";
import {
  applyLocal,
  emptyTask,
  fetchTask,
  formatElapsed,
  formatMinutes,
  newTaskId,
  type TaskDetail,
  type TaskHistoryEntry,
  type TaskKind,
} from "../data/tasks";
import { colors, fontFamily } from "../theme/tokens";
import { BottomSheet } from "./BottomSheet";
import { useNow } from "./useNow";

const MONO = "IBMPlexMono_400Regular";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function historyMeta(h: TaskHistoryEntry): string {
  const parts = [dayLabel(h.ts)];
  if (h.minutes) parts.push(h.capped ? `${formatMinutes(h.minutes)}+ (timer left on)` : formatMinutes(h.minutes));
  if (h.actor !== "human") parts.push(`via ${h.actor}`);
  return parts.join(" · ");
}

/** A one-line input with an Add button; submits trimmed, non-empty text. */
function AddRow({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText("");
  };
  return (
    <View style={styles.addRow}>
      <TextInput
        accessibilityLabel={placeholder}
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors["--muted"]}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        returnKeyType="done"
        submitBehavior="submit"
      />
      <Pressable accessibilityRole="button" accessibilityLabel={`Add: ${placeholder}`} onPress={submit} style={styles.addBtn} hitSlop={6}>
        <Text style={styles.addBtnText}>Add</Text>
      </Pressable>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export function TaskSheet({
  open,
  onClose,
  subject,
  context,
}: {
  open: boolean;
  onClose: () => void;
  subject: string;
  /** e.g. "3:45–6:45pm · GRE deep work (~3h)" — where it sits today. */
  context: string | null;
}) {
  const [detail, setDetail] = useState<TaskDetail>(() => emptyTask(subject));
  const [reachable, setReachable] = useState<boolean | "outdated" | null>(null);
  const [queued, setQueued] = useState(0);
  const [stopping, setStopping] = useState(false);
  const [note, setNote] = useState("");
  const now = useNow(1000);

  const refresh = useCallback(async () => {
    const d = await fetchTask(subject);
    setReachable(d === "outdated" ? "outdated" : d !== null);
    if (d !== null && d !== "outdated") setDetail(d);
  }, [subject]);

  // mounted per opening (the parent unmounts it on close), so state starts
  // fresh each time; this is the first read
  useEffect(() => {
    let live = true;
    void fetchTask(subject).then((d) => {
      if (!live) return;
      setReachable(d === "outdated" ? "outdated" : d !== null);
      if (d !== null && d !== "outdated") setDetail(d);
    });
    return () => {
      live = false;
    };
  }, [subject]);

  const write = useCallback(
    async (kind: TaskKind, payload: Record<string, unknown>) => {
      if (reachable === "outdated") return; // see fetchTask: never queue what the server rejects
      setDetail((d) => applyLocal(d, kind, payload, new Date().toISOString()));
      const box = appOutbox();
      await box.outbox.enqueue(kind, payload);
      setQueued(await box.outbox.depth());
      try {
        await box.sync();
      } catch {
        // stays queued; the depth below says so
      }
      const depth = await box.outbox.depth();
      setQueued(depth);
      if (depth === 0) void refresh();
    },
    [refresh, reachable],
  );

  const running = detail.running;
  const elapsed = running ? now.getTime() - Date.parse(running.started_at) : 0;
  const openSubtasks = detail.subtasks.filter((s) => !s.done);
  const doneSubtasks = detail.subtasks.filter((s) => s.done);

  const header = (
    <View accessible accessibilityRole="header" accessibilityLabel={`${subject}${context ? `, ${context}` : ""}`}>
      <Text style={styles.title}>{detail.subject || subject}</Text>
      {context ? <Text style={styles.meta}>{context}</Text> : null}
      <Text style={styles.meta}>
        this week {formatMinutes(detail.minutes_7d)} · all time {formatMinutes(detail.minutes_total)}
        {reachable === false ? " · offline, showing what you add" : ""}
        {reachable === "outdated" ? " · the server needs updating before notes can be saved" : ""}
        {queued > 0 ? ` · ${queued} queued` : ""}
      </Text>
    </View>
  );

  return (
    <BottomSheet open={open} onClose={onClose} closeLabel={`Close ${subject}`} header={header} heightRatio={0.9} fullHeight>
      {() => (
        <>
          {/* the session timer */}
          <View style={styles.timer}>
            <Text
              accessibilityLabel={running ? `session running, ${formatElapsed(elapsed)}` : "no session running"}
              style={[styles.clock, !running && { color: colors["--muted"] }]}
            >
              {formatElapsed(elapsed)}
            </Text>
            {running ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop session"
                onPress={() => setStopping(true)}
                style={[styles.timerBtn, styles.timerBtnSolid]}
              >
                <Text style={[styles.timerBtnText, { color: colors["--bg"] }]}>Stop</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Start session"
                onPress={() => void write("task_session_started", { subject, session_id: newTaskId() })}
                style={styles.timerBtn}
              >
                <Text style={styles.timerBtnText}>Start session</Text>
              </Pressable>
            )}
          </View>
          {running && stopping ? (
            <View style={styles.stopBox}>
              <TextInput
                accessibilityLabel="What did you get done this session?"
                style={[styles.input, styles.noteInput]}
                placeholder="What did you get done? (optional)"
                placeholderTextColor={colors["--muted"]}
                value={note}
                onChangeText={setNote}
                multiline
                autoFocus
              />
              <View style={styles.stopActions}>
                <Pressable accessibilityRole="button" onPress={() => setStopping(false)} hitSlop={6}>
                  <Text style={styles.linkMuted}>keep going</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Save session"
                  onPress={() => {
                    const payload: Record<string, unknown> = { session_id: running.session_id };
                    if (note.trim()) payload.note = note.trim();
                    setStopping(false);
                    setNote("");
                    void write("task_session_ended", payload);
                  }}
                  style={[styles.timerBtn, styles.timerBtnSolid]}
                >
                  <Text style={[styles.timerBtnText, { color: colors["--bg"] }]}>Save session</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Section title="NEXT TIME">
            {detail.next.map((n) => (
              <View key={n.id} style={styles.nextRow}>
                <Text style={styles.nextText}>
                  {n.text}
                  {n.actor !== "human" ? <Text style={styles.via}>{`  via ${n.actor}`}</Text> : null}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Dismiss note: ${n.text}`}
                  onPress={() => void write("task_item_checked", { item_id: n.id, done: true })}
                  hitSlop={8}
                >
                  <Text style={styles.linkAccent}>done</Text>
                </Pressable>
              </View>
            ))}
            <AddRow
              placeholder="Note for next session"
              onAdd={(text) => void write("task_item_added", { subject, item_id: newTaskId(), type: "next", text })}
            />
          </Section>

          <Section title={`SUBTASKS${openSubtasks.length ? ` · ${openSubtasks.length} open` : ""}`}>
            {[...openSubtasks, ...doneSubtasks].map((s) => (
              <View key={s.id} style={styles.subRow}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: s.done }}
                  accessibilityLabel={s.text}
                  onPress={() => void write("task_item_checked", { item_id: s.id, done: !s.done })}
                  style={styles.subMain}
                >
                  <View style={[styles.box, s.done && styles.boxDone]}>
                    {s.done ? <Text style={styles.tick}>✓</Text> : null}
                  </View>
                  <Text style={[styles.subText, s.done && styles.subTextDone]}>
                    {s.text}
                    {s.actor !== "human" ? <Text style={styles.via}>{`  via ${s.actor}`}</Text> : null}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove subtask: ${s.text}`}
                  onPress={() => void write("task_item_removed", { item_id: s.id })}
                  hitSlop={8}
                >
                  <Text style={styles.remove}>×</Text>
                </Pressable>
              </View>
            ))}
            <AddRow
              placeholder="Add a subtask"
              onAdd={(text) => void write("task_item_added", { subject, item_id: newTaskId(), type: "subtask", text })}
            />
          </Section>

          <Section title="SESSIONS">
            <AddRow
              placeholder="Log what you did (no timer)"
              onAdd={(text) => void write("task_log_added", { subject, log_id: newTaskId(), text })}
            />
            {detail.history.length === 0 ? (
              <Text style={styles.empty}>no sessions yet — start the timer, or log one</Text>
            ) : (
              detail.history.map((h) => (
                <View key={h.id} style={styles.historyRow}>
                  <Text style={styles.historyMeta}>{historyMeta(h)}</Text>
                  {h.text ? <Text style={styles.historyText}>{h.text}</Text> : null}
                </View>
              ))
            )}
          </Section>
        </>
      )}
    </BottomSheet>
  );
}

const mono: TextStyle = { fontFamily: MONO };

const styles = StyleSheet.create({
  title: { fontFamily: fontFamily.bold, fontSize: 22, color: colors["--text"], marginBottom: 2 },
  meta: { ...mono, fontSize: 12, color: colors["--muted"], marginTop: 2 },
  timer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors["--glass-border"],
    backgroundColor: colors["--glass-fill"],
  },
  clock: { ...mono, fontSize: 32, color: colors["--text"] },
  timerBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: colors["--accent-1"],
  },
  timerBtnSolid: { backgroundColor: colors["--accent-1"] },
  timerBtnText: { fontFamily: fontFamily.bold, fontSize: 14, color: colors["--accent-1"] },
  stopBox: { marginTop: 10, gap: 10 },
  stopActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 18 },
  noteInput: { minHeight: 64, textAlignVertical: "top" },
  section: { marginTop: 22 },
  sectionTitle: { ...mono, fontSize: 11.5, letterSpacing: 1.2, color: colors["--muted"], marginBottom: 8 },
  nextRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors["--accent-1"],
    backgroundColor: colors["--glass-fill"],
  },
  nextText: { flex: 1, fontFamily: fontFamily.regular, fontSize: 15, color: colors["--text"] },
  via: { ...mono, fontSize: 11, color: colors["--muted"] },
  linkAccent: { ...mono, fontSize: 12.5, color: colors["--accent-1"] },
  linkMuted: { ...mono, fontSize: 12.5, color: colors["--muted"] },
  subRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  subMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors["--muted"],
    alignItems: "center",
    justifyContent: "center",
  },
  boxDone: { backgroundColor: colors["--accent-1"], borderColor: colors["--accent-1"] },
  tick: { fontSize: 13, lineHeight: 15, color: colors["--bg"], fontWeight: "700" },
  subText: { flex: 1, fontFamily: fontFamily.regular, fontSize: 15, color: colors["--text"] },
  subTextDone: { color: colors["--muted"], textDecorationLine: "line-through" },
  remove: { fontSize: 20, color: colors["--muted"], paddingHorizontal: 4 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  input: {
    flex: 1,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors["--text"],
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors["--glass-border"],
    backgroundColor: colors["--glass-fill"],
  },
  addBtn: { paddingVertical: 8, paddingHorizontal: 6 },
  addBtnText: { ...mono, fontSize: 13, color: colors["--accent-1"] },
  empty: { ...mono, fontSize: 12.5, color: colors["--muted"], marginTop: 10 },
  historyRow: {
    marginTop: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors["--glass-border"],
  },
  historyMeta: { ...mono, fontSize: 11.5, color: colors["--muted"] },
  historyText: { fontFamily: fontFamily.regular, fontSize: 14.5, color: colors["--text"], marginTop: 3 },
});
