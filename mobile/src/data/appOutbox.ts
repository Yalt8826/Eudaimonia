// The app outbox singleton — the M3 port of client/src/sw/queue.ts
// appOutbox(). The ONLY file that touches the native modules: expo-sqlite
// (storage), expo-crypto (the UUIDv4 generator), expo-network and
// react-native AppState (the replay triggers). Everything they feed —
// the queue, the store SQL, the transport, the scheduler — is dependency-
// injected and measured in jest without any native module.

import * as Crypto from "expo-crypto";
import * as Network from "expo-network";
import * as SQLite from "expo-sqlite";
import { AppState } from "react-native";

import { fetchTransport, taskTransport } from "./api";
import {
  Outbox,
  deviceUUID,
  systemClock,
  type KeyValueStore,
  type OutboxRecord,
  type ReplayResult,
} from "./queue";
import {
  createSyncScheduler,
  replayOnForeground,
  replayOnReconnect,
} from "./outboxSync";
import {
  createSqliteKeyValue,
  createSqliteOutboxStore,
  type SqliteExecutor,
  type SqliteParam,
} from "./sqliteOutbox";

export interface AppOutbox {
  outbox: Outbox;
  /** Durable key-value flags (the drop-reason-once rule, T2.2). */
  kv: KeyValueStore;
  /** The serialized sync funnel every trigger (and the wake screen) uses. */
  sync(): Promise<ReplayResult>;
  /** Events not yet accepted by the server, in enqueue order. The routine
      day view (T2.7) overlays these so a just-made tick shows before the
      drain — the same getter the task queue exposes, on the same store. */
  pending(): Promise<OutboxRecord[]>;
}

let instance: AppOutbox | null = null;

/** Bind expo-sqlite's sync surface to the store's executor interface. */
function expoExecutor(db: SQLite.SQLiteDatabase): SqliteExecutor {
  return {
    exec: (sql: string) => {
      db.execSync(sql);
    },
    run: (sql: string, params: SqliteParam[]) => db.runSync(sql, params),
    getAll: <T>(sql: string, params: SqliteParam[]) => db.getAllSync<T>(sql, params),
    getFirst: <T>(sql: string, params: SqliteParam[]) => db.getFirstSync<T>(sql, params),
  };
}

/**
 * The app singleton: SQLite-backed (persists across force-stops — the P2
 * exit test's storage), system clock, device UUID minted once into the
 * same database file under the web client's localStorage key.
 */
export function appOutbox(): AppOutbox {
  if (instance === null) {
    const db = SQLite.openDatabaseSync("eudaimonia-outbox.db");
    const exec = expoExecutor(db);
    const kv: KeyValueStore = createSqliteKeyValue(exec);
    const store = createSqliteOutboxStore(exec);
    const deviceKey = deviceUUID(kv, () => Crypto.randomUUID());
    const outbox = new Outbox({
      store,
      clock: systemClock,
      deviceKey,
    });
    instance = {
      outbox,
      kv,
      sync: createSyncScheduler(outbox, fetchTransport()),
      pending: () => store.getAll(),
    };
  }
  return instance;
}

export interface TaskOutbox {
  outbox: Outbox;
  /** The last server copy of each task (local-first reads). */
  kv: KeyValueStore;
  sync(): Promise<ReplayResult>;
  /** Task writes not yet accepted by the server, in write order. */
  pending(): Promise<OutboxRecord[]>;
}

let taskInstance: TaskOutbox | null = null;

/**
 * The task pages' own queue, in its own database file. Task notes are
 * local-first: a write lands here and shows at once, and drains to the
 * server when it can. A SEPARATE queue on purpose — replay stops at the
 * first rejected event, and a task event must never be able to hold a
 * wake tap behind it (an older server rejects the task kinds outright).
 */
export function taskOutbox(): TaskOutbox {
  if (taskInstance === null) {
    const db = SQLite.openDatabaseSync("eudaimonia-tasks.db");
    const exec = expoExecutor(db);
    const kv: KeyValueStore = createSqliteKeyValue(exec);
    const store = createSqliteOutboxStore(exec);
    // the same device key as every other write from this install
    const deviceKey = deviceUUID(appOutbox().kv, () => Crypto.randomUUID());
    const outbox = new Outbox({ store, clock: systemClock, deviceKey });
    taskInstance = {
      outbox,
      kv,
      sync: createSyncScheduler(outbox, taskTransport()),
      pending: () => store.getAll(),
    };
  }
  return taskInstance;
}

/**
 * Install the replay triggers. The immediate sync is the port of the
 * browser firing `online` at page load, so a queue that survived a
 * force-stop drains on reopen without waiting for a network change.
 * Returns the uninstaller (root layout effect cleanup).
 */
export function installSyncTriggers(): () => void {
  const { sync: syncMain } = appOutbox();
  // both queues drain on the same triggers; the task queue never blocks
  // the main one (it runs after, and its failures are its own)
  const sync = async () => {
    const result = await syncMain();
    void taskOutbox()
      .sync()
      .catch(() => undefined);
    return result;
  };
  void sync();
  const offForeground = replayOnForeground(sync, AppState);
  const offReconnect = replayOnReconnect(sync, Network.addNetworkStateListener);
  return () => {
    offForeground();
    offReconnect();
  };
}
