import { afterEach, expect, it, jest } from "@jest/globals";
import { cleanup, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import type { Outbox } from "../data/queue";


// A queue-write failure claims NOTHING and keeps the surface usable (04
// wake spec: it never blocks — "will sync" is simply not claimed, and the
// one-shot guard releases so the tap can be retried). Failure must not
// read as success, 02 §6.
//
// ONE TREE PER FILE — see wake.test.tsx for the renderRouter quirk.

// The mocks are typed through this minimal interface, NOT jest.fn<...>'s
// generics: @jest/globals 29.7 and jest-mock 30.5 disagree about Mock's
// shape in this install, and the honest fix is the boundary this test owns.
interface WakeMock {
  mockResolvedValue(v: unknown): void;
  mockRejectedValueOnce(v: unknown): WakeMock;
  mockImplementationOnce(f: () => Promise<number>): void;
  mockImplementation(f: () => Promise<number>): void;
  mockReset(): void;
}

jest.mock("../data/appOutbox", () => {
  const enqueue = jest.fn() as unknown as WakeMock;
  const depth = jest.fn() as unknown as WakeMock;
  const sync = jest.fn() as unknown as WakeMock;
  const box = {
    outbox: { enqueue, depth } as unknown as Outbox,
    sync,
    endpoint: "https://test/api/events/habit_tap",
  };
  return { appOutbox: (): typeof box => box, __wakeMocks: { enqueue, depth, sync } };
});

const { __wakeMocks } = jest.requireMock("../data/appOutbox") as {
  __wakeMocks: { enqueue: WakeMock; depth: WakeMock; sync: WakeMock };
};
const { enqueue, depth, sync } = __wakeMocks;

afterEach(() => {
  cleanup();
  enqueue.mockReset();
  depth.mockReset();
  sync.mockReset();
});

it("a queue-write failure claims nothing, releases the guard, keeps the tap retryable", async () => {
  // first press: the queue write itself fails (disk full, store corrupt)
  enqueue.mockRejectedValueOnce(new Error("disk full"));

  const router = renderRouter("./src/app", { initialUrl: "/habits/wake" });
  await router;
  // renderRouter installs jest fake timers (expo-router testing-library
  // index.js:38) — this test's real-time settle window must run on real
  // timers, or its raw await never resolves and the test wedges.
  jest.useRealTimers();

  fireEvent.press(screen.getByLabelText("I'M AWAKE"));
  await new Promise((r) => setTimeout(r, 50));

  // no claim was made — neither queued nor registered
  expect(screen.queryByText(/will sync/)).toBeNull();
  expect(screen.queryByText("registered")).toBeNull();
  expect(router.getPathnameWithParams()).toBe("/habits/wake"); // no exit either

  // the guard released: the retry press reaches the outbox and queues
  enqueue.mockResolvedValue({
    queueKey: "device:habit_tap:1",
    idempotency_key: "device",
    kind: "habit_tap",
    ts: 1,
    payload: {},
  });
  depth.mockImplementation(async () => 1);
  sync.mockResolvedValue({ replayed: 0, stoppedAt: null });
  fireEvent.press(screen.getByLabelText("I'M AWAKE"));
  expect(await screen.findByText("queued · will sync")).toBeOnTheScreen();
  expect(enqueue).toHaveBeenCalledTimes(2);
}, 15000);
