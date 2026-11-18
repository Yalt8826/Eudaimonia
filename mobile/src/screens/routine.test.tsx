// T2.7 — the /routine day screen, part 1: the unticked day and the
// in-window tap. Ticks are optional evidence, never duty (07 §18):
// unticked renders unticked with no hue, a day with no ticks renders its
// coverage line, never a zero.
//
// ONE TREE PER FILE — see wake.test.tsx for the renderRouter quirk.
import { afterEach, expect, it, jest } from "@jest/globals";
import { cleanup, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import type { Outbox } from "../data/queue";

jest.mock("../data/appOutbox", () => {
  // a faithful queue boundary: enqueue STORES the record (skip-guard key
  // like the real Outbox), pending reads the store back — the optimistic
  // overlay in readLocalDay depends on that contract
  const records: Record<string, unknown>[] = [];
  const enqueue = jest.fn((kind: string, payload: Record<string, unknown>) => {
    const record = {
      queueKey: `device:${kind}:${records.length}`,
      idempotency_key: "device",
      kind,
      ts: 1000 + records.length,
      payload,
    };
    records.push(record);
    return Promise.resolve(record);
  });
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
  return { appOutbox: (): typeof box => box, __routineMocks: { enqueue, sync, records } };
});

const { __routineMocks } = jest.requireMock("../data/appOutbox") as {
  __routineMocks: {
    enqueue: { mockClear(): void };
    sync: { mockResolvedValue(v: unknown): void; mockReset(): void };
    records: Record<string, unknown>[];
  };
};
const { enqueue, sync, records } = __routineMocks;

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

function mockFetch(ticks: unknown, status = 200): void {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/plan/today")) {
      return { status, json: async () => PLAN };
    }
    return { status, json: async () => ticks };
  }) as unknown as typeof globalThis.fetch;
}

/** Pin the wall clock: the method rule (tap vs recall) is relative to the
    block's window, and the machine running the suite could be at any
    hour. 2026-11-13 is the plan's week. */
function pinClock(hour: number, minute = 0): void {
  jest.spyOn(Date.prototype, "getHours").mockReturnValue(hour);
  jest.spyOn(Date.prototype, "getMinutes").mockReturnValue(minute);
  jest.spyOn(Date.prototype, "getFullYear").mockReturnValue(2026);
  jest.spyOn(Date.prototype, "getMonth").mockReturnValue(10); // November
  jest.spyOn(Date.prototype, "getDate").mockReturnValue(13);
}

afterEach(() => {
  cleanup();
  sync.mockReset();
  records.length = 0;
  enqueue.mockClear();
  jest.restoreAllMocks();
});

it("the unticked day renders its coverage line — never a zero count", async () => {
  pinClock(14);
  mockFetch({ date: "2026-11-13", ticks: [] });
  const router = renderRouter("./src/app", { initialUrl: "/routine" });
  await router;

  expect(await screen.findByText("GRE deep work (~3h)")).toBeOnTheScreen();
  // the header carries the coverage line, not "0 of 2" (law 7)
  expect(screen.getByText(/fresh 4 of 7/)).toBeOnTheScreen();
  expect(screen.queryByText(/0 of 2/)).toBeNull();
}, 15000);

it("tapping done inside the window enqueues routine_done with method tap", async () => {
  pinClock(14);
  mockFetch({ date: "2026-11-13", ticks: [] });
  sync.mockResolvedValue({ replayed: 1, stoppedAt: null });
  const router = renderRouter("./src/app", { initialUrl: "/routine" });
  await router;

  fireEvent.press(screen.getByLabelText("mark GRE deep work (~3h) done"));
  // the optimistic overlay: the count line shows without any server round
  expect(await screen.findByText(/1 of 2/)).toBeOnTheScreen();
  expect(enqueue).toHaveBeenCalledWith(
    "routine_done",
    expect.objectContaining({ routine_key: "gre-deep-work", method: "tap", date: "2026-11-13" }),
  );
  expect(screen.queryByText(/~1 of 2/)).toBeNull();
}, 15000);
