import { describe, expect, it } from "@jest/globals";

// The WAKE row's honesty rules (law 7 + law 11 + 02 §1), asserted on the
// pure line builder and the fetch boundary — no network, no Skia:
//
//   zero taps ever        -> "not yet instrumented"  (zero is DATA: the
//                            habit exists, the measure has not started)
//   fetch failed          -> "server unreachable"    (NEVER a zero — an
//                            unreachable server must not read as a dry
//                            spell; failure must not read as success)
//   taps                  -> "N of 7 · last <age>"   (days, not taps)
//   latest was a recall   -> the estimate law's `~`  (law 11)

import { fetchWakeStats, wakeCoverageLine, type WakeStats } from "./wakeStats";

const stats: WakeStats = {
  days_of_7: 4,
  total_taps: 11,
  last_tap: { ts: "2026-10-24T02:04:28+00:00", method: "tap", age_minutes: 42 },
};

describe("wakeCoverageLine", () => {
  it("says unreachable when the fetch failed — never a fabricated zero", () => {
    expect(wakeCoverageLine(null)).toBe("wake · server unreachable");
  });

  it("says not-instrumented when the spine has no taps at all", () => {
    expect(
      wakeCoverageLine({ days_of_7: 0, total_taps: 0, last_tap: null }),
    ).toBe("wake · not yet instrumented (P2)");
  });

  it("renders days and the last-tap age", () => {
    expect(wakeCoverageLine(stats)).toBe("wake · 4 of 7 · last 42m ago");
  });

  it("marks a recall estimate with the estimate law's ~", () => {
    expect(
      wakeCoverageLine({
        ...stats,
        last_tap: { ...stats.last_tap!, method: "recall" },
      }),
    ).toBe("wake · 4 of 7 · last 42m ago (~recall)");
  });

  it("speaks days for the older cases: hours, then days", () => {
    expect(
      wakeCoverageLine({
        ...stats,
        last_tap: { ...stats.last_tap!, age_minutes: 90 },
      }),
    ).toBe("wake · 4 of 7 · last 1h ago");
    expect(
      wakeCoverageLine({
        ...stats,
        last_tap: { ...stats.last_tap!, age_minutes: 60 * 50 },
      }),
    ).toBe("wake · 4 of 7 · last 2d ago");
  });

  it("says just now under a minute — and 0 of 7 with taps is a DRY SPELL, rendered plainly", () => {
    expect(
      wakeCoverageLine({
        days_of_7: 0,
        total_taps: 9,
        last_tap: { ts: "x", method: "tap", age_minutes: 0 },
      }),
    ).toBe("wake · 0 of 7 · last just now");
  });
});

describe("fetchWakeStats", () => {
  it("resolves the parsed shape on 2xx", async () => {
    const ok = (async () =>
      new Response(
        JSON.stringify({
          days_of_7: 3,
          total_taps: 9,
          last_tap: {
            ts: "2026-10-24T02:04:28.850000+00:00",
            method: "tap",
            age_minutes: 42,
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;
    expect(await fetchWakeStats(ok)).toEqual({
      days_of_7: 3,
      total_taps: 9,
      last_tap: {
        ts: "2026-10-24T02:04:28.850000+00:00",
        method: "tap",
        age_minutes: 42,
      },
    });
  });

  it("resolves null on a non-2xx — and on a shape that is not the contract", async () => {
    const nope = (async () => new Response(null, { status: 404 })) as unknown as typeof fetch;
    expect(await fetchWakeStats(nope)).toBeNull();
    const junk = (async () =>
      new Response(JSON.stringify({ hello: "world" }), { status: 200 })) as unknown as typeof fetch;
    expect(await fetchWakeStats(junk)).toBeNull();
  });

  it("resolves null on a network failure — the queue's twin rule", async () => {
    const dead = (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    expect(await fetchWakeStats(dead)).toBeNull();
  });

  it("hits the tailnet data plane's wake stats path", async () => {
    expect.assertions(1);
    let seen = "";
    const spy = (async (input: RequestInfo | URL) => {
      seen = String(input);
      return new Response(JSON.stringify({ days_of_7: 0, total_taps: 0, last_tap: null }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    await fetchWakeStats(spy);
    expect(seen).toBe("https://olympus.tail7270c7.ts.net/api/habits/wake/stats");
  });
});
