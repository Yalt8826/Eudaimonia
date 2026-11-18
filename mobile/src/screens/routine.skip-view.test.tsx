// T2.7 — the /routine day screen, part 5: the skipped row as rendered.
// A skip renders covered-but-not-done in the muted tier — information,
// never failure; no state hue, no red, no amber (02 §6 muted-never-red).
//
// ONE TREE PER FILE — see wake.test.tsx for the renderRouter quirk.
import { afterEach, expect, it, jest } from "@jest/globals";
import { cleanup, renderRouter, screen } from "expo-router/testing-library";
import type { Outbox } from "../data/queue";

jest.mock("../data/appOutbox", () => {
  const records: Record<string, unknown>[] = [
    {
      queueKey: "device:routine_skip:0",
      idempotency_key: "device",
      kind: "routine_skip",
      ts: 1000,
      payload: { routine_key: "dmat", date: "2026-11-13" },
    },
  ];
  const enqueue = jest.fn();
  const sync = jest.fn();
  const kvStore = new Map<string, string>();
  const pending = jest.fn(() => Promise.resolve([...records]));
  const box = {
    outbox: { enqueue } as unknown as Outbox,
    sync,
    kv: {
      getItem: (k: string) => (kvStore.has(k) ? kvStore.get(k) : null),
      setItem: (k: string, v: string) => void kvStore.set(k, v),
    },
    pending,
  };
  return { appOutbox: (): typeof box => box, __routineMocks: { sync } };
});

const { __routineMocks } = jest.requireMock("../data/appOutbox") as {
  __routineMocks: { sync: { mockReset(): void } };
};
const { sync } = __routineMocks;

const PLAN = {
  plan: "ok",
  week_start: "2026-11-09",
  plan_lines: [
    "3:00–3:45pm | **dMAT** (45m) | warm-up",
    "3:45–6:45pm | **GRE deep work** (~3h) | quant + verbal",
  ],
  plan_keys: ["dmat", "gre-deep-work"],
  days_fresh_7: 4,
  artifact_count: 9,
  status: "alive",
};

function pinClock(hour: number): void {
  jest.spyOn(Date.prototype, "getHours").mockReturnValue(hour);
  jest.spyOn(Date.prototype, "getMinutes").mockReturnValue(0);
  jest.spyOn(Date.prototype, "getFullYear").mockReturnValue(2026);
  jest.spyOn(Date.prototype, "getMonth").mockReturnValue(10);
  jest.spyOn(Date.prototype, "getDate").mockReturnValue(13);
}

function mockFetch(ticks: unknown, status = 200): void {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/plan/today")) {
      return { status, json: async () => PLAN };
    }
    return { status, json: async () => ticks };
  }) as unknown as typeof globalThis.fetch;
}

afterEach(() => {
  cleanup();
  sync.mockReset();
  jest.restoreAllMocks();
});

it("a skipped row renders muted — covered-but-not-done, never a failure hue", async () => {
  pinClock(14);
  mockFetch({ date: "2026-11-13", ticks: [] });
  const router = renderRouter("./src/app", { initialUrl: "/routine" });
  await router;

  expect(await screen.findByText(/skipped — covered, not done/)).toBeOnTheScreen();
  const skipGlyph = screen.getByLabelText("skipped");
  // the style is an array (base + conditional); the skip glyph must ride
  // the muted token — information tier, never red or amber (02 §6)
  const styles = Array.isArray(skipGlyph.props.style)
    ? skipGlyph.props.style
    : [skipGlyph.props.style];
  const colorsUsed = styles
    .flatMap((s: Record<string, unknown> | undefined) => (s ? Object.values(s) : []))
    .map(String);
  expect(colorsUsed).toContain("#9A9A94");
  // the skip is its own word in the count line, never counted as done
  // skip-only day: the line names the skip, never "0 of 2"
  expect(screen.getByText(/· 1 skip ·/)).toBeOnTheScreen();
}, 15000);
