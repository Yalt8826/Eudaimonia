// Task pages (the plan card's rows): per-subject next-time notes,
// subtasks and timed sessions. Reads come from /api/tasks; writes ride the
// outbox (/api/events/{kind}) so they survive being offline — and Hermes
// writes the same kinds through its own door on olympus, so both show up
// on one thread (app/app/tasks.py).
import { apiUrl } from "./api";

export interface TaskItem {
  id: string;
  type: "subtask" | "next";
  text: string;
  done: boolean;
  ts: string;
  actor: string;
}

export interface TaskHistoryEntry {
  kind: "session" | "log";
  id: string;
  ts: string;
  ended_at: string | null;
  minutes: number | null;
  capped: boolean;
  text: string | null;
  actor: string;
}

export interface TaskDetail {
  subject: string;
  next: TaskItem[];
  subtasks: TaskItem[];
  running: { session_id: string; started_at: string } | null;
  history: TaskHistoryEntry[];
  minutes_7d: number;
  minutes_total: number;
}

export interface TaskSummary {
  subject: string;
  next_first: string | null;
  next_count: number;
  open_subtasks: number;
  running: { session_id: string; started_at: string } | null;
  minutes_7d: number;
}

export type TaskKind =
  | "task_item_added"
  | "task_item_checked"
  | "task_item_removed"
  | "task_session_started"
  | "task_session_ended"
  | "task_log_added";

export function emptyTask(subject: string): TaskDetail {
  return { subject, next: [], subtasks: [], running: null, history: [], minutes_7d: 0, minutes_total: 0 };
}

/**
 * One task, or null when unreachable (offline — writes still queue), or
 * "outdated" when the server answers but has no task API yet (404). The
 * page must not queue writes then: the outbox replays in order and stops
 * at the first rejected event, so one task event an old server 422s would
 * hold every wake tap behind it.
 */
export async function fetchTask(
  subject: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<TaskDetail | "outdated" | null> {
  try {
    const r = await fetchFn(apiUrl(`/api/tasks/${encodeURIComponent(subject)}`));
    if (r.status === 404) return "outdated";
    if (!(r.status >= 200 && r.status < 300)) return null;
    const b = (await r.json()) as TaskDetail;
    if (typeof b !== "object" || b === null || !Array.isArray(b.subtasks)) return null;
    return b;
  } catch {
    return null;
  }
}

export async function fetchTaskSummaries(
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<TaskSummary[] | null> {
  try {
    const r = await fetchFn(apiUrl("/api/tasks"));
    if (!(r.status >= 200 && r.status < 300)) return null;
    const b = (await r.json()) as { tasks?: unknown };
    return Array.isArray(b.tasks) ? (b.tasks as TaskSummary[]) : null;
  } catch {
    return null;
  }
}

/** A 16-char id for items/sessions/logs (the server accepts 8-64, no ':'). */
export function newTaskId(now: number = Date.now()): string {
  return (now.toString(36) + Math.random().toString(36).slice(2, 12)).slice(0, 16).padEnd(8, "0");
}

/**
 * Apply a write to the page locally, so it shows at once — the outbox
 * may hold it until the connection returns. Mirrors the server fold.
 */
export function applyLocal(
  detail: TaskDetail,
  kind: TaskKind,
  payload: Record<string, unknown>,
  nowIso: string,
): TaskDetail {
  const d: TaskDetail = {
    ...detail,
    next: [...detail.next],
    subtasks: [...detail.subtasks],
    history: [...detail.history],
  };
  const id = String(payload.item_id ?? "");
  switch (kind) {
    case "task_item_added": {
      const item: TaskItem = {
        id,
        type: payload.type === "next" ? "next" : "subtask",
        text: String(payload.text),
        done: false,
        ts: nowIso,
        actor: "human",
      };
      if (item.type === "next") d.next.push(item);
      else d.subtasks.push(item);
      return d;
    }
    case "task_item_checked": {
      const done = payload.done === true;
      d.subtasks = d.subtasks.map((s) => (s.id === id ? { ...s, done } : s));
      if (done) d.next = d.next.filter((n) => n.id !== id);
      return d;
    }
    case "task_item_removed":
      d.subtasks = d.subtasks.filter((s) => s.id !== id);
      d.next = d.next.filter((n) => n.id !== id);
      return d;
    case "task_session_started":
      d.running = { session_id: String(payload.session_id), started_at: nowIso };
      return d;
    case "task_session_ended": {
      const started = d.running?.started_at ?? nowIso;
      const minutes = Math.max(0, Math.floor((Date.parse(nowIso) - Date.parse(started)) / 60000));
      const note = typeof payload.note === "string" && payload.note.trim() ? payload.note.trim() : null;
      d.history.unshift({
        kind: "session",
        id: String(payload.session_id),
        ts: started,
        ended_at: nowIso,
        minutes,
        capped: false,
        text: note,
        actor: "human",
      });
      d.running = null;
      d.minutes_7d += minutes;
      d.minutes_total += minutes;
      return d;
    }
    case "task_log_added":
      d.history.unshift({
        kind: "log",
        id: String(payload.log_id),
        ts: nowIso,
        ended_at: null,
        minutes: typeof payload.minutes === "number" ? payload.minutes : null,
        capped: false,
        text: String(payload.text),
        actor: "human",
      });
      return d;
  }
}

/** "1h 05m", "45m", "0m". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Stopwatch text for a running session: "23:41" or "1:02:05". */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** The card row's hint under a block: running timer, next note, open count. */
export function taskHint(summary: TaskSummary | undefined, now: Date): string | null {
  if (summary === undefined) return null;
  const parts: string[] = [];
  if (summary.running) {
    const mins = Math.max(0, Math.floor((now.getTime() - Date.parse(summary.running.started_at)) / 60000));
    parts.push(`• ${formatMinutes(mins)} running`);
  }
  if (summary.next_first) parts.push(`next: ${summary.next_first}`);
  if (summary.open_subtasks > 0) parts.push(`${summary.open_subtasks} open`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
