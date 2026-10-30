import { describe, expect, it } from "@jest/globals";

// The waiting-on read model's client honesty: unreachable is null (the UI
// keeps its unreachable/uninstrumented line — an unreachable server must
// never read as an empty inbox, law 7's cousin), and the shape contract is
// enforced before render. The partition/count rules live server-side and
// are measured in app/tests/integration/test_loops.py.

import { fetchOpenLoops, resolutionPayload } from "./loops";

describe("fetchOpenLoops", () => {
  it("resolves the parsed shape on 2xx", async () => {
    const ok = (async () =>
      new Response(
        JSON.stringify({
          loops: [
            {
              id: 1,
              text: "reply to APS India",
              direction: "owed-by-me",
              ts: "2026-10-24T12:15:19.933000+00:00",
              age_days: 0,
            },
          ],
          count: 1,
          owed_by_me: 1,
          owed_to_me: 0,
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    const result = await fetchOpenLoops(ok);
    expect(result).not.toBeNull();
    expect(result?.count).toBe(1);
    expect(result?.loops[0].direction).toBe("owed-by-me");
  });

  it("resolves null on non-2xx, junk shape, and network failure", async () => {
    const nope = (async () => new Response(null, { status: 500 })) as unknown as typeof fetch;
    expect(await fetchOpenLoops(nope)).toBeNull();

    const junk = (async () =>
      new Response(JSON.stringify({ hello: 1 }), { status: 200 })) as unknown as typeof fetch;
    expect(await fetchOpenLoops(junk)).toBeNull();

    const dead = (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    expect(await fetchOpenLoops(dead)).toBeNull();
  });
});

describe("resolutionPayload", () => {
  it("carries the drop reason when given", () => {
    expect(resolutionPayload("loop_dropped", 7, "the booking happened without me")).toEqual({
      kind: "loop_dropped",
      loop_id: 7,
      reason: "the booking happened without me",
    });
  });

  it("omits the reason when absent or empty — an empty reason must not ride the event", () => {
    expect(resolutionPayload("loop_done", 7).reason).toBeUndefined();
    expect(resolutionPayload("loop_dropped", 7, "   ").reason).toBeUndefined();
  });
});
