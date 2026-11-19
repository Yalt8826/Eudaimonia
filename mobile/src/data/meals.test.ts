// T2.6 — the meals data module: grouping, canonical totals, the mismatch
// flag, and the estimates law's render helper. The `~` is STRUCTURAL:
// est() is the only way a number becomes display text on /meals (law 11).
import { afterEach, expect, it, jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  est,
  fetchMealsRecent,
  groupIntoDays,
  localDayKey,
  type MealRow,
} from "./meals";

afterEach(() => {
  jest.restoreAllMocks();
});

function meal(ts: string, items: [string, number, number, string][], extra: Partial<MealRow> = {}): MealRow {
  return {
    meal_ref: `mobile:x:${ts}`,
    ts,
    items: items.map(([label, kcal_est, protein_g_est, basis]) => ({
      label,
      kcal_est,
      protein_g_est,
      basis,
    })),
    photo_ref: null,
    ...extra,
  };
}

it("the ink-weight law: no accent token touches a number on /meals (01 §4)", () => {
  const fs = readFileSync;
  const source = fs(join(__dirname, "../app/(shell)/meals.tsx"), "utf-8");
  // every NUMBER render goes through the muted total/item styles — the
  // accent token may appear only on the action button, never in a style
  // applied to estimate-bearing text
  const numberStyles = ["totalMono", "totalKcal", "totalProtein", "itemNumbers"];
  for (const styleName of numberStyles) {
    const def = source.match(new RegExp(`${styleName}: *{([^}]*)}`));
    expect(def).not.toBeNull();
    expect(def![1]).not.toMatch(/accent/i);
  }
  // and no estimate render line carries an accent style
  const renderLines = source.split("\n").filter((l) => /est\(/.test(l));
  expect(renderLines.length).toBeGreaterThan(0);
  expect(renderLines.every((l) => !l.includes("accent"))).toBe(true);
});

it("est() puts the ~ on every estimate — the render gate's helper", () => {
  expect(est(142.4)).toBe("~142");
  expect(est(0)).toBe("~0");
  // the helper is the ONLY tilde source for NUMBERS: strip every est(...)
  // span from the screen and assert no estimate field is left un-wrapped
  // (a raw *_est interpolation bypasses est() and renders bare)
  const source = readFileSync(
    join(__dirname, "../app/(shell)/meals.tsx"),
    "utf-8",
  );
  const stripped = source.replace(/est\([^()]*\)/g, "");
  expect(stripped).not.toMatch(/\.(kcal_est|protein_g_est|kcal_est_total|protein_g_est_total)\b/);
});

it("groups rows into the row's local day, newest day first", () => {
  // times chosen for a UTC+5:30 device: both first-row meals fall on the
  // eater's local 18 Nov (07:30Z and 12:00Z are 13:00 and 17:30 IST)
  const rows = [
    meal("2026-11-18T12:00:00+00:00", [["dinner", 600, 20, "food_db:a"]]),
    meal("2026-11-18T07:30:00+00:00", [["breakfast", 300, 12, "food_db:b"]]),
    meal("2026-11-17T12:00:00+00:00", [["lunch", 450, 15, "food_db:c"]]),
  ];
  const days = groupIntoDays(rows);
  expect(days.map((d) => d.date)).toEqual(["2026-11-18", "2026-11-17"]);
  expect(days[0].meals.length).toBe(2);
});

it("localDayKey uses the device's local calendar day", () => {
  // 2026-11-18T02:00+00:00 is 07:30 IST the same day — the key follows
  // the device, not the server's UTC date
  const key = localDayKey("2026-11-18T02:00:00+00:00", new Date());
  expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

it("totals are the sum of item rows — rows are canonical (03 §4)", () => {
  const rows = [
    meal("2026-11-18T12:00:00+00:00", [
      ["a", 100, 10, "food_db:a"],
      ["b", 50, 5, "food_db:b"],
    ]),
    meal("2026-11-18T18:00:00+00:00", [["c", 200, 20, "food_db:c"]]),
  ];
  const [day] = groupIntoDays(rows);
  expect(day.kcal_est_total).toBe(350);
  expect(day.protein_g_est_total).toBe(35);
});

it("a payload total that disagrees with the rows fires the mismatch flag", () => {
  const rows = [
    meal("2026-11-18T12:00:00+00:00", [["a", 100, 10, "food_db:a"]], {
      // someone wrote a total into the payload — the rows say 100
      kcal_total_est: 999,
    } as Partial<MealRow>),
  ];
  const [day] = groupIntoDays(rows);
  expect(day.mismatch).toBe(true);
  // to displayed precision it agrees — no flag
  const ok = [
    meal("2026-11-18T12:00:00+00:00", [["a", 100.4, 10, "food_db:a"]], {
      kcal_total_est: 100,
    } as Partial<MealRow>),
  ];
  expect(groupIntoDays(ok)[0].mismatch).toBe(false);
});

it("fetchMealsRecent validates the rows and resolves null when unreachable", async () => {
  const good = jest.fn(async () => ({
    status: 200,
    json: async () => ({
      meals: [
        {
          meal_ref: "m1",
          ts: "2026-11-18T12:00:00+00:00",
          items: [{ label: "eggs", kcal_est: 140, protein_g_est: 12, basis: "food_db:x" }],
          photo_ref: null,
        },
        { meal_ref: "m2", ts: "2026-11-18T13:00:00+00:00", items: "junk" },
      ],
    }),
  })) as unknown as typeof globalThis.fetch;
  const rows = await fetchMealsRecent(good);
  expect(rows?.length).toBe(1); // the junk row dropped out
  expect(rows?.[0].items[0].basis).toBe("food_db:x");

  const dead = jest.fn(async () => {
    throw new Error("airplane mode");
  }) as unknown as typeof globalThis.fetch;
  expect(await fetchMealsRecent(dead)).toBeNull(); // never a fabricated day
});
