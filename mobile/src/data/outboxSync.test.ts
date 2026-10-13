import { describe, expect, it } from "@jest/globals";

import { Outbox, createMemoryOutboxStore, type ReplayBody, type Transport } from "./queue";
import {
  createSyncScheduler,
  replayOnForeground,
  replayOnReconnect,
  type AppStateLike,
  type NetworkStateLike,
} from "./outboxSync";

// The trigger layer: the phone ports of the web's `online` handler and the
// P2 hardening rule ("flush on the sync event AND on next foreground —
// either path alone is a lost tap"). The queue semantics are Outbox.replay,
// already contracted in queue.test.ts; what is contracted here is that
// concurrent triggers never double-POST and each platform event fires it.

function makeOutbox(): { outbox: Outbox; store: ReturnType<typeof createMemoryOutboxStore> } {
  let tick = 0;
  const store = createMemoryOutboxStore();
  const outbox = new Outbox({
    store,
    clock: { now: () => 1_000 + tick++ }, // distinct ts per enqueue: same-key dedup must not mask the assertions
    deviceKey: "d",
  });
  return { outbox, store };
}

function recordingTransport(delaysMs: number[] = []): Transport & { calls: ReplayBody[]; maxInFlight(): number } {
  const calls: ReplayBody[] = [];
  let inFlight = 0;
  let peak = 0;
  return {
    calls,
    maxInFlight: () => peak,
    async post(body) {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      const delay = delaysMs[calls.length] ?? 0;
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      calls.push(body);
      inFlight -= 1;
      return true;
    },
  };
}

describe("createSyncScheduler", () => {
  it("serializes overlapping triggers — never more than one replay in flight", async () => {
    const { outbox } = makeOutbox();
    await outbox.enqueue("habit_tap", { method: "tap" });
    await outbox.enqueue("habit_tap", { method: "recall" });
    const transport = recordingTransport([30, 10]);
    const sync = createSyncScheduler(outbox, transport);

    const a = sync();
    const b = sync(); // e.g. reconnect fired while the enqueue-sync was running
    const [ra, rb] = await Promise.all([a, b]);

    expect(ra.replayed).toBe(2); // first run drains both, in order
    expect(rb.replayed).toBe(0); // second run finds the queue empty
    expect(transport.calls).toHaveLength(2);
    expect(transport.maxInFlight()).toBe(1); // never concurrent POSTs in-process
  });

  it("a rejected replay run does not wedge later syncs", async () => {
    const { outbox, store } = makeOutbox();
    await outbox.enqueue("habit_tap", { method: "tap" });
    const bad = createSyncScheduler(outbox, {
      post: async () => {
        throw new Error("storage exploded");
      },
    });
    const good = createSyncScheduler(outbox, recordingTransport());
    await expect(bad()).rejects.toThrow("storage exploded");
    expect(await store.getAll()).toHaveLength(1); // the event survived the crashed run
    const result = await good();
    expect(result.replayed).toBe(1); // the funnel still works after the throw
  });
});

describe("replayOnForeground", () => {
  function fakeAppState(): AppStateLike & { emit(state: string): void } {
    let listener: ((state: string) => void) | null = null;
    return {
      addEventListener(_type, cb) {
        listener = cb;
        return { remove: () => (listener = null) };
      },
      emit(state) {
        listener?.(state);
      },
    };
  }

  it("syncs on active, not on background", async () => {
    const { outbox } = makeOutbox();
    const transport = recordingTransport();
    const sync = createSyncScheduler(outbox, transport);
    const appState = fakeAppState();
    const off = replayOnForeground(sync, appState);

    await outbox.enqueue("habit_tap", { method: "tap" });
    appState.emit("background");
    expect(transport.calls).toHaveLength(0);
    appState.emit("active");
    await new Promise((r) => setTimeout(r, 0));
    expect(transport.calls).toHaveLength(1);

    off();
    appState.emit("active"); // uninstalled — no more syncs
    await new Promise((r) => setTimeout(r, 0));
    expect(transport.calls).toHaveLength(1);
  });
});

describe("replayOnReconnect (the `online` port)", () => {
  function fakeNetwork(): {
    subscribe: (cb: (state: NetworkStateLike) => void) => { remove(): void };
    emit(state: NetworkStateLike): void;
  } {
    let listener: ((state: NetworkStateLike) => void) | null = null;
    return {
      subscribe(cb) {
        listener = cb;
        return { remove: () => (listener = null) };
      },
      emit(state) {
        listener?.(state);
      },
    };
  }

  function harness() {
    const { outbox } = makeOutbox();
    const transport = recordingTransport();
    const sync = createSyncScheduler(outbox, transport);
    const network = fakeNetwork();
    return { outbox, transport, sync, network };
  }

  it("syncs when internet becomes reachable", async () => {
    const { outbox, transport, sync, network } = harness();
    replayOnReconnect(sync, network.subscribe);
    await outbox.enqueue("habit_tap", { method: "tap" });

    network.emit({ isConnected: true, isInternetReachable: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(transport.calls).toHaveLength(1);
  });

  it("syncs while Android is still evaluating reachability (null, connected)", async () => {
    const { outbox, transport, sync, network } = harness();
    replayOnReconnect(sync, network.subscribe);
    await outbox.enqueue("habit_tap", { method: "tap" });

    network.emit({ isConnected: true, isInternetReachable: null });
    await new Promise((r) => setTimeout(r, 0));
    expect(transport.calls).toHaveLength(1);
  });

  it("does not sync on a lost connection, nor on reported-unreachable", async () => {
    const { outbox, transport, sync, network } = harness();
    replayOnReconnect(sync, network.subscribe);
    await outbox.enqueue("habit_tap", { method: "tap" });

    network.emit({ isConnected: false, isInternetReachable: false });
    network.emit({ isConnected: true, isInternetReachable: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(transport.calls).toHaveLength(0);
  });

  it("an extra sync on a drained queue posts nothing — unreachable is a normal state", async () => {
    const { outbox, transport, sync, network } = harness();
    replayOnReconnect(sync, network.subscribe);
    await outbox.enqueue("habit_tap", { method: "tap" });
    network.emit({ isConnected: true, isInternetReachable: true });
    network.emit({ isConnected: true, isInternetReachable: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(transport.calls).toHaveLength(1); // dedup at the drained-queue level
  });
});
