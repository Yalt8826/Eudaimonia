import { describe, expect, it } from "@jest/globals";

// The capture list's client contract: the shape is validated before render
// (a junk or failed response resolves null — the list keeps its previous
// state and says nothing false), and the manual retry resolves the NEW
// state or null (the human's retry is never auto-retried by the client
// papering over a failure).

import { fetchRecentCaptures, requestRetriage } from "./captureList";

const LIST_BODY = {
  captures: [
    {
      capture_id: 9,
      external_ref: "fuzzel:2026-10-24T14:10:43+00:00",
      ts: "2026-10-24T14:10:43+00:00",
      text: "deploy smoke test",
      photo_ref: null,
      state: "triaged",
      target: "task",
    },
    {
      capture_id: 10,
      external_ref: "mobile:2026-10-24T15:14:25+00:00",
      ts: "2026-10-24T15:14:25+00:00",
      text: "Hi",
      photo_ref: null,
      state: "failed",
      reason: "error",
    },
  ],
};

describe("fetchRecentCaptures", () => {
  it("resolves the parsed list on 2xx", async () => {
    const ok = (async () =>
      new Response(JSON.stringify(LIST_BODY), { status: 200 })) as unknown as typeof fetch;
    const result = await fetchRecentCaptures(ok);
    expect(result).not.toBeNull();
    expect(result?.length).toBe(2);
    expect(result?.[1].state).toBe("failed");
  });

  it("resolves null on non-2xx, junk shape, and network failure", async () => {
    const nope = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    expect(await fetchRecentCaptures(nope)).toBeNull();

    const junk = (async () =>
      new Response(JSON.stringify({ captures: "soon" }), { status: 200 })) as unknown as typeof fetch;
    expect(await fetchRecentCaptures(junk)).toBeNull();

    const dead = (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    expect(await fetchRecentCaptures(dead)).toBeNull();
  });
});

describe("requestRetriage", () => {
  it("resolves the new state on 2xx", async () => {
    const ok = (async () =>
      new Response(JSON.stringify({ state: "triaged" }), { status: 200 })) as unknown as typeof fetch;
    expect(await requestRetriage("fuzzel:x", ok)).toBe("triaged");
  });

  it("resolves null on failure — the failed state on screen stays true", async () => {
    const nope = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    expect(await requestRetriage("fuzzel:x", nope)).toBeNull();
  });
});
