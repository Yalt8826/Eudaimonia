// The plan strip's read model (T1.3/T1.6): the latest week-plan
// revision's extracted lines + its coverage. plan:missing is ASSERTED —
// the rolling file keeps no history, and nothing is ever synthesized
// (dry-run finding 3). Unreachable resolves null; the strip keeps its
// honest static line.
import { apiUrl } from "./api";

export interface PlanToday {
  plan: "ok" | "missing";
  week_start?: string;
  plan_lines: string[];
  days_fresh_7: number;
  artifact_count: number;
  status: string;
}

export const PLAN_TODAY_ENDPOINT = "/api/plan/today";

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
      days_fresh_7: typeof b.days_fresh_7 === "number" ? b.days_fresh_7 : 0,
      artifact_count: typeof b.artifact_count === "number" ? b.artifact_count : 0,
      status: typeof b.status === "string" ? b.status : "alive",
    };
  } catch {
    return null;
  }
}
