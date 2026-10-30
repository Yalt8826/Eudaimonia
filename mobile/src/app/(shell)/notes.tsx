// The notes screen (T2.4): recent notes with their honest write-back
// state — staged (waiting for the applier) or applied (in the vault, with
// the line ref). Unreachable resolves null and the screen says so —
// never a fabricated list (law 7's cousin: failure must not read as data).
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchRecentNotes, type RecentNote } from "../../data/notes";
import { colors, fontFamily } from "../../theme/tokens";

export default function NotesScreen() {
  const [notes, setNotes] = useState<RecentNote[] | null>(null);
  const insets = useSafeAreaInsets();
  const [unreachable, setUnreachable] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void fetchRecentNotes().then((list) => {
        if (live) {
          setNotes(list);
          setUnreachable(list === null);
        }
      });
      return () => {
        live = false;
      };
    }, []),
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <Text accessibilityRole="header" accessibilityLabel="Notes" style={styles.heading}>
        NOTES
      </Text>
      {unreachable ? (
        <Text style={styles.muted}>notes · server unreachable</Text>
      ) : notes !== null && notes.length === 0 ? (
        <Text style={styles.muted}>no notes yet — capture one and triage it to note</Text>
      ) : notes !== null ? (
        <ScrollView style={styles.list}>
          {notes.map((n) => (
            <View key={n.note_id} style={styles.row}>
              <Text style={styles.noteText}>{n.text}</Text>
              <Text style={styles.state}>
                {n.state === "applied"
                  ? `in the vault · ${n.vault_ref ?? ""}`
                  : "staged · waiting for the applier"}
              </Text>
            </View>
          ))}
        </ScrollView>
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
    gap: 4,
  },
  noteText: {
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  state: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  muted: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
});
