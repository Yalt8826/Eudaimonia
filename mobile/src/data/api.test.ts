import { describe, expect, it, jest } from "@jest/globals";

import { API_BASE, HABIT_TAP_ENDPOINT, apiUrl, fetchTransport } from "./api";
import type { ReplayBody } from "./queue";

// The API client contract: the endpoint path is the web client's verbatim,
// the transport resolves true only on 2xx, network failures resolve false
// (never throw — unreachable is a normal state, not an error state), and
// the POST body is the law-9 ReplayBody JSON.

const BODY: ReplayBody = {
  idempotency_key: "device-uuid",
  kind: "habit_tap",
  ts: 1_726_000_000_000,
  ingested_at: 1_726_000_030_000,
  payload: { method: "tap" },
};

describe("apiUrl", () => {
  it("joins the explicit base with /api paths — native has no same-origin", () => {
    expect(apiUrl("/api/events/habit_tap")).toBe(`${API_BASE}/api/events/habit_tap`);
    // 02 §1 tailnet data plane: the ts.net serve origin (uvicorn on olympus
    // is 127.0.0.1-bound — the tailnet IP:8000 default was connection-refused
    // for devices, measured 2026-10-14).
    expect(API_BASE).toMatch(/^https:\/\/[a-z0-9.]+\.ts\.net$/);
    expect(API_BASE.endsWith("/")).toBe(false);
    expect(HABIT_TAP_ENDPOINT).toBe("/api/events/habit_tap"); // web queue.ts:177, verbatim
  });

  it("falls back to the tailnet origin when the baked base is EMPTY", () => {
    // The 2026-10-24 broken-build regression: `EXPO_PUBLIC_API_BASE=` (set
    // but empty) baked "" — metro inlines the empty string, `??` treats it
    // as a real value, and every POST then aimed at a relative URL with no
    // origin, failing like any network error while the outbox correctly
    // kept the event. A build that looks installed but cannot reach the
    // server is worse than one that says so: the fallback must catch "".
    const prev = process.env.EXPO_PUBLIC_API_BASE;
    process.env.EXPO_PUBLIC_API_BASE = "";
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fresh = require("./api") as typeof import("./api");
    expect(fresh.API_BASE).toBe("https://olympus.tail7270c7.ts.net");
    expect(fresh.apiUrl("/api/events/habit_tap")).toBe(
      "https://olympus.tail7270c7.ts.net/api/events/habit_tap",
    );
    if (prev === undefined) delete process.env.EXPO_PUBLIC_API_BASE;
    else process.env.EXPO_PUBLIC_API_BASE = prev;
    jest.resetModules();
  });
});

describe("fetchTransport", () => {
  it("resolves true on 2xx and false on any non-2xx", async () => {
    const ok = fetchTransport("http://x", (async () => new Response(null, { status: 200 })) as typeof fetch);
    const created = fetchTransport("http://x", (async () => new Response(null, { status: 201 })) as typeof fetch);
    const notFound = fetchTransport("http://x", (async () => new Response(null, { status: 404 })) as typeof fetch);
    const serverError = fetchTransport("http://x", (async () => new Response(null, { status: 500 })) as typeof fetch);

    expect(await ok.post(BODY)).toBe(true);
    expect(await created.post(BODY)).toBe(true);
    expect(await notFound.post(BODY)).toBe(false); // e.g. the P2 route not wired yet
    expect(await serverError.post(BODY)).toBe(false);
  });

  it("resolves false on a network failure — the queue exists exactly for this", async () => {
    const offline = fetchTransport("http://x", (async () => {
      throw new TypeError("Network request failed");
    }) as typeof fetch);
    expect(await offline.post(BODY)).toBe(false);
  });

  it("POSTs the law-9 body as JSON with the JSON content type", async () => {
    let seenInput: RequestInfo | URL | undefined;
    let seenInit: RequestInit | undefined;
    const transport = fetchTransport("http://x/api/events/habit_tap", (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      seenInput = input;
      seenInit = init;
      return new Response(null, { status: 200 });
    }) as typeof fetch);

    await transport.post(BODY);
    expect(seenInput).toBe("http://x/api/events/habit_tap");
    expect(seenInit?.method).toBe("POST");
    expect(seenInit?.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(seenInit?.body as string)).toEqual(BODY);
  });
});
