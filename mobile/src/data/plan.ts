// The plan strip's read model (T1.3/T1.6): the latest week-plan
// revision's extracted lines + its coverage. plan:missing is ASSERTED —
// the rolling file keeps no history, and nothing is ever synthesized
// (dry-run finding 3). Unreachable resolves null; the strip keeps its
// honest static line.
import { apiUrl } from "./api";
import { appOutbox } from "./appOutbox";

export interface PlanToday {
  plan: "ok" | "missing";
  week_start?: string;
  plan_lines: string[];
  /** Same index as plan_lines: the line's stable routine_key (T1.3's
      extractor slug, 07 §19) or "" when the row has no stable name.
      Revisions that predate T2.7 send none. */
  plan_keys: string[];
  days_fresh_7: number;
  artifact_count: number;
  status: string;
  /** True when this object was rebuilt from the on-device cache because
      the server was unreachable — the coverage numbers are NOT fresh
      (they are the cache-time values, or unset) and planFreshness must
      say so instead of reading days_fresh_7 as a zero (law 7). */
  stale?: boolean;
}

export const PLAN_TODAY_ENDPOINT = "/api/plan/today";

const PLAN_CACHE_KEY = "eudaimonia:plan-revision";

/** Keep the last good revision on the phone. The tick surface must not
    die with the network: an offline tick (the exit test) needs the day's
    blocks to render, and the rolling file's latest revision is the thing
    to render. Cache is written only for plan:ok — a missing plan caches
    nothing and nothing is synthesized (T1.3's law). */
export function cachePlanToday(plan: PlanToday): void {
  if (plan.plan !== "ok") return;
  try {
    appOutbox().kv.setItem(
      PLAN_CACHE_KEY,
      JSON.stringify({
        week_start: plan.week_start,
        plan_lines: plan.plan_lines,
        plan_keys: plan.plan_keys,
      }),
    );
  } catch {
    // the cache is armor, not the product: a store that cannot open
    // degrades to online-only ticking, never takes a screen down
  }
}

/** The cached revision, if any. The caller marks the result stale — the
    cache carries no coverage numbers, and inventing zeros would break
    law 7. */
export function cachedPlanToday(): Pick<
  PlanToday,
  "week_start" | "plan_lines" | "plan_keys"
> | null {
  try {
    const raw = appOutbox().kv.getItem(PLAN_CACHE_KEY);
    if (raw === null) return null;
    const b = JSON.parse(raw) as Record<string, unknown>;
    if (!Array.isArray(b.plan_lines) || !Array.isArray(b.plan_keys)) return null;
    return {
      week_start: typeof b.week_start === "string" ? b.week_start : undefined,
      plan_lines: b.plan_lines.filter((l): l is string => typeof l === "string"),
      plan_keys: b.plan_keys.filter((k): k is string => typeof k === "string"),
    };
  } catch {
    return null;
  }
}

export async function fetchPlanToday(
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<PlanToday | null> {
  try {
    const response = await fetchFn(apiUrl(PLAN_TODAY_ENDPOINT));
    if (!(response.status >= 200 && response.status < 300)) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const b = body as Record<string, unknown>;
    if (
      b.plan !== "ok" && b.plan !== "missing"
    ) {
      return null;
    }
    if (!Array.isArray(b.plan_lines)) return null;
    return {
      plan: b.plan,
      week_start: typeof b.week_start === "string" ? b.week_start : undefined,
      plan_lines: b.plan_lines.filter((l): l is string => typeof l === "string"),
      plan_keys: Array.isArray(b.plan_keys)
        ? b.plan_keys.filter((k): k is string => typeof k === "string")
        : [],
      days_fresh_7: typeof b.days_fresh_7 === "number" ? b.days_fresh_7 : 0,
      artifact_count: typeof b.artifact_count === "number" ? b.artifact_count : 0,
      status: typeof b.status === "string" ? b.status : "alive",
    };
  } catch {
    return null;
  }
}
