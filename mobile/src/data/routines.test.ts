// T2.7 — the routine tick store. The tick rides T2.1's queue: the import
// assert below pins the structural claim (this module enqueues onto the
// app outbox and declares no queue of its own), the method rule pins tick
// integrity (07 §18 — past the block's window is a recall), and the
// local-first read overlays pending records so a just-made tick shows
// before the drain.
import { afterEach, expect, it, jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  cacheDay,
  dayCountLine,
  fetchRoutineDay,
  planDate,
  readLocalDay,
  tickMethod,
  writeTick,
  type TickState,
} from "./routines";

// The mock carries a KeyValueStore-shaped kv and a pending() read, so
// readLocalDay's local-first overlay runs exactly as it does on device.
interface PendingMock {
  mockResolvedValue(v: unknown): void;
  mockReset(): void;
}

jest.mock("./appOutbox", () => {
  const enqueue = jest.fn();
  const sync = jest.fn();
  const kv = new Map<string, string>();
  const pending = jest.fn();
  const box = {
    outbox: { enqueue },
    sync,
    kv: {
      getItem: (k: string) => (kv.has(k) ? kv.get(k) : null),
      setItem: (k: string, v: string) => void kv.set(k, v),
    },
    pending,
  };
  return { appOutbox: (): typeof box => box, __tickMocks: { enqueue, sync, kv, pending } };
});

const { __tickMocks } = jest.requireMock("./appOutbox") as {
  __tickMocks: {
    enqueue: { mockResolvedValue(v: unknown): void; mockReset(): void };
    sync: { mockResolvedValue(v: unknown): void; mockReset(): void };
    kv: Map<string, string>;
    pending: PendingMock;
  };
};
const { enqueue, sync, kv, pending } = __tickMocks;

afterEach(() => {
  enqueue.mockReset();
  sync.mockReset();
  pending.mockReset();
  kv.clear();
});

it("the import assert: the tick store rides the shared queue, no queue of its own", () => {
  const source = readFileSync(join(__dirname, "routines.ts"), "utf-8");
  // it imports the app outbox singleton…
  expect(source).toContain('from "./appOutbox"');
  // …and declares no queue of its own (the T2.1 structural claim: if this
  // needs one line of queue code, the drain was built wrong — fix it there)
  expect(source).not.toMatch(/new Outbox|createSqliteOutboxStore|openDatabaseSync/);
  expect(source).not.toMatch(/createSyncScheduler|replayOnForeground|replayOnReconnect/);
});

it("tickMethod: a tick inside the block's window is a tap, after it a recall", () => {
  const tenForty = new Date(2026, 10, 13, 10, 40);
  const elevenFifty = new Date(2026, 10, 13, 11, 50);
  expect(tickMethod(660, tenForty)).toBe("tap"); // block runs to 11:00
  expect(tickMethod(660, elevenFifty)).toBe("recall");
  // the boundary is the window's end: ticking AT the end is still a tap
  expect(tickMethod(660, new Date(2026, 10, 13, 10, 59, 59))).toBe("tap");
});

it("planDate rolls the pre-4am hours onto the previous plan day", () => {
  expect(planDate(new Date(2026, 10, 13, 12, 0))).toBe("2026-11-13");
  expect(planDate(new Date(2026, 10, 14, 3, 59))).toBe("2026-11-13");
  expect(planDate(new Date(2026, 10, 14, 4, 0))).toBe("2026-11-14");
});

it("dayCountLine: ~ when any tick is a recall, skips noted separately, null on a tick-less day", () => {
  const ticks = new Map<string, TickState>([
    ["dmat", "done"],
    ["gre", "recall"],
    ["gym", "skip"],
  ]);
  expect(dayCountLine(ticks, 4)).toBe("~2 of 4 · 1 skip");
  expect(dayCountLine(new Map([["dmat", "done"]]), 4)).toBe("1 of 4");
  // a skip-only day reports the skips alone, never "0 of n"
  expect(dayCountLine(new Map([["gym", "skip"]]), 4)).toBe("1 skip");
  // a day with no ticks renders its coverage line, never a zero (law 7)
  expect(dayCountLine(new Map(), 4)).toBeNull();
});

it("writeTick enqueues onto the shared outbox and attempts the drain", async () => {
  enqueue.mockResolvedValue({
    queueKey: "device:routine_done:1",
    idempotency_key: "device",
    kind: "routine_done",
    ts: 1,
    payload: {},
  });
  sync.mockResolvedValue({ replayed: 1, stoppedAt: null });
  await writeTick("routine_done", { routine_key: "dmat", date: "2026-11-13", method: "tap" });
  expect(enqueue).toHaveBeenCalledWith("routine_done", {
    routine_key: "dmat",
    date: "2026-11-13",
    method: "tap",
  });
  expect(sync).toHaveBeenCalledTimes(1);
});

it("readLocalDay overlays pending records on the cached server copy", async () => {
  cacheDay("2026-11-13", new Map([["dmat", "done"]]));
  pending.mockResolvedValue([
    {
      queueKey: "device:routine_done:2",
      idempotency_key: "device",
      kind: "routine_done",
      ts: 2,
      payload: { routine_key: "gre", date: "2026-11-13", method: "recall" },
    },
    {
      queueKey: "device:routine_skip:1",
      idempotency_key: "device",
      kind: "routine_skip",
      ts: 3,
      payload: { routine_key: "gym", date: "2026-11-13" },
    },
    // another day's pending tick must not bleed into this one
    {
      queueKey: "device:routine_done:3",
      idempotency_key: "device",
      kind: "routine_done",
      ts: 4,
      payload: { routine_key: "dmat", date: "2026-11-14", method: "tap" },
    },
  ]);
  const day = await readLocalDay("2026-11-13");
  expect(day.ticks.get("dmat")).toBe("done"); // from the server cache
  expect(day.ticks.get("gre")).toBe("recall"); // pending beats nothing
  expect(day.ticks.get("gym")).toBe("skip");
  expect(day.ticks.size).toBe(3);
  expect(day.pending).toBe(2); // only this day's pending records count
});

it("a pending record outranks the cached copy for the same key", async () => {
  cacheDay("2026-11-13", new Map([["gym", "skip"]]));
  pending.mockResolvedValue([
    {
      queueKey: "device:routine_done:9",
      idempotency_key: "device",
      kind: "routine_done",
      ts: 9,
      payload: { routine_key: "gym", date: "2026-11-13", method: "tap" },
    },
  ]);
  const day = await readLocalDay("2026-11-13");
  expect(day.ticks.get("gym")).toBe("done");
});

it("fetchRoutineDay parses the server's day view into states", async () => {
  const fetchMock = jest.fn(async () => ({
    status: 200,
    json: async () => ({
      date: "2026-11-13",
      ticks: [
        { routine_key: "dmat", kind: "routine_done", method: "tap", ts: "2026-11-13T09:00:00+00:00" },
        { routine_key: "gre", kind: "routine_done", method: "recall", ts: "2026-11-13T20:00:00+00:00" },
        { routine_key: "gym", kind: "routine_skip", method: null, ts: "2026-11-13T19:00:00+00:00" },
      ],
    }),
  })) as unknown as typeof globalThis.fetch;
  const ticks = await fetchRoutineDay("2026-11-13", fetchMock);
  expect(ticks?.get("dmat")).toBe("done");
  expect(ticks?.get("gre")).toBe("recall");
  expect(ticks?.get("gym")).toBe("skip");
});

it("fetchRoutineDay: unreachable resolves null, never a fabricated day", async () => {
  const fetchMock = jest.fn(async () => ({
    status: 503,
    json: async () => ({}),
  })) as unknown as typeof globalThis.fetch;
  expect(await fetchRoutineDay("2026-11-13", fetchMock)).toBeNull();
});
