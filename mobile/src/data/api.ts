// The API client — M3 port of the web client's one network surface
// (client/src/sw/queue.ts fetchTransport + HABIT_TAP_ENDPOINT).
//
// The web app got same-origin /api for free (vite proxy in dev, FastAPI
// static hosting in prod). A native client has no origin, so the base URL
// is explicit: EXPO_PUBLIC_API_BASE, defaulting to the server's tailnet
// address (02 §1 topology). The data plane is tailnet-only BY DESIGN —
// unreachable is a normal state, not an error state: the transport
// resolves false and the queue keeps the event.

import type { ReplayBody, Transport } from "./queue";

/** Server tailnet address (02 §1); override with EXPO_PUBLIC_API_BASE. */
export const API_BASE: string =
  process.env.EXPO_PUBLIC_API_BASE ?? "http://100.99.246.26:8000";

/** Stub-level endpoint; 404s until P2 wires the ingest route. */
export const HABIT_TAP_ENDPOINT = "/api/events/habit_tap";

/** Join the explicit base with a /api path (both sides may carry slashes). */
export function apiUrl(path: string): string {
  return `${API_BASE.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

/** POSTs the law-9 body shape; network failures resolve false, never throw. */
export function fetchTransport(
  url: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Transport {
  return {
    async post(body: ReplayBody) {
      try {
        const response = await fetchFn(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        return response.status >= 200 && response.status < 300;
      } catch {
        return false; // offline — the queue exists exactly for this
      }
    },
  };
}
