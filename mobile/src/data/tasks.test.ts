import { describe, expect, it } from "@jest/globals";

import { applyLocal, emptyTask, formatElapsed, formatMinutes, newTaskId, taskHint } from "./tasks";
import { subjectOf } from "../plaza/planModel";

const TARGETS = ["GRE", "dMAT", "Deep Learning", "Market Momentum", "Kerdos"];

describe("subjectOf — which thread a block's notes go to", () => {
  it("a block naming a target is that target", () => {
    expect(subjectOf("GRE deep work (~3h)", TARGETS)).toBe("GRE");
    expect(subjectOf("dMAT (45m)", TARGETS)).toBe("dMAT");
    expect(subjectOf("Deep Learning (~1.25h)", TARGETS)).toBe("Deep Learning");
  });
  it("otherwise the title without its duration", () => {
    expect(subjectOf("Gym", TARGETS)).toBe("Gym");
    expect(subjectOf("Flex slot", TARGETS)).toBe("Flex slot");
    expect(subjectOf("Reading (30m)", TARGETS)).toBe("Reading");
  });
  it("matches whole words only", () => {
    expect(subjectOf("Progress review", ["GRE"])).toBe("Progress review");
  });
});

describe("applyLocal — writes show before the server answers", () => {
  const t0 = "2026-11-01T10:00:00.000Z";
  it("adds, checks and removes items", () => {
    let d = emptyTask("GRE");
    d = applyLocal(d, "task_item_added", { subject: "GRE", item_id: "aaaaaaaa1", type: "subtask", text: "set 2" }, t0);
    d = applyLocal(d, "task_item_added", { subject: "GRE", item_id: "aaaaaaaa2", type: "next", text: "RC 4" }, t0);
    expect(d.subtasks.map((s) => s.text)).toEqual(["set 2"]);
    expect(d.next.map((n) => n.text)).toEqual(["RC 4"]);
    d = applyLocal(d, "task_item_checked", { item_id: "aaaaaaaa1", done: true }, t0);
    d = applyLocal(d, "task_item_checked", { item_id: "aaaaaaaa2", done: true }, t0);
    expect(d.subtasks[0].done).toBe(true);
    expect(d.next).toEqual([]);
    d = applyLocal(d, "task_item_removed", { item_id: "aaaaaaaa1" }, t0);
    expect(d.subtasks).toEqual([]);
  });
  it("a started then ended session lands in history with its minutes", () => {
    let d = applyLocal(emptyTask("GRE"), "task_session_started", { subject: "GRE", session_id: "ssssssss1" }, t0);
    expect(d.running?.session_id).toBe("ssssssss1");
    d = applyLocal(d, "task_session_ended", { session_id: "ssssssss1", note: "20 qs" }, "2026-11-01T10:45:00.000Z");
    expect(d.running).toBeNull();
    expect(d.history[0]).toMatchObject({ minutes: 45, text: "20 qs" });
    expect(d.minutes_7d).toBe(45);
  });
});

describe("formatting", () => {
  it("minutes and the stopwatch", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(125)).toBe("2h 05m");
    expect(formatElapsed(83_000)).toBe("1:23");
    expect(formatElapsed(3_723_000)).toBe("1:02:03");
  });
  it("ids fit the server's 8-64 no-colon rule", () => {
    const id = newTaskId();
    expect(id.length).toBeGreaterThanOrEqual(8);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id).not.toContain(":");
  });
  it("the card hint: running timer, next note, open count", () => {
    const now = new Date("2026-11-01T10:30:00.000Z");
    expect(taskHint(undefined, now)).toBeNull();
    expect(
      taskHint(
        {
          subject: "GRE",
          next_first: "RC 4",
          next_count: 1,
          open_subtasks: 2,
          running: { session_id: "x", started_at: "2026-11-01T10:07:00.000Z" },
          minutes_7d: 0,
        },
        now,
      ),
    ).toBe("• 23m running · next: RC 4 · 2 open");
  });
});
