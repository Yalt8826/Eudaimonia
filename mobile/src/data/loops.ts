// The waiting-on read model's client half (T2.2): GET /api/loops/open —
// the server's ONE definition of the open-loop list and the badge counts
// (app/app/loops.py). Unreachable resolves null and the UI keeps its
// honest "not instrumented / unreachable" line — never zero-as-data
// confusion: zero open loops with a 200 IS zero (law 7, applied).
//
// Resolutions ride the T2.1 armor: the outbox queues loop_done /
// loop_rolled / loop_dropped through the generic door and the server
// applies the cache row on drain. The status claim follows the wake and
// capture rule — the outbox DEPTH is the truth, never optimism.
import { apiUrl } from "./api";

export interface OpenLoop {
  id: number;
  text: string;
  direction: "owed-by-me" | "owed-to-me";
  ts: string;
  age_days: number;
}

export interface OpenLoops {
  loops: OpenLoop[];
  count: number;
  owed_by_me: number;
  owed_to_me: number;
}

export const OPEN_LOOPS_ENDPOINT = "/api/loops/open";

export async function fetchOpenLoops(
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<OpenLoops | null> {
  try {
    const response = await fetchFn(apiUrl(OPEN_LOOPS_ENDPOINT));
    if (!(response.status >= 200 && response.status < 300)) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const b = body as Record<string, unknown>;
    if (
      !Array.isArray(b.loops) ||
      typeof b.count !== "number" ||
      typeof b.owed_by_me !== "number" ||
      typeof b.owed_to_me !== "number"
    ) {
      return null;
    }
    return {
      loops: b.loops as OpenLoop[],
      count: b.count,
      owed_by_me: b.owed_by_me,
      owed_to_me: b.owed_to_me,
    };
  } catch {
    return null;
  }
}

export type ResolutionKind = "loop_done" | "loop_rolled" | "loop_dropped";

/** The three resolutions, their row labels, and the events they mint. */
export const RESOLUTIONS: readonly { kind: ResolutionKind; label: string }[] = [
  { kind: "loop_done", label: "done" },
  { kind: "loop_rolled", label: "roll" },
  { kind: "loop_dropped", label: "drop" },
];


/** The resolution's wire payload (T2.2): the loop id, and the drop reason
 * ONLY when actually given — an empty reason must not ride the event. */
export function resolutionPayload(
  kind: ResolutionKind,
  loopId: number,
  reason?: string,
): { kind: ResolutionKind; loop_id: number; reason?: string } {
  const payload: { kind: ResolutionKind; loop_id: number; reason?: string } = {
    kind,
    loop_id: loopId,
  };
  const trimmed = reason?.trim();
  if (trimmed) payload.reason = trimmed;
  return payload;
}
