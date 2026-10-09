// Offline event-queue skeleton — the load-bearing piece (02 §2 law 9,
// EXECUTION.md Part IV never-cut). The three hard-mode fields are fixed here:
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

const DEVICE_UUID_STORAGE_KEY = "eudaimonia:device-uuid";

/**
 * The device idempotency key: generated once via crypto.randomUUID, stored
 * in localStorage, and reused forever — it rides every queued event.
 */
export function deviceUUID(
  storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage,
): string {
  const existing = storage.getItem(DEVICE_UUID_STORAGE_KEY);
  if (existing !== null) return existing;
  const created = crypto.randomUUID();
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

interface StoredRecord extends OutboxRecord {
  /** autoIncrement primary key; preserves insertion order in getAll. */
  seq: number;
}

/** IndexedDB store via the raw API — no deps; persists across force-stops. */
export function createIdbOutboxStore(name = "eudaimonia-outbox"): OutboxStore {
  let dbPromise: Promise<IDBDatabase> | null = null;

  const open = (): Promise<IDBDatabase> => {
    if (dbPromise === null) {
      dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore("outbox", {
            keyPath: "seq",
            autoIncrement: true,
          });
          store.createIndex("queueKey", "queueKey", { unique: true });
        };
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          reject(request.error ?? new Error(`indexedDB: cannot open "${name}"`));
        };
      });
    }
    return dbPromise;
  };

  const asPromise = <T,>(request: IDBRequest<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error("indexedDB: request failed"));
      };
    });
  };

  return {
    async get(queueKey) {
      const db = await open();
      const store = db.transaction("outbox", "readonly").objectStore("outbox");
      return await asPromise(store.index("queueKey").get(queueKey) as IDBRequest<StoredRecord | undefined>);
    },
    async getAll() {
      const db = await open();
      const store = db.transaction("outbox", "readonly").objectStore("outbox");
      const records = await asPromise(store.getAll() as IDBRequest<StoredRecord[]>);
      return records.sort((a, b) => a.seq - b.seq);
    },
    async put(record) {
      const db = await open();
      const store = db.transaction("outbox", "readwrite").objectStore("outbox");
      await asPromise(store.add(record));
    },
    async delete(queueKey) {
      const db = await open();
      const store = db.transaction("outbox", "readwrite").objectStore("outbox");
      const found = await asPromise(store.index("queueKey").get(queueKey) as IDBRequest<StoredRecord | undefined>);
      if (found !== undefined) {
        await asPromise(store.delete(found.seq));
      }
    },
  };
}

export const systemClock: OutboxClock = { now: () => Date.now() };

/** Stub-level endpoint; 404s until P2 wires the ingest route. */
export const HABIT_TAP_ENDPOINT = "/api/events/habit_tap";

/** POSTs the law-9 body shape; network failures resolve false, never throw. */
export function fetchTransport(
  url: string,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Transport {
  return {
    async post(body) {
      try {
        const response = await fetchFn(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        return response.status >= 200 && response.status < 300;
      } catch {
        return false; // offline — the queue exists exactly for this
      }
    },
  };
}

export class Outbox {
  private readonly store: OutboxStore;
  private readonly clock: OutboxClock;
  private readonly deviceKey: string;

  constructor(options: OutboxOptions) {
    this.store = options.store;
    this.clock = options.clock;
    this.deviceKey = options.deviceKey ?? deviceUUID();
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

let appInstance: Outbox | null = null;

/** The app singleton: IndexedDB-backed, system clock, persisted device UUID. */
export function appOutbox(): Outbox {
  if (appInstance === null) {
    appInstance = new Outbox({
      store: createIdbOutboxStore(),
      clock: systemClock,
      deviceKey: deviceUUID(),
    });
  }
  return appInstance;
}

/** Replay the outbox whenever the browser fires `online`. */
export function replayOnReconnect(
  outbox: Outbox,
  transport: Transport,
  target: EventTarget = window,
): () => void {
  const handler = (): void => {
    void outbox.replay(transport);
  };
  target.addEventListener("online", handler);
  return () => {
    target.removeEventListener("online", handler);
  };
}
