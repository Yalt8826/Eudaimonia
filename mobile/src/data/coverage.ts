// The coverage read model's client half (P1/T1.6): GET /api/coverage —
// the shared view (law 7: the ONE definition of strip freshness anywhere).
// The Plaza's strips consume it and render what it says: days_fresh_7 for
// the "N of last 7" lines, artifact_count for attempted reads, and
// stale/alive exactly as the view reports — never synthesized.
import { apiUrl } from "./api";

export interface CoverageRow {
  source: string;
  class: "behavioral" | "pipeline";
  status: "alive" | "dead" | "paused";
  last_ok_read_ts: string | null;
  days_fresh_7: number;
  artifact_count: number;
  paused_evidence: boolean;
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
        typeof (c as CoverageRow).days_fresh_7 === "number",
    );
  } catch {
    return null;
  }
}

/** The strip's honest coverage line for a source (law 7: missing days are
 * data — 0 fresh days with artifacts renders as 0 of 7, plainly). */
export function coverageLine(row: CoverageRow): string {
  const noun = row.source.replace("-", " ");
  if (row.artifact_count === 0) return `${noun} · not yet instrumented`;
  return `${noun} · ${row.days_fresh_7} of 7 · ${row.status}`;
}
