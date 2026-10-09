import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deviceUUID,
  Outbox,
  createMemoryOutboxStore,
  type OutboxStore,
  type ReplayBody,
  type Transport,
} from "./queue";

// Fake-timer unit tests for the law-9 queue: ts is captured at tap time,
// ingested_at at retry time, the idempotency key is the device UUID, and a
// double replay is idempotent at the key level. A failed POST keeps the
// event queued and stops the run.

const DEVICE = "device-0000-uuid";
const TAP_TS = 1_726_000_000_000;
const RETRY_MS = 30_000;

afterEach(() => {
  vi.useRealTimers();
});

function setup(): { outbox: Outbox; store: OutboxStore } {
  vi.useFakeTimers();
  vi.setSystemTime(TAP_TS);
  const store = createMemoryOutboxStore();
  const outbox = new Outbox({ store, clock: { now: () => Date.now() }, deviceKey: DEVICE });
  return { outbox, store };
}

interface Recorder {
  calls: ReplayBody[];
}

function recordingTransport(ok: boolean | boolean[]): Transport & Recorder {
  const calls: ReplayBody[] = [];
  let step = 0;
  return {
    calls,
    async post(body) {
      calls.push(body);
      if (Array.isArray(ok)) {
        const result = ok[Math.min(step, ok.length - 1)];
        step += 1;
        return result;
      }
      return ok;
    },
  };
}

describe("offline event queue (law 9)", () => {
  it("captures ts at tap time, not replay time", async () => {
    const { outbox } = setup();
    const record = await outbox.enqueue("habit_tap", { method: "tap" });
    expect(record.ts).toBe(TAP_TS);

    vi.advanceTimersByTime(RETRY_MS);
    const transport = recordingTransport(true);
    const result = await outbox.replay(transport);

    expect(result.replayed).toBe(1);
    expect(transport.calls[0]?.ts).toBe(TAP_TS);
    expect(transport.calls[0]?.ingested_at).toBe(TAP_TS + RETRY_MS);
  });

  it("replays once, with the same idempotency key, and drains the store", async () => {
    const { outbox, store } = setup();
    await outbox.enqueue("habit_tap", { method: "tap" });

    const transport = recordingTransport(true);
    await outbox.replay(transport);

    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]?.idempotency_key).toBe(DEVICE);
    expect(await store.getAll()).toHaveLength(0);
  });

  it("is idempotent at the key level: double enqueue skips, double replay posts nothing", async () => {
    const { outbox, store } = setup();
    await outbox.enqueue("habit_tap", { method: "tap" });
    // same device + kind + tap time -> the skip guard keeps exactly one
    await outbox.enqueue("habit_tap", { method: "tap" });
    expect(await store.getAll()).toHaveLength(1);

    const transport = recordingTransport(true);
    await outbox.replay(transport);
    const afterFirstReplay = transport.calls.length;

    const second = await outbox.replay(transport);
    expect(second.replayed).toBe(0);
    expect(transport.calls.length).toBe(afterFirstReplay);
  });

  it("keeps the event queued and stops on a failed POST", async () => {
    const { outbox, store } = setup();
    const record = await outbox.enqueue("habit_tap", { method: "tap" });
    vi.advanceTimersByTime(RETRY_MS);

    const failing = recordingTransport(false);
    const failed = await outbox.replay(failing);

    expect(failed.stoppedAt).toBe(record.queueKey);
    expect(await store.getAll()).toHaveLength(1);

    // the later retry reuses the same key and the original tap ts
    vi.advanceTimersByTime(RETRY_MS);
    const succeeding = recordingTransport(true);
    const retry = await outbox.replay(succeeding);

    expect(retry.replayed).toBe(1);
    expect(succeeding.calls[0]?.idempotency_key).toBe(DEVICE);
    expect(succeeding.calls[0]?.ts).toBe(TAP_TS);
    expect(succeeding.calls[0]?.ingested_at).toBe(TAP_TS + 2 * RETRY_MS);
  });

  it("replays in enqueue order", async () => {
    const { outbox } = setup();
    await outbox.enqueue("habit_tap", { method: "tap" });
    vi.advanceTimersByTime(1_000);
    await outbox.enqueue("habit_tap", { method: "recall" });

    const transport = recordingTransport(true);
    await outbox.replay(transport);

    expect(transport.calls.map((body) => body.payload)).toEqual([
      { method: "tap" },
      { method: "recall" },
    ]);
  });
});

describe("deviceUUID", () => {
  it("generates once and reuses the stored value", () => {
    const backing = new Map<string, string>();
    const storage = {
      getItem: (key: string): string | null => (backing.has(key) ? (backing.get(key) ?? null) : null),
      setItem: (key: string, value: string): void => {
        backing.set(key, value);
      },
    };
    const first = deviceUUID(storage);
    const second = deviceUUID(storage);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });
});
