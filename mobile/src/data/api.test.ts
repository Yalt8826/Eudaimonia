import { describe, expect, it } from "@jest/globals";

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
    expect(API_BASE).toMatch(/^http:\/\/100\.99\.246\.26:8000$/); // 02 §1 tailnet default
    expect(HABIT_TAP_ENDPOINT).toBe("/api/events/habit_tap"); // web queue.ts:177, verbatim
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
