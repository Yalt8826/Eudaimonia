// T2.7 — the /routine day screen, part 4: the recalled row as rendered.
// A recall is a claim from memory, not a tap at the moment: its row says
// "recalled", its glyph is the ~-marked box, and the count line carries
// the ~ — ~ in EVERY window the tick is counted (law 11).
//
// ONE TREE PER FILE — see wake.test.tsx for the renderRouter quirk.
import { afterEach, expect, it, jest } from "@jest/globals";
import { cleanup, renderRouter, screen } from "expo-router/testing-library";
import type { Outbox } from "../data/queue";

jest.mock("../data/appOutbox", () => {
  const records: Record<string, unknown>[] = [
    {
      queueKey: "device:routine_done:0",
      idempotency_key: "device",
      kind: "routine_done",
      ts: 1000,
      payload: { routine_key: "gre-deep-work", date: "2026-11-13", method: "recall" },
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

it("a recalled tick renders ~ in the row and the count", async () => {
  pinClock(20);
  mockFetch({ date: "2026-11-13", ticks: [] });
  const router = renderRouter("./src/app", { initialUrl: "/routine" });
  await router;

  // the row says recalled, and the count carries the ~ (law 11: ~ in
  // every window, including this one)
  expect(await screen.findByText(/recalled/)).toBeOnTheScreen();
  expect(screen.getByText(/~1 of 2/)).toBeOnTheScreen();
}, 15000);
