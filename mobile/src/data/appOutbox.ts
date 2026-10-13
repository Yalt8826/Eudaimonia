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

import { HABIT_TAP_ENDPOINT, apiUrl, fetchTransport } from "./api";
import {
  Outbox,
  deviceUUID,
  systemClock,
  type KeyValueStore,
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
  /** The serialized sync funnel every trigger (and the wake screen) uses. */
  sync(): Promise<ReplayResult>;
  /** Where events go — exported for the wake screen's wiring and logs. */
  endpoint: string;
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
    const endpoint = apiUrl(HABIT_TAP_ENDPOINT);
    instance = {
      outbox,
      endpoint,
      sync: createSyncScheduler(outbox, fetchTransport(endpoint)),
    };
  }
  return instance;
}

/**
 * Install the replay triggers. The immediate sync is the port of the
 * browser firing `online` at page load, so a queue that survived a
 * force-stop drains on reopen without waiting for a network change.
 * Returns the uninstaller (root layout effect cleanup).
 */
export function installSyncTriggers(): () => void {
  const { sync } = appOutbox();
  void sync();
  const offForeground = replayOnForeground(sync, AppState);
  const offReconnect = replayOnReconnect(sync, Network.addNetworkStateListener);
  return () => {
    offForeground();
    offReconnect();
  };
}
