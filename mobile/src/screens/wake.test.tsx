import { afterEach, expect, it, jest } from "@jest/globals";
import { cleanup, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import type { Outbox } from "../data/queue";

import { MOTION } from "../theme/motion";

// The wake screen's contract, T2.1 (04 wake spec; 02 §2 law 9; owner-
// measured 2026-10-24 — one morning, one wake, FOUR events, because the
// surface never confirmed and never exited):
//
//   ONE-SHOT   the first tap (either path) makes both targets inert — a
//              groggy double-tap can never mint a second event
//   HONEST     the status claims the OUTBOX DEPTH, read from the store —
//              "will sync" above zero, "registered" at zero — never a state
//              variable's optimism (the M5 weak assertion, closed)
//   SELF-EXIT  after MOTION.wakeExitHoldMs the surface router.replace()s to
//              the Plaza — the surface does the navigating, so the groggy
//              user never has to; replace, so system back never returns to
//              a spent wake screen
//
// The outbox module is mocked at the boundary (appOutbox()); the
// enqueue→replay→POST contract itself is measured in src/data against real
// SQLite and injected transports. Under jest the native modules would be
// the inert stand-ins from jest.setup.js; the mock keeps counts observable.
//
// ONE TREE PER FILE: expo-router's renderRouter serves exactly one queryable
// tree per test file — a second renderRouter in the same file renders a tree
// whose texts cannot be found (the M3 suite's documented test-host quirk,
// hit again here). The core offline sequence is the one test in THIS file;
// the registered-claim and queue-failure variants live in
// wake.status.test.tsx and wake.failure.test.tsx, which each get their own
// module registry.

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

/** Depth answers, in order: after enqueue, then after each sync settles.
 *  enqueue resolves with a minimal record — the screen awaits it before it
 *  paints anything. */
function depths(...values: number[]): void {
  enqueue.mockResolvedValue({
    queueKey: "device:habit_tap:1",
    idempotency_key: "device",
    kind: "habit_tap",
    ts: 1,
    payload: {},
  });
  for (const v of values) depth.mockImplementationOnce(async () => v);
  sync.mockResolvedValue({ replayed: 0, stoppedAt: null });
}

it("the wake surface: claims from depth, is one-shot, exits itself", async () => {
  depths(1, 1); // one event queued; sync changes nothing (offline)
  const router = renderRouter("./src/app", { initialUrl: "/habits/wake" });
  await router;
  // renderRouter installs jest fake timers (expo-router testing-library
  // index.js:38) — the exit hold and these sleeps must run on REAL time, or
  // neither ever fires and the test wedges at its first raw await.
  jest.useRealTimers();

  expect(screen.queryByText(/will sync/)).toBeNull(); // no claim before any tap

  // the tap queues and claims the store's truth
  fireEvent.press(screen.getByLabelText("I'M AWAKE"));
  expect(await screen.findByText("queued · will sync")).toBeOnTheScreen();
  expect(enqueue).toHaveBeenCalledTimes(1);
  expect(enqueue).toHaveBeenCalledWith("habit_tap", { method: "tap" });

  // ONE-SHOT: the 4-event morning — the second press lands while the first
  // enqueue is still in flight, and a recall press follows it; the
  // synchronous guard must absorb them all.
  fireEvent.press(screen.getByLabelText("I'M AWAKE"));
  fireEvent.press(screen.getByLabelText("recall instead"));
  expect(enqueue).toHaveBeenCalledTimes(1);

  // the exit: still here just before the hold elapses…
  expect(router.getPathnameWithParams()).toBe("/habits/wake");
  await new Promise((r) => setTimeout(r, MOTION.wakeExitHoldMs - 200));
  expect(router.getPathnameWithParams()).toBe("/habits/wake");
  // …gone after it — and via replace, so back never lands here again
  await new Promise((r) => setTimeout(r, 400));
  expect(router.getPathnameWithParams()).toBe("/");
}, 15000);
