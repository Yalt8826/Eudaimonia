import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
  DEVICE_UUID_STORAGE_KEY,
  Outbox,
  createMemoryOutboxStore,
  systemClock,
  deviceUUID,
  type KeyValueStore,
  type OutboxStore,
  type ReplayBody,
  type Transport,
} from "./queue";
import {
  createSqliteKeyValue,
  createSqliteOutboxStore,
  type SqliteExecutor,
  type SqliteParam,
} from "./sqliteOutbox";

// The expo-sqlite store, bound to a REAL SQLite engine (node:sqlite — the
// same C engine family the phone runs). The store speaks a four-method
// executor interface; this file is the second binding of the same SQL, so
// ordering, uniqueness, JSON round-trips and persistence across
// close/reopen are measured, not assumed. Process death is simulated
// honestly: close the file, throw the handle away, reopen it.

function nodeExecutor(db: DatabaseSync): SqliteExecutor {
  return {
    exec: (sql: string) => {
      db.exec(sql);
    },
    run: (sql: string, params: SqliteParam[]) =>
      db.prepare(sql).run(...params) as { changes: number },
    getAll: <T>(sql: string, params: SqliteParam[]) =>
      db.prepare(sql).all(...params) as T[],
    getFirst: <T>(sql: string, params: SqliteParam[]) =>
      (db.prepare(sql).get(...params) as T | undefined) ?? null,
  };
}

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "eudaimonia-outbox-"));
  dbPath = join(dir, "eudaimonia-outbox.db");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  jest.useRealTimers();
});

function openStore(path: string): { exec: SqliteExecutor; store: OutboxStore; close(): void } {
  const db = new DatabaseSync(path);
  const exec = nodeExecutor(db);
  return { exec, store: createSqliteOutboxStore(exec), close: () => db.close() };
}

function recordingTransport(ok: boolean | boolean[]): Transport & { calls: ReplayBody[] } {
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

describe("sqlite outbox store (real SQLite via node:sqlite)", () => {
  it("put / get / getAll round-trips payloads and preserves enqueue order by seq", async () => {
    const { store } = openStore(dbPath);
    const first = { queueKey: "d:habit_tap:1", idempotency_key: "d", kind: "habit_tap", ts: 1, payload: { method: "tap", nested: { n: 2 } } };
    const second = { queueKey: "d:habit_tap:2", idempotency_key: "d", kind: "habit_tap", ts: 2, payload: { method: "recall" } };
    await store.put(first);
    await store.put(second);

    expect(await store.getAll()).toEqual([first, second]); // JSON survives intact
    expect(await store.get("d:habit_tap:2")).toEqual(second);
    expect(await store.get("d:habit_tap:404")).toBeUndefined();
  });

  it("getAll on a fresh database is empty", async () => {
    const { store } = openStore(dbPath);
    expect(await store.getAll()).toEqual([]);
  });

  it("delete removes exactly the keyed record", async () => {
    const { store } = openStore(dbPath);
    await store.put({ queueKey: "a", idempotency_key: "d", kind: "habit_tap", ts: 1, payload: {} });
    await store.put({ queueKey: "b", idempotency_key: "d", kind: "habit_tap", ts: 2, payload: {} });
    await store.delete("a");
    const all = await store.getAll();
    expect(all.map((r) => r.queueKey)).toEqual(["b"]);
  });

  it("a duplicate queueKey is a storage-level rejection (the UNIQUE skip-guard backstop)", async () => {
    const { store } = openStore(dbPath);
    const record = { queueKey: "dup", idempotency_key: "d", kind: "habit_tap", ts: 1, payload: {} };
    await store.put(record);
    await expect(store.put({ ...record, payload: { tampered: true } })).rejects.toThrow();
    expect(await store.getAll()).toHaveLength(1);
  });

  it("order survives deletes interleaved with puts (AUTOINCREMENT never reuses seq)", async () => {
    const { store } = openStore(dbPath);
    await store.put({ queueKey: "a", idempotency_key: "d", kind: "habit_tap", ts: 1, payload: {} });
    await store.put({ queueKey: "b", idempotency_key: "d", kind: "habit_tap", ts: 2, payload: {} });
    await store.delete("a");
    await store.put({ queueKey: "c", idempotency_key: "d", kind: "habit_tap", ts: 3, payload: {} });
    expect((await store.getAll()).map((r) => r.queueKey)).toEqual(["b", "c"]);
  });

  // ---- the P2 exit test, at the storage layer ---------------------------
  it("EXIT-TEST SHADOW: queue survives process death — close, reopen, replay once", async () => {
    const TAP_TS = 1_726_000_012_345;
    jest.useFakeTimers({ now: TAP_TS });

    // airplane mode: enqueue offline — the failed replay keeps the event
    const first = openStore(dbPath);
    const outbox1 = new Outbox({
      store: first.store,
      clock: { now: () => Date.now() },
      deviceKey: "device-uuid",
    });
    const offline = recordingTransport(false); // unreachable: a normal state
    const stopped = await outbox1.replay(offline);
    expect(stopped.replayed).toBe(0);
    expect(offline.calls).toHaveLength(0);
    const record = await outbox1.enqueue("habit_tap", { method: "tap" });
    expect(record.ts).toBe(TAP_TS);

    // force-stop: the process (and every handle) is gone
    first.close();

    // reopen: a brand-new Outbox over the same file
    const second = openStore(dbPath);
    const outbox2 = new Outbox({
      store: second.store,
      clock: { now: () => Date.now() },
      deviceKey: "device-uuid",
    });
    jest.setSystemTime(TAP_TS + 120_000); // the outage window

    const online = recordingTransport(true);
    const result = await outbox2.replay(online);

    expect(result.replayed).toBe(1);
    expect(result.stoppedAt).toBeNull();
    expect(online.calls).toHaveLength(1);
    expect(online.calls[0]?.ts).toBe(TAP_TS); // the ORIGINAL tap time
    expect(online.calls[0]?.ingested_at).toBe(TAP_TS + 120_000); // retry time
    expect(online.calls[0]?.idempotency_key).toBe("device-uuid");
    expect(await second.store.getAll()).toHaveLength(0); // drained exactly once

    // a second replay after the drain posts nothing
    const again = await outbox2.replay(online);
    expect(again.replayed).toBe(0);
    expect(online.calls).toHaveLength(1);
  });

  it("EXIT-TEST SHADOW: the same tap replayed twice produces one event, not two", async () => {
    jest.useFakeTimers({ now: 1_726_000_000_000 });
    const { store } = openStore(dbPath);
    const outbox = new Outbox({ store, clock: { now: () => Date.now() }, deviceKey: "device-uuid" });

    const first = await outbox.enqueue("habit_tap", { method: "tap" });
    const second = await outbox.enqueue("habit_tap", { method: "tap" }); // same ms
    expect(second.queueKey).toBe(first.queueKey);
    expect(await store.getAll()).toHaveLength(1);

    const transport = recordingTransport(true);
    await outbox.replay(transport);
    await outbox.replay(transport);
    expect(transport.calls).toHaveLength(1);
  });

  it("Outbox over the SQLite store holds the full ported contract", async () => {
    jest.useFakeTimers({ now: 1_000 });
    const { store } = openStore(dbPath);
    const outbox = new Outbox({ store, clock: { now: () => Date.now() }, deviceKey: "d" });
    await outbox.enqueue("habit_tap", { method: "tap" });
    jest.advanceTimersByTime(1_000);
    await outbox.enqueue("habit_tap", { method: "recall" });

    const transport = recordingTransport(true);
    const result = await outbox.replay(transport);
    expect(result.replayed).toBe(2);
    expect(transport.calls.map((c) => [c.ts, c.payload])).toEqual([
      [1_000, { method: "tap" }],
      [2_000, { method: "recall" }],
    ]);
  });
});

describe("sqlite key-value store (the device-UUID storage)", () => {
  it("persists the minted UUID across close/reopen — minted once, reused forever", () => {
    let generated = 0;
    const generate = (): string => {
      generated += 1;
      return `11111111-2222-4333-8444-555555555555`;
    };

    const first = openStore(dbPath);
    const kv1: KeyValueStore = createSqliteKeyValue(first.exec);
    const minted = deviceUUID(kv1, generate);
    first.close();

    const second = openStore(dbPath);
    const kv2: KeyValueStore = createSqliteKeyValue(second.exec);
    expect(deviceUUID(kv2, generate)).toBe(minted);
    expect(generated).toBe(1);
    expect(kv2.getItem(DEVICE_UUID_STORAGE_KEY)).toBe(minted);
    second.close();
  });

  it("reads null when unset, and setItem over an existing key updates", () => {
    const { exec, close } = openStore(dbPath);
    const kv = createSqliteKeyValue(exec);
    expect(kv.getItem(DEVICE_UUID_STORAGE_KEY)).toBeNull();
    kv.setItem("k", "v1");
    kv.setItem("k", "v2");
    expect(kv.getItem("k")).toBe("v2");
    close();
  });
});

// Guard the guard: the memory store and the SQLite store must behave
// identically for every operation the Outbox performs.
describe("sqlite store ≡ memory store (the Outbox's view)", () => {
  it("identical getAll/get/put/delete sequences", async () => {
    const memory = createMemoryOutboxStore();
    const { store: sqlite, close } = openStore(dbPath);
    const record = (key: string, ts: number, method: string) => ({
      queueKey: key,
      idempotency_key: "d",
      kind: "habit_tap",
      ts,
      payload: { method },
    });

    for (const store of [memory, sqlite]) {
      await store.put(record("k1", 1, "tap"));
      await store.put(record("k2", 2, "recall"));
      expect((await store.getAll()).map((r) => r.queueKey)).toEqual(["k1", "k2"]);
      await store.delete("k1");
      expect((await store.getAll()).map((r) => r.queueKey)).toEqual(["k2"]);
      expect((await store.get("k2"))?.ts).toBe(2);
      expect(await store.get("k1")).toBeUndefined();
    }
    close();
  });
});

describe("systemClock", () => {
  it("reads the real clock", () => {
    const before = Date.now();
    expect(systemClock.now()).toBeGreaterThanOrEqual(before);
    expect(systemClock.now()).toBeLessThanOrEqual(Date.now());
  });
});
