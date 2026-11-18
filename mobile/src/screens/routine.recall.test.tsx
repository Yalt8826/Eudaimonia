// T2.7 — the /routine day screen, part 3: recalls. A tick made after the
// block's window passed is a RECALL (method chosen at the source), it
// renders ~ in the row and the count line — ~ in EVERY window it is
// counted (law 11), and this screen is one of those windows.
//
// ONE TREE PER FILE — see wake.test.tsx for the renderRouter quirk.
import { afterEach, expect, it, jest } from "@jest/globals";
import { cleanup, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import type { Outbox } from "../data/queue";

jest.mock("../data/appOutbox", () => {
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

function pinClock(hour: number): void {
  jest.spyOn(Date.prototype, "getHours").mockReturnValue(hour);
  jest.spyOn(Date.prototype, "getMinutes").mockReturnValue(0);
  jest.spyOn(Date.prototype, "getFullYear").mockReturnValue(2026);
  jest.spyOn(Date.prototype, "getMonth").mockReturnValue(10);
  jest.spyOn(Date.prototype, "getDate").mockReturnValue(13);
}

afterEach(() => {
  cleanup();
  sync.mockReset();
  records.length = 0;
  enqueue.mockClear();
  jest.restoreAllMocks();
});

it("ticking after the block's window queues a recall — never a tap", async () => {
  pinClock(20); // 8pm: the GRE block ended at 6:45pm
  mockFetch({ date: "2026-11-13", ticks: [] });
  sync.mockResolvedValue({ replayed: 1, stoppedAt: null });
  const router = renderRouter("./src/app", { initialUrl: "/routine" });
  await router;

  fireEvent.press(screen.getByLabelText("mark GRE deep work (~3h) done"));
  expect(await screen.findByText(/recalled/)).toBeOnTheScreen();
  expect(enqueue).toHaveBeenCalledWith(
    "routine_done",
    expect.objectContaining({ routine_key: "gre-deep-work", method: "recall" }),
  );
}, 15000);
