// Routine ticks (T2.7): the plan's blocks as tickable planned structure.
//
// The queue IS T2.1's — this module enqueues onto the app outbox (the
// wake-tap queue) and declares no queue of its own; the structural test
// below pins that. A tick is a wake-class write: it rides the same
// idempotency guard, the same serialized drain, the same triggers. The
// three hard-mode fields are fixed in queue.ts, not here.
//
// Server contract (app/app/routines.py, 07 §18/§19):
//   routine_done  payload {routine_key, date, method: 'tap'|'recall'}
//   routine_skip  payload {routine_key, date}            — no method
//   external_ref  "{routine_key}:{date}" — one row per block per day
//
// Tick integrity (07 §18): a tick made AFTER its block's window is a
// recall, not a tap — recall renders ~ in every window forever (law 11),
// so the honest thing is to mark it at the source, not to let it pass
// for a tap. Skips are decisions; they carry no method and render
// covered-but-not-done in muted — information, never failure.
//
// Reads are local-first like the task pages: the server's day copy at
// once, the pending outbox records overlaid (a just-made tick shows
// before the drain), then a refresh when the server answers.
import { appOutbox } from "./appOutbox";
import { apiUrl } from "./api";

export type TickMethod = "tap" | "recall";
export type TickState = "done" | "recall" | "skip";

export interface DayTick {
  routine_key: string;
  state: TickState;
  /** Which day the tick claims — always the query's date. */
  date: string;
}

export interface RoutineDay {
  date: string;
  /** key → state; absent = unticked (which renders unticked, no hue). */
  ticks: Map<string, TickState>;
  /** True while the server copy predates a pending write for this day. */
  pending: number;
}

export const ROUTINE_DAY_ENDPOINT = "/api/routine/day";

/** The plan day of a wall-clock moment. Before 4am still counts as the
    previous plan day (the same rollover rule the plan strip renders by). */
export function planDate(now: Date): string {
  const day = new Date(now.getTime());
  if (now.getHours() < 4) day.setDate(day.getDate() - 1);
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, "0");
  const d = String(day.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** tap while the block is current or upcoming, recall once its window has
    passed — the estimates law marked at the source (07 §18). */
export function tickMethod(blockEndMinutes: number, now: Date): TickMethod {
  const t = now.getHours() * 60 + now.getMinutes();
  return t < blockEndMinutes ? "tap" : "recall";
}

function kvKey(date: string): string {
  return `eudaimonia:routine-day:${date}`;
}

interface ServerTick {
  routine_key?: unknown;
  kind?: unknown;
  method?: unknown;
}

/** The server's day view, verbatim into a map (null = unreachable). */
export async function fetchRoutineDay(
  date: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<Map<string, TickState> | null> {
  try {
    const response = await fetchFn(apiUrl(`${ROUTINE_DAY_ENDPOINT}?date=${date}`));
    if (!(response.status >= 200 && response.status < 300)) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const ticks = (body as { ticks?: unknown }).ticks;
    if (!Array.isArray(ticks)) return null;
    const map = new Map<string, TickState>();
    for (const tick of ticks as ServerTick[]) {
      if (typeof tick.routine_key !== "string" || tick.routine_key === "") continue;
      if (tick.kind === "routine_done") {
        map.set(tick.routine_key, tick.method === "recall" ? "recall" : "done");
      } else if (tick.kind === "routine_skip") {
        map.set(tick.routine_key, "skip");
      }
    }
    return map;
  } catch {
    return null;
  }
}

/** Local-first day view: cached copy now, pending outbox records on top.
    A pending record outranks the server copy — it is newer by
    construction (the drain will confirm it) and the queue's skip-guard
    means it cannot be a duplicate. */
export async function readLocalDay(date: string): Promise<RoutineDay> {
  const box = appOutbox();
  const ticks = new Map<string, TickState>();
  const cached = box.kv.getItem(kvKey(date));
  if (cached !== null) {
    try {
      for (const [k, v] of JSON.parse(cached) as [string, TickState][]) ticks.set(k, v);
    } catch {
      // a corrupt cache is an empty day, never a crash
    }
  }
  let pending = 0;
  const records = await box.pending();
  for (const record of records) {
    if (record.kind !== "routine_done" && record.kind !== "routine_skip") continue;
    if (record.payload.date !== date) continue;
    const key = record.payload.routine_key;
    if (typeof key !== "string" || key === "") continue;
    pending += 1;
    ticks.set(key, record.kind === "routine_skip" ? "skip" : record.payload.method === "recall" ? "recall" : "done");
  }
  return { date, ticks, pending };
}

/** Cache a server copy under its day (the drain confirmed these rows). */
export function cacheDay(date: string, ticks: Map<string, TickState>): void {
  appOutbox().kv.setItem(kvKey(date), JSON.stringify([...ticks]));
}

/** Enqueue a tick — the ONLY write path, through T2.1's queue. ts is the
    tap time (the queue captures it); idempotency is the device UUID plus
    the server's key:date ref. Returns after the immediate drain attempt;
    offline it stays queued and the triggers drain it (law 9 armor). */
export async function writeTick(
  kind: "routine_done" | "routine_skip",
  payload: { routine_key: string; date: string; method?: TickMethod },
): Promise<void> {
  const box = appOutbox();
  await box.outbox.enqueue(kind, payload as Record<string, unknown>);
  await box.sync().catch(() => undefined);
}

/** The day's count line: "2 of 4", "~2 of 4" when any tick is a recall
    (07 §18 — recall renders ~ in EVERY window), skips noted separately
    as covered-not-done. Never "0 of n": a day with no ticks renders its
    coverage line instead (law 7), and a skip-only day reports the skips
    alone — "0 of 4 · 1 skip" would be a zero row wearing honest clothes. */
export function dayCountLine(
  ticked: Map<string, TickState>,
  planned: number,
): string | null {
  let done = 0;
  let recall = 0;
  let skipped = 0;
  for (const state of ticked.values()) {
    if (state === "done") done += 1;
    else if (state === "recall") recall += 1;
    else if (state === "skip") skipped += 1;
  }
  if (done + recall + skipped === 0) return null;
  const n = done + recall;
  if (n === 0) return `${skipped} skip${skipped === 1 ? "" : "s"}`;
  const line = `${recall > 0 ? "~" : ""}${n} of ${planned}`;
  return skipped > 0 ? `${line} · ${skipped} skip${skipped === 1 ? "" : "s"}` : line;
}
