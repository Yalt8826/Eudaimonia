// T2.7 — the /routine day screen offline with NO cache: the honest dead
// end. No cached revision and no server means no blocks — the screen says
// exactly that (open once online and the day's blocks tick offline after
// that) and invents nothing: no blocks, no tick buttons.
//
// ONE TREE PER FILE — see wake.test.tsx for the renderRouter quirk.
import { afterEach, expect, it, jest } from "@jest/globals";
import { cleanup, renderRouter, screen } from "expo-router/testing-library";
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
  return { appOutbox: (): typeof box => box, __offlineEmptyMocks: { records } };
});

const { __offlineEmptyMocks } = jest.requireMock("../data/appOutbox") as {
  __offlineEmptyMocks: { records: Record<string, unknown>[] };
};
const { records } = __offlineEmptyMocks;

afterEach(() => {
  cleanup();
  records.length = 0;
  jest.restoreAllMocks();
});

it("offline with NO cached plan: an honest dead end, never invented blocks", async () => {
  jest.spyOn(Date.prototype, "getHours").mockReturnValue(14);
  jest.spyOn(Date.prototype, "getFullYear").mockReturnValue(2026);
  jest.spyOn(Date.prototype, "getMonth").mockReturnValue(10);
  jest.spyOn(Date.prototype, "getDate").mockReturnValue(13);
  globalThis.fetch = jest.fn(async () => {
    throw new Error("network down (airplane mode)");
  }) as unknown as typeof globalThis.fetch;

  const router = renderRouter("./src/app", { initialUrl: "/routine" });
  await router;

  expect(await screen.findByText(/no cached plan — open once online/)).toBeOnTheScreen();
  expect(screen.queryByText(/mark /)).toBeNull();
  expect(records.length).toBe(0);
}, 15000);
