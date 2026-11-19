// The meals read model (T2.6): the meal_logged rows, grouped into the
// client's LOCAL day cards. Rows are canonical (03 §4): totals are the
// sum of item rows at render, and a payload that also carries a total is
// CROSS-CHECKED — a mismatch fires the flag, it is never smoothed.
//
// The estimates law renders here (02 §2 law 11): every number derived
// from an *_est field goes through est() — the `~` is applied at render
// from the payload shape, never hand-typed in a screen.
import { apiUrl } from "./api";

export interface MealItem {
  label: string;
  kcal_est: number;
  protein_g_est: number;
  basis: string;
}

export interface MealRow {
  meal_ref: string;
  ts: string;
  items: MealItem[];
  photo_ref: string | null;
}

export interface DayCard {
  date: string;
  meals: MealRow[];
  /** Sum of item rows — canonical. */
  kcal_est_total: number;
  protein_g_est_total: number;
  /** A payload-carried total that disagrees with the row sum, rounded to
      the displayed precision — flagged, never smoothed. */
  mismatch: boolean;
}

export const MEALS_RECENT_ENDPOINT = "/api/meals/recent";

export interface WeightPoint {
  date: string;
  weight_kg: number;
  waist_cm: number | null;
  notes: string | null;
}

export const WEIGHTS_RECENT_ENDPOINT = "/api/weights/recent";

/** The MEASURED series (no estimate mark — law 11's other direction). */
export async function fetchWeightsRecent(
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<WeightPoint[] | null> {
  try {
    const response = await fetchFn(apiUrl(WEIGHTS_RECENT_ENDPOINT));
    if (!(response.status >= 200 && response.status < 300)) return null;
    const body: unknown = await response.json();
    const weights = (body as { weights?: unknown } | null)?.weights;
    if (!Array.isArray(weights)) return null;
    const out: WeightPoint[] = [];
    for (const raw of weights as Record<string, unknown>[]) {
      if (typeof raw.date === "string" && typeof raw.weight_kg === "number") {
        out.push({
          date: raw.date,
          weight_kg: raw.weight_kg,
          waist_cm: typeof raw.waist_cm === "number" ? raw.waist_cm : null,
          notes: typeof raw.notes === "string" ? raw.notes : null,
        });
      }
    }
    return out;
  } catch {
    return null;
  }
}

/** The estimates law's render helper: an *_est-derived number NEVER
    renders without its ~ (law 11). Screens call this; they do not
    sprinkle "~" strings. */
export function est(value: number): string {
  return `~${Math.round(value)}`;
}

function sum(items: MealItem[], field: "kcal_est" | "protein_g_est"): number {
  return items.reduce((acc, i) => acc + (typeof i[field] === "number" ? i[field] : 0), 0);
}

/** Local calendar day key (the meals day is the eater's day, not the
    server's UTC day and not the plan's 4am rollover). */
export function localDayKey(tsIso: string, now: Date): string {
  const d = new Date(tsIso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  void now;
  return `${y}-${m}-${day}`;
}

/** Rows → day cards, newest day first. A payload total (when someone
    ever writes one) is checked against the row sum at displayed
    precision; a disagreement is data, flagged on the card. */
export function groupIntoDays(meals: readonly MealRow[]): DayCard[] {
  const byDay = new Map<string, MealRow[]>();
  for (const meal of meals) {
    const key = localDayKey(meal.ts, new Date());
    const list = byDay.get(key);
    if (list) list.push(meal);
    else byDay.set(key, [meal]);
  }
  const cards: DayCard[] = [];
  for (const [date, dayMeals] of byDay) {
    const allItems = dayMeals.flatMap((m) => m.items);
    const kcal = sum(allItems, "kcal_est");
    const protein = sum(allItems, "protein_g_est");
    const mismatch = dayMeals.some((m) => {
      const payload = m as MealRow & { kcal_total_est?: unknown };
      const claimed = payload.kcal_total_est;
      return (
        typeof claimed === "number" && Math.round(claimed) !== Math.round(kcal)
      );
    });
    cards.push({
      date,
      meals: dayMeals,
      kcal_est_total: kcal,
      protein_g_est_total: protein,
      mismatch,
    });
  }
  return cards.sort((a, b) => (a.date < b.date ? 1 : -1));
}

interface ServerMeal {
  meal_ref?: unknown;
  ts?: unknown;
  items?: unknown;
  photo_ref?: unknown;
}

/** The server's recent rows, validated. Unreachable resolves null —
    never a fabricated empty day (law 7). */
export async function fetchMealsRecent(
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<MealRow[] | null> {
  try {
    const response = await fetchFn(apiUrl(MEALS_RECENT_ENDPOINT));
    if (!(response.status >= 200 && response.status < 300)) return null;
    const body: unknown = await response.json();
    const meals = (body as { meals?: unknown } | null)?.meals;
    if (!Array.isArray(meals)) return null;
    const out: MealRow[] = [];
    for (const raw of meals as ServerMeal[]) {
      if (typeof raw.meal_ref !== "string" || typeof raw.ts !== "string") continue;
      if (!Array.isArray(raw.items)) continue;
      const items: MealItem[] = [];
      for (const item of raw.items) {
        const i = item as Record<string, unknown>;
        if (
          typeof i.label === "string" &&
          typeof i.kcal_est === "number" &&
          typeof i.protein_g_est === "number" &&
          typeof i.basis === "string"
        ) {
          items.push({
            label: i.label,
            kcal_est: i.kcal_est,
            protein_g_est: i.protein_g_est,
            basis: i.basis,
          });
        }
      }
      out.push({
        meal_ref: raw.meal_ref,
        ts: raw.ts,
        items,
        photo_ref: typeof raw.photo_ref === "string" ? raw.photo_ref : null,
      });
    }
    return out;
  } catch {
    return null;
  }
}
