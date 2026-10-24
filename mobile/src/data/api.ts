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

/** The phone-reachable data plane (02 §1): uvicorn binds 127.0.0.1 on
 * olympus, so the tailnet IP:8000 is connection-refused for any device
 * (measured 2026-10-14, curl exit 7) — tailscale serve fronts it on the
 * ts.net origin, measured 200 on /api/health the same day. Override with
 * EXPO_PUBLIC_API_BASE (baked at build time by metro).
 *
 * `||`, not `??`: a SET-BUT-EMPTY base must fall back too. `EXPO_PUBLIC_API_BASE=
 * sh scripts/build-apk.sh preview` baked "" into the 2026-10-24 16:49 build
 * (measured: zero `olympus` strings in classes.dex) — every POST then aimed
 * at a relative URL and failed like any network error, with the outbox
 * correctly keeping the event. A missing default is a broken build that
 * still looks installed. */
export const API_BASE: string =
  process.env.EXPO_PUBLIC_API_BASE || "https://olympus.tail7270c7.ts.net";

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
