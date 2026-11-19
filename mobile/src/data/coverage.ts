// The coverage read model's client half (P1/T1.6, tenancy-aware since
// T3.4): GET /api/coverage — the ONE liveness definition anywhere. Each
// row is the tenancy engine's evaluation (state + muted/amber tier +
// remediation hint) beside the raw view facts. The Plaza's strips render
// what it says and add nothing — never synthesized (law 7).
import { apiUrl } from "./api";

export interface CoverageRow {
  source: string;
  class: "behavioral" | "pipeline";
  state: "alive" | "dead" | "paused" | "behavioral-dormant" | "uninstrumented" | "demoted";
  tier: "normal" | "muted" | "amber" | "red";
  hint: string | null;
  status: "alive" | "dead" | "paused";
  days_fresh_7: number;
  artifact_count: number;
  last_content_date?: string | null;
  days_silent?: number | null;
}

export const COVERAGE_ENDPOINT = "/api/coverage";

export async function fetchCoverage(
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<CoverageRow[] | null> {
  try {
    const response = await fetchFn(apiUrl(COVERAGE_ENDPOINT));
    if (!(response.status >= 200 && response.status < 300)) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const coverage = (body as Record<string, unknown>).coverage;
    if (!Array.isArray(coverage)) return null;
    return coverage.filter(
      (c): c is CoverageRow =>
        typeof c === "object" &&
        c !== null &&
        typeof (c as CoverageRow).source === "string" &&
        typeof (c as CoverageRow).days_fresh_7 === "number" &&
        typeof (c as CoverageRow).state === "string",
    );
  } catch {
    return null;
  }
}

/** The strip's honest coverage line (law 7): 0 fresh days with artifacts
 * renders as 0 of 7, plainly; demoted/uninstrumented/dormant render the
 * engine's remediation hint — muted tier, never a failure hue (the
 * engine already decided; this line adds no color of its own). */
export function coverageLine(row: CoverageRow): string {
  const noun = row.source.replace("-", " ");
  if (row.artifact_count === 0) return `${noun} · not yet instrumented`;
  const base = `${noun} · ${row.days_fresh_7} of 7`;
  if (row.hint) return `${base} · ${row.hint}`;
  return base;
}
