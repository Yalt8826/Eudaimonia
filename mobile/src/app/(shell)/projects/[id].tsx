// The project detail (T3.6, 07 §17): derived progress, linked work by
// payload query, parked-since in muted — no percentage exists anywhere,
// and a project with no board shows no health line (law 7: absence is
// data, a fabricated health line is the defect).
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchProjects, type ProjectRow } from "../../../data/projects";
import { colors, fontFamily } from "../../../theme/tokens";

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const insets = useSafeAreaInsets();

  const refresh = useCallback(async () => {
    const rows = await fetchProjects();
    if (rows === null) {
      setUnreachable(true);
      return;
    }
    setUnreachable(false);
    const pid = Number(id);
    setProject(rows.find((p) => p.project_id === pid) ?? null);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <Text accessibilityRole="header" accessibilityLabel="Project" style={styles.heading}>
        {project?.name ?? "PROJECT"}
      </Text>
      {project === null ? (
        <Text style={styles.muted}>
          {unreachable ? "server unreachable — the detail needs the network" : "loading"}
        </Text>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ gap: 14 }}>
          <View style={styles.block}>
            <Text style={styles.blockHead}>STATUS</Text>
            <Text style={styles.text}>
              {project.status}
              {project.status === "parked" && project.parked_since
                ? ` · parked since ${project.parked_since}`
                : ""}
            </Text>
          </View>
          <View style={styles.block}>
            <Text style={styles.blockHead}>LINKED WORK</Text>
            {project.linked_work ? (
              <>
                <Text style={styles.text}>
                  {project.linked_work.open} open · {project.linked_work.resolved} resolved
                </Text>
                <Text style={styles.meta}>
                  derived from the spine&apos;s payloads on every read — nothing stored
                </Text>
              </>
            ) : (
              <Text style={styles.muted}>no linked work yet</Text>
            )}
          </View>
          <View style={styles.block}>
            <Text style={styles.blockHead}>ACTIVITY</Text>
            {project.last_activity ? (
              <Text style={styles.text}>last spine activity {project.last_activity.slice(0, 10)}</Text>
            ) : (
              <Text style={styles.muted}>no linked activity yet</Text>
            )}
          </View>
          <View style={styles.block}>
            <Text style={styles.blockHead}>BOARD</Text>
            {project.board_health !== null ? (
              <Text style={styles.text}>linked board — health through the tenancy engine</Text>
            ) : (
              <Text style={styles.muted}>no board linked — no health line (law 7)</Text>
            )}
          </View>
        </ScrollView>
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
  list: {
    gap: 12,
  },
  block: {
    gap: 4,
  },
  blockHead: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    letterSpacing: 1.2,
  },
  text: {
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 14.5,
  },
  meta: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
  },
  muted: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
});
