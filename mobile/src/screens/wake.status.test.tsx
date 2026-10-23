import { afterEach, expect, it, jest } from "@jest/globals";
import { cleanup, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import type { Outbox } from "../data/queue";


// The registered claim — the online half of the wake status (T2.1): when
// the immediate sync drains the outbox, the depth read that follows reports
// 0 and the surface says "registered", never "will sync". Honesty cuts both
// ways: a claim of syncing when the server already took the event is the
// same lie as claiming nothing is queued when it is.
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

it("the wake surface claims 'registered' when the sync drained the outbox", async () => {
  // after enqueue: 1 queued; after the immediate sync settles: drained
  enqueue.mockResolvedValue({
    queueKey: "device:habit_tap:1",
    idempotency_key: "device",
    kind: "habit_tap",
    ts: 1,
    payload: {},
  });
  depth.mockImplementationOnce(async () => 1);
  depth.mockImplementationOnce(async () => 0);
  sync.mockResolvedValue({ replayed: 1, stoppedAt: null });

  const router = renderRouter("./src/app", { initialUrl: "/habits/wake" });
  await router;

  fireEvent.press(screen.getByLabelText("I'M AWAKE"));
  expect(await screen.findByText("registered")).toBeOnTheScreen();
  expect(screen.queryByText(/will sync/)).toBeNull();
}, 15000);
