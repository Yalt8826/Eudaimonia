// T3.1 — the reading screen's read model: queue validation, the
// evidence-driven banner, and writes that ride the outbox. The banner is
// the honesty probe: paused renders ONLY from recorded job_paused
// evidence (law 5), never from staleness, never hardcoded.
import { afterEach, expect, it, jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  fetchReadingQueue,
  validArxivId,
  writeRating,
  writeReadingStatus,
} from "./reading";

jest.mock("./appOutbox", () => {
  const records: Record<string, unknown>[] = [];
  const enqueue = jest.fn((kind: string, payload: Record<string, unknown>) => {
    records.push({
      queueKey: `device:${kind}:${records.length}`,
      idempotency_key: "device",
      kind,
      ts: 1000 + records.length,
      payload,
    });
    return Promise.resolve(records[records.length - 1]);
  });
  const sync = jest.fn(async () => ({ replayed: 0, stoppedAt: null }));
  const kvStore = new Map<string, string>();
  const box = {
    outbox: { enqueue },
    sync,
    kv: {
      getItem: (k: string) => (kvStore.has(k) ? kvStore.get(k) : null),
      setItem: (k: string, v: string) => void kvStore.set(k, v),
    },
    pending: () => Promise.resolve([...records]),
  };
  return { appOutbox: (): typeof box => box, __readingMocks: { enqueue, sync, records } };
});

const { __readingMocks } = jest.requireMock("./appOutbox") as {
  __readingMocks: { enqueue: { mockClear(): void }; sync: { mockClear(): void }; records: Record<string, unknown>[] };
};
const { enqueue, sync, records } = __readingMocks;

afterEach(() => {
  records.length = 0;
  enqueue.mockClear();
  sync.mockClear();
  jest.restoreAllMocks();
});

it("the import assert: writes ride the outbox, no queue of its own", () => {
  const source = readFileSync(join(__dirname, "reading.ts"), "utf-8");
  expect(source).toContain('from "./appOutbox"');
  expect(source).not.toMatch(/new Outbox|createSqliteOutboxStore|openDatabaseSync/);
});

it("validArxivId mirrors the server's shape gate", () => {
  expect(validArxivId("2608.07454")).toBe(true);
  expect(validArxivId("cs/0301012")).toBe(true);
  expect(validArxivId("has space")).toBe(false);
  expect(validArxivId("with:colon")).toBe(false);
  expect(validArxivId("ab")).toBe(false);
});

it("status and rating writes enqueue the registered kinds and attempt the drain", async () => {
  await writeReadingStatus("2608.07454", "skimmed");
  expect(enqueue).toHaveBeenCalledWith("reading_status", { arxiv_id: "2608.07454", status: "skimmed" });
  await writeRating("2608.07454", 4);
  expect(enqueue).toHaveBeenCalledWith("rating_staged", { arxiv_id: "2608.07454", rating: 4 });
  expect(sync).toHaveBeenCalledTimes(2);
});

it("junk ids and out-of-range ratings never reach the queue", async () => {
  await writeReadingStatus("has space", "new");
  await writeRating("2608.07454", 6);
  expect(enqueue).not.toHaveBeenCalled();
  expect(records.length).toBe(0);
});

it("fetchReadingQueue parses the banner and rows", async () => {
  const fetchMock = jest.fn(async () => ({
    status: 200,
    json: async () => ({
      banner: { paused: true, since: "2026-10-09T00:00:00+00:00", actor: "human" },
      items: [
        {
          arxiv_id: "2608.07454",
          title: "SynthEx",
          edition_date: "2026-08-10",
          status: "new",
          rating: null,
          staged_ts: null,
          ts: "2026-08-10T00:00:00+00:00",
        },
        { arxiv_id: "bad" },
      ],
    }),
  })) as unknown as typeof globalThis.fetch;
  const q = await fetchReadingQueue(fetchMock);
  expect(q?.banner.paused).toBe(true);
  expect(q?.banner.since).toBe("2026-10-09T00:00:00+00:00");
  expect(q?.items.length).toBe(1); // the malformed row dropped
});

it("unreachable resolves null — never a fabricated queue", async () => {
  const fetchMock = jest.fn(async () => {
    throw new Error("offline");
  }) as unknown as typeof globalThis.fetch;
  expect(await fetchReadingQueue(fetchMock)).toBeNull();
});
