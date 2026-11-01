// Local-first task pages: reads come from the phone (last server copy +
// queued writes), writes land in the task queue and show at once, and the
// queue drains to the server whenever it can (appOutbox.ts taskOutbox).
// Hermes's changes arrive with the next successful read.
import { taskOutbox } from "./appOutbox";
import {
  cacheKey,
  fetchTask,
  localView,
  type PendingWrite,
  type TaskDetail,
  type TaskKind,
} from "./tasks";

export type ServerState = "synced" | "offline" | "outdated";

async function pendingWrites(): Promise<PendingWrite[]> {
  const records = await taskOutbox().pending();
  return records.map((r) => ({ kind: r.kind, ts: r.ts, payload: r.payload }));
}

function cached(subject: string): TaskDetail | null {
  const raw = taskOutbox().kv.getItem(cacheKey(subject));
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as TaskDetail;
  } catch {
    return null;
  }
}

/** The page right now, without touching the network. */
export async function readLocal(subject: string): Promise<{ detail: TaskDetail; pending: number }> {
  const pending = await pendingWrites();
  return { detail: localView(subject, cached(subject), pending), pending: pending.length };
}

/** Push queued writes, refresh the server copy, and return the local view. */
export async function syncTask(
  subject: string,
): Promise<{ detail: TaskDetail; pending: number; server: ServerState }> {
  const box = taskOutbox();
  try {
    await box.sync();
  } catch {
    // stays queued
  }
  const fetched = await fetchTask(subject);
  if (fetched !== null && fetched !== "outdated") {
    box.kv.setItem(cacheKey(subject), JSON.stringify(fetched));
  }
  const local = await readLocal(subject);
  return {
    ...local,
    server: fetched === "outdated" ? "outdated" : fetched === null ? "offline" : "synced",
  };
}

/** Record a write locally (it shows at once); the caller then syncs. */
export async function writeTask(kind: TaskKind, payload: Record<string, unknown>): Promise<void> {
  await taskOutbox().outbox.enqueue(kind, payload);
}

/** Local views of several tasks (the plan card's rows), no network. */
export async function readLocalMany(subjects: readonly string[]): Promise<Map<string, TaskDetail>> {
  const pending = await pendingWrites();
  return new Map(subjects.map((s) => [s, localView(s, cached(s), pending)]));
}

/** One sync for the queue, then a fresh server copy of each task. */
export async function syncMany(subjects: readonly string[]): Promise<Map<string, TaskDetail>> {
  const box = taskOutbox();
  try {
    await box.sync();
  } catch {
    // stays queued
  }
  await Promise.all(
    subjects.map(async (s) => {
      const fetched = await fetchTask(s);
      if (fetched !== null && fetched !== "outdated") box.kv.setItem(cacheKey(s), JSON.stringify(fetched));
    }),
  );
  return readLocalMany(subjects);
}
