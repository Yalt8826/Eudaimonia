// T3.6 — the projects data model: parked renders muted (the screen's
// token assert lives in the render test), status writes ride the outbox,
// and the structural gate holds (board health goes through the tenancy
// engine — no local branch anywhere in the client either).
import { afterEach, expect, it, jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fetchProjects, hasBoardHealth, writeProjectStatus, type ProjectRow } from "./projects";

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
  return { appOutbox: (): typeof box => box, __projectMocks: { enqueue, sync, records } };
});

const { __projectMocks } = jest.requireMock("./appOutbox") as {
  __projectMocks: {
    enqueue: { mockClear(): void };
    sync: { mockClear(): void };
    records: Record<string, unknown>[];
  };
};
const { enqueue, sync, records } = __projectMocks;

afterEach(() => {
  records.length = 0;
  enqueue.mockClear();
  sync.mockClear();
});

function row(overrides: Partial<ProjectRow>): ProjectRow {
  return {
    project_id: 1,
    name: "Kerdos",
    status: "active",
    board_glob: null,
    parked_since: null,
    last_activity: null,
    linked_work: { open: 0, resolved: 0 },
    board_health: null,
    ...overrides,
  };
}

it("fetchProjects parses the board rows", async () => {
  const fetchMock = jest.fn(async () => ({
    status: 200,
    json: async () => ({
      projects: [
        {
          project_id: 1,
          name: "Market Momentum",
          status: "active",
          board_glob: null,
          parked_since: null,
          last_activity: null,
          linked_work: { open: 0, resolved: 0 },
          board_health: null,
        },
        { project_id: "bad" },
      ],
    }),
  })) as unknown as typeof globalThis.fetch;
  const rows = await fetchProjects(fetchMock);
  expect(rows?.length).toBe(1);
  expect(rows?.[0].name).toBe("Market Momentum");
});

it("unreachable resolves null — never a fabricated board", async () => {
  const dead = jest.fn(async () => {
    throw new TypeError("offline");
  }) as unknown as typeof globalThis.fetch;
  expect(await fetchProjects(dead)).toBeNull();
});

it("hasBoardHealth is the explicit omission: unlinked projects show no line", () => {
  expect(hasBoardHealth(row({ board_health: null }))).toBe(false);
  expect(hasBoardHealth(row({ board_health: { state: "alive" } }))).toBe(true);
});

it("status writes enqueue project_status through the outbox", async () => {
  await writeProjectStatus(2, "parked");
  expect(enqueue).toHaveBeenCalledWith("project_status", { project_id: 2, status: "parked" });
  expect(records[0].payload).toEqual({ project_id: 2, status: "parked" });
  await writeProjectStatus(2, "active");
  expect(enqueue).toHaveBeenCalledWith("project_status", { project_id: 2, status: "active" });
  expect(records.length).toBe(2);
});

it("junk project ids never reach the queue", async () => {
  await writeProjectStatus(0, "parked");
  await writeProjectStatus(Number.NaN, "active");
  expect(records.length).toBe(0);
});

it("the structural gate: the client has no local tenancy branch either", () => {
  const source = readFileSync(join(__dirname, "projects.ts"), "utf-8");
  const screen = readFileSync(join(__dirname, "../app/(shell)/projects/index.tsx"), "utf-8");
  // board health renders what the server's engine said — the client
  // computes no dormancy of its own (the phase's structural gate)
  for (const text of [source, screen]) {
    expect(text).not.toMatch(/days_silent|BEHAVIORAL_SILENCE|demoted/);
  }
});
