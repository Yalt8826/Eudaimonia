// Offline event-queue — ported from client/src/sw/queue.ts at M3 (02 §2 law 9,
// EXECUTION.md Part IV never-cut). The semantics are NOT redesigned: the
// idempotency guard, dedup and ordering carry over exactly; only the storage
// changes (service worker + IndexedDB there, expo-sqlite here — see
// sqliteOutbox.ts). The three hard-mode fields are fixed here:
//   ts              = tap time, captured from the client clock AT ENQUEUE
//   ingested_at     = retry time, set AT REPLAY, never before
//   idempotency_key = device UUID, generated once and riding every event
// Replay iterates in enqueue order and stops on the first failed POST,
// keeping that event queued. Server-side dedupe is the spine's
// UNIQUE(source_id, kind, external_ref) with wake-tap
// external_ref = "{device_uuid}:{tap_ts}" — one replay storm, one row.

export interface OutboxRecord {
  /** Skip-guard key: `${idempotency_key}:${kind}:${ts}` — idempotency at the key level. */
  queueKey: string;
  /** Device UUID — generated once, rides every queued event (law 9). */
  idempotency_key: string;
  /** Event kind, e.g. `habit_tap`. */
  kind: string;
  /** Tap time from the client clock — set at enqueue, never touched again. */
  ts: number;
  payload: Record<string, unknown>;
}

/** The exact POST body the server ingests; ingested_at exists only at replay. */
export interface ReplayBody {
  idempotency_key: string;
  kind: string;
  ts: number;
  ingested_at: number;
  payload: Record<string, unknown>;
}

export interface OutboxStore {
  get(queueKey: string): Promise<OutboxRecord | undefined>;
  /** Records in enqueue order. */
  getAll(): Promise<OutboxRecord[]>;
  put(record: OutboxRecord): Promise<void>;
  delete(queueKey: string): Promise<void>;
}

/** Transport boundary — resolves true only on a 2xx. */
export interface Transport {
  post(body: ReplayBody): Promise<boolean>;
}

export interface OutboxClock {
  now(): number;
}

export interface OutboxOptions {
  store: OutboxStore;
  clock: OutboxClock;
  /** Injected by tests; defaults to the persisted deviceUUID(). */
  deviceKey?: string;
}

export interface ReplayResult {
  /** How many events were posted and removed. */
  replayed: number;
  /** queueKey of the event that failed, if replay stopped on it. */
  stoppedAt: string | null;
}

/**
 * Minimal key-value storage for the device UUID. The web client used
 * `Pick<Storage, "getItem" | "setItem">` (localStorage); on the phone the
 * same shape is backed by the outbox SQLite file's kv table, which survives
 * force-stops the same way.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEVICE_UUID_STORAGE_KEY = "eudaimonia:device-uuid";

/**
 * The device idempotency key: generated once via a UUIDv4 generator, stored,
 * and reused forever — it rides every queued event. The web port's default
 * generator was crypto.randomUUID; on the phone the wiring passes
 * expo-crypto's randomUUID, so this module stays free of native imports.
 */
export function deviceUUID(
  storage: KeyValueStore,
  generate: () => string,
): string {
  const existing = storage.getItem(DEVICE_UUID_STORAGE_KEY);
  if (existing !== null) return existing;
  const created = generate();
  storage.setItem(DEVICE_UUID_STORAGE_KEY, created);
  return created;
}

export function createMemoryOutboxStore(): OutboxStore {
  const byKey = new Map<string, OutboxRecord>();
  const order: string[] = [];
  return {
    async get(queueKey) {
      return byKey.get(queueKey);
    },
    async getAll() {
      const records: OutboxRecord[] = [];
      for (const queueKey of order) {
        const record = byKey.get(queueKey);
        if (record !== undefined) records.push(record);
      }
      return records;
    },
    async put(record) {
      if (!byKey.has(record.queueKey)) order.push(record.queueKey);
      byKey.set(record.queueKey, record);
    },
    async delete(queueKey) {
      byKey.delete(queueKey);
    },
  };
}

export const systemClock: OutboxClock = { now: () => Date.now() };

export class Outbox {
  private readonly store: OutboxStore;
  private readonly clock: OutboxClock;
  private readonly deviceKey: string;

  constructor(options: OutboxOptions) {
    this.store = options.store;
    this.clock = options.clock;
    this.deviceKey = options.deviceKey ?? "";
    if (options.deviceKey === undefined) {
      throw new Error(
        "Outbox requires an explicit deviceKey — mint it once via deviceUUID() " +
          "and persist it; the key must never be regenerated per call.",
      );
    }
  }

  /**
   * Queue an app event. ts is captured from the clock HERE, at tap time.
   * Enqueuing the same (device, kind, tap time) twice is a no-op — the
   * skip guard keeps idempotency at the key level.
   */
  async enqueue(kind: string, payload: Record<string, unknown>): Promise<OutboxRecord> {
    const ts = this.clock.now();
    const idempotency_key = this.deviceKey;
    const queueKey = `${idempotency_key}:${kind}:${ts}`;
    const existing = await this.store.get(queueKey);
    if (existing !== undefined) return existing;
    const record: OutboxRecord = { queueKey, idempotency_key, kind, ts, payload };
    await this.store.put(record);
    return record;
  }

  /**
   * Replay in order. ingested_at is stamped per event from the clock at
   * RETRY time. 2xx removes the event; any failure keeps it queued and
   * stops the run, so a double replay never double-posts an ingested event.
   */
  async replay(transport: Transport): Promise<ReplayResult> {
    const records = await this.store.getAll();
    let replayed = 0;
    for (const record of records) {
      const ok = await transport.post({
        idempotency_key: record.idempotency_key,
        kind: record.kind,
        ts: record.ts,
        ingested_at: this.clock.now(),
        payload: record.payload,
      });
      if (!ok) return { replayed, stoppedAt: record.queueKey };
      await this.store.delete(record.queueKey);
      replayed += 1;
    }
    return { replayed, stoppedAt: null };
  }
}
