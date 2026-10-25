// The capture list's client half (T2.3): GET /api/capture/recent — each
// capture with its honest triage state — and the MANUAL retry POST. The
// retry is a human decision (never auto-retry), so it exists only behind
// a button. Unreachable resolves null; the list keeps its previous state
// and says nothing false.
import { apiUrl } from "./api";

export interface RecentCapture {
  capture_id: number;
  external_ref: string;
  ts: string;
  text: string | null;
  photo_ref: string | null;
  state: "triaged" | "failed" | "untriaged";
  target?: string;
  reason?: string;
}

export const CAPTURE_RECENT_ENDPOINT = "/api/capture/recent";
export const CAPTURE_RETRIAGE_ENDPOINT = "/api/capture/retriage";

export async function fetchRecentCaptures(
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<RecentCapture[] | null> {
  try {
    const response = await fetchFn(apiUrl(CAPTURE_RECENT_ENDPOINT));
    if (!(response.status >= 200 && response.status < 300)) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const captures = (body as Record<string, unknown>).captures;
    if (!Array.isArray(captures)) return null;
    return captures.filter(
      (c): c is RecentCapture =>
        typeof c === "object" &&
        c !== null &&
        typeof (c as RecentCapture).capture_id === "number" &&
        typeof (c as RecentCapture).external_ref === "string" &&
        typeof (c as RecentCapture).state === "string",
    );
  } catch {
    return null;
  }
}

/** The manual re-triage: resolves the new state on success, null on
 * failure (the list then still shows the failed state — which is true). */
export async function requestRetriage(
  captureRef: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<"triaged" | "untriaged" | null> {
  try {
    const response = await fetchFn(apiUrl(CAPTURE_RETRIAGE_ENDPOINT), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capture_ref: captureRef }),
    });
    if (!(response.status >= 200 && response.status < 300)) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const state = (body as Record<string, unknown>).state;
    return state === "triaged" || state === "untriaged" ? state : null;
  } catch {
    return null;
  }
}
