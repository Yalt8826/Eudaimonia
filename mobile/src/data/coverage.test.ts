import { describe, expect, it } from "@jest/globals";

// The coverage read model's client contract: the shared view (law 7) is
// the only freshness source; the line builder renders what it says —
// never synthesized, never zero-as-instrumented (0 fresh days WITH
// artifacts is a dry spell, rendered plainly; zero artifacts is
// uninstrumented).

import { coverageLine, fetchCoverage, type CoverageRow } from "./coverage";

const row: CoverageRow = {
  source: "day-report",
  class: "pipeline",
  status: "alive",
  last_ok_read_ts: "2026-10-29T16:58:36+00:00",
  days_fresh_7: 1,
  artifact_count: 64,
  paused_evidence: false,
};

describe("coverageLine", () => {
  it("renders N of 7 with the status", () => {
    expect(coverageLine(row)).toBe("day report · 1 of 7 · alive");
  });

  it("renders uninstrumented when nothing was ever read", () => {
    expect(
      coverageLine({ ...row, artifact_count: 0, days_fresh_7: 0 }),
    ).toBe("day report · not yet instrumented");
  });

  it("renders a dry spell plainly — zero is data, not an error", () => {
    expect(
      coverageLine({ ...row, days_fresh_7: 0 }),
    ).toBe("day report · 0 of 7 · alive");
  });

  it("keeps the source's hyphen in the label", () => {
    expect(coverageLine({ ...row, source: "week-plan" })).toBe(
      "week plan · 1 of 7 · alive",
    );
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
