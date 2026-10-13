// The expo-sqlite OutboxStore — the M3 replacement for the web client's
// IndexedDB store (client/src/sw/queue.ts createIdbOutboxStore). Same
// semantics, different engine:
//   - `seq INTEGER PRIMARY KEY AUTOINCREMENT` preserves enqueue order in
//     getAll, exactly as the IDB store's autoIncrement keyPath did;
//   - `queueKey TEXT NOT NULL UNIQUE` backs the skip guard at the storage
//     level, exactly as the IDB unique index did;
//   - the file persists across force-stops, which is what the P2 exit test
//     proves (airplane tap → kill → reopen → exactly one event).
//
// The store speaks to SQLite through SqliteExecutor — a four-method
// interface matching expo-sqlite's sync surface (execSync/runSync/
// getAllSync/getFirstSync). The binding lives in appOutbox.ts; jest tests
// bind the SAME SQL to node:sqlite, so ordering, uniqueness and
// persistence are measured against a real SQLite engine, not a mock.

import type { KeyValueStore, OutboxRecord, OutboxStore } from "./queue";

export type SqliteParam = string | number | null;

export interface SqliteExecutor {
  /** DDL / multi-statement (expo-sqlite execSync). */
  exec(sql: string): void;
  /** Bound write; returns the SQLiteRunResult changes count. */
  run(sql: string, params: SqliteParam[]): { changes: number };
  /** Bound read of all rows. */
  getAll<T = SqliteRow>(sql: string, params: SqliteParam[]): T[];
  /** Bound read of at most one row (null when absent). */
  getFirst<T = SqliteRow>(sql: string, params: SqliteParam[]): T | null;
}

interface SqliteRow {
  seq: number;
  queueKey: string;
  idempotency_key: string;
  kind: string;
  ts: number;
  payload: string;
}

export const OUTBOX_DDL = `
CREATE TABLE IF NOT EXISTS outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  queueKey TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  ts INTEGER NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const COLUMNS = "queueKey, idempotency_key, kind, ts, payload";

function toRecord(row: SqliteRow): OutboxRecord {
  return {
    queueKey: row.queueKey,
    idempotency_key: row.idempotency_key,
    kind: row.kind,
    ts: row.ts,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
  };
}

/** The outbox table as an OutboxStore. The Outbox is the only writer. */
export function createSqliteOutboxStore(exec: SqliteExecutor): OutboxStore {
  exec.exec(OUTBOX_DDL);
  return {
    async get(queueKey) {
      const row = exec.getFirst(
        `SELECT seq, ${COLUMNS} FROM outbox WHERE queueKey = ?`,
        [queueKey],
      );
      return row === null ? undefined : toRecord(row);
    },
    async getAll() {
      const rows = exec.getAll(`SELECT seq, ${COLUMNS} FROM outbox ORDER BY seq`, []);
      return rows.map(toRecord);
    },
    async put(record) {
      // Plain INSERT, like the IDB store's .add(): a duplicate queueKey
      // rejects rather than silently overwriting — the skip guard in
      // Outbox.enqueue keeps duplicates out before this is reached.
      exec.run(
        `INSERT INTO outbox (${COLUMNS}) VALUES (?, ?, ?, ?, ?)`,
        [
          record.queueKey,
          record.idempotency_key,
          record.kind,
          record.ts,
          JSON.stringify(record.payload),
        ],
      );
    },
    async delete(queueKey) {
      exec.run(`DELETE FROM outbox WHERE queueKey = ?`, [queueKey]);
    },
  };
}

/** The kv table as the device-UUID storage (localStorage's replacement). */
export function createSqliteKeyValue(exec: SqliteExecutor): KeyValueStore {
  exec.exec(OUTBOX_DDL);
  return {
    getItem(key) {
      const row = exec.getFirst<{ value: string }>(
        `SELECT value FROM kv WHERE key = ?`,
        [key],
      );
      return row === null ? null : row.value;
    },
    setItem(key, value) {
      // INSERT OR REPLACE: setItem over an existing key is an update, the
      // one place overwriting is correct (the UUID is only written once).
      exec.run(`INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)`, [key, value]);
    },
  };
}
