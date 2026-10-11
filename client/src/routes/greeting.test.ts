import { describe, expect, it } from "vitest";
import { DAILY_LINES, dailyLine, dateLabel, greetingFor } from "./greeting";

describe("the Plaza header's greeting", () => {
  const at = (hour: number): Date => new Date(2026, 9, 11, hour, 30);

  it("greets by the time of day", () => {
    expect(greetingFor(at(7))).toBe("Good morning, Yashas");
    expect(greetingFor(at(13))).toBe("Good afternoon, Yashas");
    expect(greetingFor(at(19))).toBe("Good evening, Yashas");
    expect(greetingFor(at(2))).toBe("Welcome back, Yashas");
  });

  it("covers every hour with no gap and no overlap", () => {
    for (let hour = 0; hour < 24; hour += 1) {
      expect(greetingFor(at(hour)), `hour ${hour}`).toMatch(/^(Good (morning|afternoon|evening)|Welcome back), /);
    }
  });

  it("writes the date in long form", () => {
    expect(dateLabel(new Date(2026, 9, 11))).toBe("Sunday, 11 October");
  });

  it("holds one line for a whole local day, then moves on", () => {
    const morning = dailyLine(new Date(2026, 9, 11, 0, 1));
    const night = dailyLine(new Date(2026, 9, 11, 23, 59));
    expect(night, "the line must not change during the day").toBe(morning);
    expect(dailyLine(new Date(2026, 9, 12, 9, 0))).not.toBe(morning);
  });

  it("cycles through every line and wraps", () => {
    const seen = new Set<string>();
    for (let i = 0; i < DAILY_LINES.length; i += 1) {
      seen.add(dailyLine(new Date(2026, 9, 11 + i)));
    }
    expect(seen.size, "every line gets its day").toBe(DAILY_LINES.length);
    expect(dailyLine(new Date(2026, 9, 11 + DAILY_LINES.length))).toBe(
      dailyLine(new Date(2026, 9, 11)),
    );
  });

  it("never returns undefined, including before the epoch", () => {
    for (const d of [new Date(1960, 0, 1), new Date(1969, 11, 31), new Date(2099, 5, 5)]) {
      expect(DAILY_LINES).toContain(dailyLine(d));
    }
  });
});
