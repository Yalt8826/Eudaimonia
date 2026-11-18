// T2.7 — the /routine day screen offline: THE exit-test surface. With the
// server unreachable and a cached plan revision on the phone, the day's
// blocks still render (stale, honestly labeled — never fabricated
// coverage numbers) and a tick still queues (law 9: it rides the wake-tap
// armor). Before the offline cache, this screen showed "plan · missing"
// in airplane mode — blocks that do not render cannot tick.
//
// ONE TREE PER FILE — see wake.test.tsx for the renderRouter quirk.
import { afterEach, expect, it, jest } from "@jest/globals";
import { cleanup, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import type { Outbox } from "../data/queue";

jest.mock("../data/appOutbox", () => {
  // a faithful queue boundary: enqueue STORES the record, pending reads
  // the store back — the optimistic overlay depends on that contract
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
  return { appOutbox: (): typeof box => box, __offlineMocks: { enqueue, sync, records, kvStore } };
});

const { __offlineMocks } = jest.requireMock("../data/appOutbox") as {
  __offlineMocks: {
    enqueue: { mockClear(): void };
    sync: { mockResolvedValue(v: unknown): void; mockReset(): void };
    records: Record<string, unknown>[];
    kvStore: Map<string, string>;
  };
};
const { enqueue, sync, records, kvStore } = __offlineMocks;

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

/** The server is GONE: every fetch rejects (airplane mode). */
function mockFetchOffline(): void {
  globalThis.fetch = jest.fn(async () => {
    throw new Error("network down (airplane mode)");
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
  kvStore.clear();
  jest.restoreAllMocks();
});

it("offline with a cached plan: blocks render stale, a tick queues, no fabricated coverage", async () => {
  pinClock(14);
  // the cache is what a previous online session left on the phone
  kvStore.set(
    "eudaimonia:plan-revision",
    JSON.stringify({
      week_start: PLAN.week_start,
      plan_lines: PLAN.plan_lines,
      plan_keys: PLAN.plan_keys,
    }),
  );
  mockFetchOffline();
  sync.mockResolvedValue({ replayed: 0, stoppedAt: "device:routine_done:0" });

  const router = renderRouter("./src/app", { initialUrl: "/routine" });
  await router;

  // the day's blocks render from the cache — the tick surface exists
  expect(await screen.findByText("GRE deep work (~3h)")).toBeOnTheScreen();
  // honesty: the header says coverage is unavailable offline and the
  // server is unreachable — it never reads the absent coverage as "0 of 7"
  expect(screen.getByText(/coverage unavailable offline/)).toBeOnTheScreen();
  expect(screen.getByText(/server unreachable/)).toBeOnTheScreen();
  expect(screen.queryByText(/fresh 0 of 7/)).toBeNull();
  expect(screen.queryByText(/0 of 2/)).toBeNull();

  // THE exit assertion: an offline tick queues (no queue code of its own —
  // the shared outbox via writeTick), and the overlay shows it at once
  fireEvent.press(screen.getByLabelText("mark GRE deep work (~3h) done"));
  expect(await screen.findByText(/1 queued/)).toBeOnTheScreen();
  expect(enqueue).toHaveBeenCalledWith(
    "routine_done",
    expect.objectContaining({ routine_key: "gre-deep-work", date: "2026-11-13", method: "tap" }),
  );
}, 15000);
