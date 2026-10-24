// The wake read model's client half (P1-flavored read over the spine):
// GET /api/habits/wake/stats — the server's ONE definition of the WAKE
// row's numbers (app/app/wake.py). Unreachable is a normal state (02 §1:
// the data plane is tailnet-only BY DESIGN), so the fetch resolves null
// on any failure and the row renders that honestly — never a fabricated
// count, never last-known-good stale data.
//
// The line formatter is a PURE function so the honesty rules are
// assertable without a network:
//   - no events yet  -> "wake · not yet instrumented (P2)"  (zero taps is
//     data: the habit exists, the measure has not started)
//   - fetch failed   -> "wake · server unreachable"          (never zero!)
//   - taps           -> "wake · N of 7 · last 42m ago" and the estimate
//                       law's `~` when the latest tap was a recall (law 11:
//                       estimated never renders as measured)
import { apiUrl } from "./api";

export interface WakeLastTap {
  ts: string;
  method: "tap" | "recall";
  age_minutes: number;
}

export interface WakeStats {
  days_of_7: number;
  total_taps: number;
  last_tap: WakeLastTap | null;
}

export const WAKE_STATS_ENDPOINT = "/api/habits/wake/stats";

/** GETs the wake stats; resolves null on ANY failure (offline, 5xx, shape).
 * The row keeps its previous honest line — failure must not read as data. */
export async function fetchWakeStats(
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<WakeStats | null> {
  try {
    const response = await fetchFn(apiUrl(WAKE_STATS_ENDPOINT));
    if (!(response.status >= 200 && response.status < 300)) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const b = body as Record<string, unknown>;
    if (typeof b.days_of_7 !== "number" || typeof b.total_taps !== "number") {
      return null;
    }
    let last_tap: WakeLastTap | null = null;
    if (
      typeof b.last_tap === "object" &&
      b.last_tap !== null &&
      typeof (b.last_tap as Record<string, unknown>).ts === "string" &&
      typeof (b.last_tap as Record<string, unknown>).age_minutes === "number" &&
      ((b.last_tap as Record<string, unknown>).method === "tap" ||
        (b.last_tap as Record<string, unknown>).method === "recall")
    ) {
      const lt = b.last_tap as Record<string, unknown>;
      last_tap = {
        ts: lt.ts as string,
        method: lt.method as "tap" | "recall",
        age_minutes: lt.age_minutes as number,
      };
    }
    return { days_of_7: b.days_of_7, total_taps: b.total_taps, last_tap };
  } catch {
    return null; // unreachable — a normal state, not an error state
  }
}

function ageLabel(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** The WAKE row's coverage line — pure, so the honesty rules are testable. */
export function wakeCoverageLine(stats: WakeStats | null): string {
  if (stats === null) return "wake · server unreachable";
  if (stats.total_taps === 0) return "wake · not yet instrumented (P2)";
  const days = `wake · ${stats.days_of_7} of 7`;
  if (stats.last_tap === null) return days;
  const est = stats.last_tap.method === "recall" ? " (~recall)" : "";
  return `${days} · last ${ageLabel(stats.last_tap.age_minutes)}${est}`;
}
