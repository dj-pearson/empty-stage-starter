/**
 * The planner's try-bite strip (item 4): per kid, the try-bite foods on the
 * week in view, and how this month has gone with each.
 *
 * A food counts as a try bite on the plan when it sits in the kid's try_bite
 * slot, or is flagged is_try_bite and planned in any slot that week.
 * Exposures are the kid's logged outcomes on the plan from the first of the
 * month through today, counted by kidFit.buildResultIndex, so the numbers
 * match the fit chips everywhere else. Planned-but-future rows are not tries.
 *
 * Pure: no React, no Supabase.
 */

import type { Food, Kid, PlanEntry } from "@/types";
import { buildResultIndex, type KidFitResult } from "@/lib/kidFit";
import { addIsoDays } from "@/lib/date-utils";

export interface TryBiteItem {
  food: Food;
  /** Dates this week the food is planned for this kid, ascending. */
  plannedDates: string[];
  /** Logged offers this month (ate + tasted + refused). */
  tries: number;
  ate: number;
  tasted: number;
  refused: number;
  lastResult: KidFitResult | null;
}

export interface KidTryBites {
  kid: Kid;
  items: TryBiteItem[];
}

const dateKey = (value: unknown): string => (typeof value === "string" ? value.slice(0, 10) : "");

/** 'YYYY-MM-01' for the month `today` ('YYYY-MM-DD') falls in. */
export function monthStartOf(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

export function buildTryBiteStrip(
  planEntries: readonly PlanEntry[],
  kids: readonly Kid[],
  foodById: ReadonlyMap<string, Food>,
  weekStartIso: string,
  today: string,
): KidTryBites[] {
  const weekEnd = addIsoDays(weekStartIso, 6);
  const monthStart = monthStartOf(today);
  const tomorrow = addIsoDays(today, 1);
  const thisMonth = planEntries.filter((e) => {
    const d = dateKey(e.date);
    return d >= monthStart && d < tomorrow;
  });

  const out: KidTryBites[] = [];
  for (const kid of kids) {
    const planned = new Map<string, Set<string>>();
    for (const e of planEntries) {
      if (e.kid_id !== kid.id || !e.food_id) continue;
      const d = dateKey(e.date);
      if (d < weekStartIso || d > weekEnd) continue;
      const food = foodById.get(e.food_id);
      if (!food) continue;
      if (e.meal_slot !== "try_bite" && !food.is_try_bite) continue;
      const dates = planned.get(food.id) ?? new Set<string>();
      dates.add(d);
      planned.set(food.id, dates);
    }
    if (planned.size === 0) continue;

    const index = buildResultIndex(thisMonth, kid.id, tomorrow);
    const items: TryBiteItem[] = [];
    for (const [foodId, dates] of planned) {
      const food = foodById.get(foodId);
      if (!food) continue;
      const stats = index.get(foodId);
      items.push({
        food,
        plannedDates: [...dates].sort(),
        tries: stats?.tries ?? 0,
        ate: stats?.ate ?? 0,
        tasted: stats?.tasted ?? 0,
        refused: stats?.refused ?? 0,
        lastResult: stats?.lastResult ?? null,
      });
    }
    items.sort(
      (a, b) =>
        a.plannedDates[0].localeCompare(b.plannedDates[0]) || a.food.name.localeCompare(b.food.name),
    );
    out.push({ kid, items });
  }
  return out;
}

/** Food Tracker deep link for one food; the tracker shows the active kid. */
export function foodTrackerHref(foodId: string): string {
  return `/dashboard/food-tracker?food=${encodeURIComponent(foodId)}`;
}
