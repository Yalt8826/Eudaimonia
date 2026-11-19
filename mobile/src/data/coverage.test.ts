import { describe, expect, it } from "@jest/globals";

// The coverage read model's client contract: the tenancy engine (T3.4)
// is the only liveness source; the line builder renders what it says —
// never synthesized, never zero-as-instrumented (0 fresh days WITH
// artifacts is a dry spell, rendered plainly; zero artifacts is
// uninstrumented). A demoted/dormant row renders the engine's
// remediation hint — muted, never a failure hue (02 §6).

import { coverageLine, fetchCoverage, type CoverageRow } from "./coverage";

const row: CoverageRow = {
  source: "day-report",
  class: "pipeline",
  state: "alive",
  tier: "normal",
  hint: null,
  status: "alive",
  days_fresh_7: 1,
  artifact_count: 64,
};

describe("coverageLine", () => {
  it("renders N of 7 when alive", () => {
    expect(coverageLine(row)).toBe("day report · 1 of 7");
  });

  it("renders uninstrumented when nothing was ever read", () => {
    expect(
      coverageLine({ ...row, artifact_count: 0, days_fresh_7: 0, state: "uninstrumented" }),
    ).toBe("day report · not yet instrumented");
  });

  it("renders a dry spell plainly — zero is data, not an error", () => {
    expect(coverageLine({ ...row, days_fresh_7: 0 })).toBe("day report · 0 of 7");
  });

  it("renders the engine's remediation hint when demoted or dormant", () => {
    expect(
      coverageLine({ ...row, days_fresh_7: 0, hint: "repair the chain — one pass re-earns" }),
    ).toBe("day report · 0 of 7 · repair the chain — one pass re-earns");
    expect(
      coverageLine({
        ...row,
        class: "behavioral",
        state: "behavioral-dormant",
        hint: "log a day to re-earn",
      }),
    ).toBe("day report · 1 of 7 · log a day to re-earn");
  });

  it("keeps the source's hyphen in the label", () => {
    expect(coverageLine({ ...row, source: "week-plan" })).toBe("week plan · 1 of 7");
  });
});

describe("fetchCoverage", () => {
  it("resolves the parsed rows on 2xx", async () => {
    const ok = (async () =>
      new Response(JSON.stringify({ coverage: [row] }), { status: 200 })) as unknown as typeof fetch;
    const result = await fetchCoverage(ok);
    expect(result).toEqual([row]);
  });

  it("resolves null on non-2xx, junk, and network failure", async () => {
    const nope = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch;
    expect(await fetchCoverage(nope)).toBeNull();
    const junk = (async () =>
      new Response(JSON.stringify({ coverage: 7 }), { status: 200 })) as unknown as typeof fetch;
    expect(await fetchCoverage(junk)).toBeNull();
    const dead = (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    expect(await fetchCoverage(dead)).toBeNull();
  });
});
