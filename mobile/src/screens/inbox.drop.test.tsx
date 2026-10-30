import { afterEach, expect, it, jest } from "@jest/globals";
import { cleanup, fireEvent, renderRouter, screen } from "expo-router/testing-library";
import type { Outbox } from "../data/queue";

// THE drop-reason regression (owner-measured 2026-10-29): the first drop
// never asked for a reason. Root cause: the outbox kv's getItem returns
// NULL for a missing key, and the "already asked" check tested
// `!== undefined` — so null read as already-asked and the prompt never
// showed. The rule: the FIRST drop per source ASKS (the reason rides the
// event payload); only after a confirmed drop does the flag settle, and
// later drops skip the prompt.
//
// One renderRouter tree per file (the expo-router testing quirk) — both
// drop phases run sequentially against the single tree.

interface DropMock {
  mockResolvedValue(v: unknown): void;
  mockReset(): void;
}

const mockBacking = new Map<string, string>();

jest.mock("../data/loops", () => ({
  RESOLUTIONS: [
    { kind: "loop_done", label: "done" },
    { kind: "loop_rolled", label: "roll" },
    { kind: "loop_dropped", label: "drop" },
  ],
  fetchOpenLoops: jest.fn(async () => ({
    loops: [
      { id: 1, text: "loop one", direction: "owed-by-me", ts: "t", age_days: 0 },
      { id: 2, text: "loop two", direction: "owed-by-me", ts: "t", age_days: 0 },
    ],
    count: 2,
    owed_by_me: 2,
    owed_to_me: 0,
  })),
  resolutionPayload: (kind: string, loopId: number, reason?: string) => {
    const payload: { kind: string; loop_id: number; reason?: string } = {
      kind,
      loop_id: loopId,
    };
    const trimmed = reason?.trim();
    if (trimmed) payload.reason = trimmed;
    return payload;
  },
}));

jest.mock("../data/appOutbox", () => {
  const enqueue = jest.fn();
  const depth = jest.fn();
  const sync = jest.fn();
  const kv = {
    getItem: jest.fn(async (key: string) =>
      mockBacking.has(key) ? (mockBacking.get(key) as string) : null,
    ),
    setItem: jest.fn(async (key: string, value: string) => {
      mockBacking.set(key, value);
    }),
  };
  const box = {
    outbox: { enqueue, depth } as unknown as Outbox,
    kv,
    sync,
    endpoint: "https://test/api/events/loop_dropped",
  };
  return { appOutbox: (): typeof box => box };
});

const mockModule = jest.requireMock("../data/appOutbox") as {
  appOutbox: () => {
    outbox: { enqueue: { mockResolvedValue(v: unknown): void; mockReset(): void } };
    kv: {
      getItem: { mockResolvedValue(v: unknown): void; mockReset(): void };
      setItem: { mockReset(): void };
    };
    sync: { mockResolvedValue(v: unknown): void; mockReset(): void };
  };
};
// the singleton the SCREEN gets is the same object the tests assert on
const box = mockModule.appOutbox();

const { enqueue } = {
  enqueue: box.outbox.enqueue,
};

afterEach(() => {
  cleanup();
  box.outbox.enqueue.mockReset();
  box.kv.getItem.mockReset();
  box.kv.setItem.mockReset?.();
  box.sync.mockReset();
  mockBacking.clear();
});

function loop_open(): void {
  box.sync.mockResolvedValue({ replayed: 1, stoppedAt: null });
  box.outbox.enqueue.mockResolvedValue({
    queueKey: "device:loop_dropped:1",
    idempotency_key: "device",
    kind: "loop_dropped",
    ts: 1,
    payload: {},
  });
}

it("the drop flow: the first drop shows the reason prompt (the null-check fix)", async () => {
  loop_open();
  const router = renderRouter("./src/app", { initialUrl: "/inbox" });
  await router;

  // THE regression: with the kv null-check bug the reason input never
  // appeared — the drop landed silently. The prompt must appear on the
  // first drop.
  fireEvent.press(screen.getAllByLabelText(/^drop: /)[0]);
  expect(
    await screen.findByPlaceholderText("why drop it? (one line)"),
  ).toBeOnTheScreen();
}, 15000);
