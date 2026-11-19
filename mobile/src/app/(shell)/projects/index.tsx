// The projects board (T3.6, 04 /projects, 07 §17): three columns —
// active · parked · done. Rows are neutral with a status dot; teal is
// reserved for the park/reactivate ACTION (01 §4). A parked project
// renders muted with its parked-since date — lapsed plans are
// information, never a warning (02 §6 muted-never-red). Progress is
// derived: the linked-work counts come from payload queries and a
// project with no board renders NO health line at all (law 7).
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  fetchProjects,
  writeProjectStatus,
  type ProjectRow,
  type ProjectStatus,
} from "../../../data/projects";
import { colors, fontFamily } from "../../../theme/tokens";

export default function ProjectsScreen() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const refresh = useCallback(async () => {
    const rows = await fetchProjects();
    if (rows === null) {
      setUnreachable(true);
      return;
    }
    setUnreachable(false);
    setProjects(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const setStatus = useCallback(
    async (project: ProjectRow, status: ProjectStatus) => {
      await writeProjectStatus(project.project_id, status);
      void refresh();
    },
    [refresh],
  );

  const row = (project: ProjectRow) => {
    const parked = project.status === "parked";
    return (
      <View key={project.project_id} style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`open ${project.name}`}
          style={styles.rowMain}
          onPress={() => router.push(`/projects/${project.project_id}`)}
        >
          <View style={[styles.dot, { backgroundColor: parked ? colors["--muted"] : colors["--text"] }]} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[styles.name, parked && styles.muted]}>{project.name}</Text>
            <Text style={styles.meta}>
              {parked && project.parked_since
                ? `parked since ${project.parked_since}`
                : project.status}
              {project.last_activity ? ` · last activity ${project.last_activity.slice(0, 10)}` : ""}
              {project.linked_work
                ? ` · ${project.linked_work.open} open / ${project.linked_work.resolved} resolved`
                : ""}
            </Text>
            {/* board health renders ONLY when a board chain exists —
                unlinked projects show no line at all (law 7) */}
            {project.board_health !== null ? <Text style={styles.meta}>board health line</Text> : null}
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={parked ? `re-activate ${project.name}` : `park ${project.name}`}
          style={styles.actionBtn}
          onPress={() => void setStatus(project, parked ? "active" : "parked")}
        >
          <Text style={[styles.actionLabel, parked && styles.actionLabelOn]}>
            {parked ? "resume" : "park"}
          </Text>
        </Pressable>
      </View>
    );
  };

  const column = (title: string, rows: ProjectRow[], emptyLine: string) => (
    <View style={styles.column}>
      <Text accessibilityRole="header" style={styles.colHead}>
        {title}
      </Text>
      {rows.length > 0 ? rows.map(row) : <Text style={styles.empty}>{emptyLine}</Text>}
    </View>
  );

  const active = projects?.filter((p) => p.status === "active") ?? [];
  const parked = projects?.filter((p) => p.status === "parked") ?? [];
  const done = projects?.filter((p) => p.status === "done") ?? [];

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
      <Text accessibilityRole="header" accessibilityLabel="Projects" style={styles.heading}>
        PROJECTS
      </Text>
      <Text style={styles.muted}>
        {unreachable
          ? "server unreachable — the board needs the network"
          : "derived health, never entered · parked is a human decision"}
      </Text>
      {projects === null ? null : (
        <ScrollView style={styles.list}>
          {column("ACTIVE", active, "nothing active")}
          {column("PARKED", parked, "nothing parked")}
          {column("DONE", done, "nothing done yet")}
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
  muted: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  list: {
    gap: 10,
  },
  column: {
    gap: 8,
    marginBottom: 12,
  },
  colHead: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
    letterSpacing: 1.2,
  },
  row: {
    borderWidth: 1,
    borderColor: colors["--glass-border"],
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  name: {
    color: colors["--text"],
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  meta: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 11.5,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: colors["--accent-1"],
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  actionLabel: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  actionLabelOn: {
    color: colors["--accent-1"],
  },
  empty: {
    color: colors["--muted"],
    fontFamily: fontFamily.regular,
    fontSize: 12.5,
  },
});
