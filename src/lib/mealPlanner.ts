import { Food, Kid, PlanEntry, MealSlot } from "@/types";
import { isAllergenSafeFor } from "./allergens";
import { resolveFood, type EffectiveFood } from "./effectiveFood";
import { generateId } from "./utils";
import { toISODate, addIsoDays } from "./date-utils";
import { acceptanceWeight, buildResultIndex, getKidFoodFit, type ResultIndex } from "./kidFit";

const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack1", "snack2"];
const MAIN_MEALS: ReadonlySet<MealSlot> = new Set(["breakfast", "lunch", "dinner"]);
const SNACK_SLOTS: ReadonlySet<MealSlot> = new Set(["snack1", "snack2"]);
/** A food may appear in a slot once in any run of this many days. */
const REPEAT_WINDOW_DAYS = 3;

type QuickBuildKid = Pick<Kid, "id" | "allergens"> &
  Partial<Pick<Kid, "disliked_foods" | "always_eats_foods">>;

/** Weighted random pick; weights must be positive. */
function weightedPick<T>(items: readonly T[], weight: (item: T) => number, random: () => number): T {
  let total = 0;
  const weights = items.map((item) => {
    const w = Math.max(0, weight(item));
    total += w;
    return w;
  });
  if (total <= 0) return items[Math.floor(random() * items.length)];
  let r = random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Build a week of meals for one kid.
 *
 * US-715: takes the week to build and returns entries WITHOUT ids. The ids it
 * used to invent were never real -- the caller replaced local state with them
 * and nothing was ever inserted, so the plan was gone on reload and never
 * reached another device. The server assigns ids now, via addPlanEntries.
 *
 * Choosing, per kid:
 *   - Allergens and this kid's disliked_foods are never placed.
 *   - Main meals are anchored on a food the kid always eats or a safe food;
 *     always-eats foods get double weight.
 *   - Picks are weighted by this kid's own acceptance (ate > tasted > untried
 *     > refused). Other kids' history is ignored.
 *   - No food twice in the same slot within three days, counting both this
 *     kid's recent history and the picks made earlier in this build, and the
 *     two snacks on a day are different foods.
 *
 * Pure: `random` defaults to Math.random and can be injected for tests.
 */
export function buildWeekPlan(
  kid: QuickBuildKid,
  foods: Food[],
  history: PlanEntry[],
  startDate: Date = new Date(),
  random: () => number = Math.random,
): Omit<PlanEntry, "id">[] {
  const kidId = kid.id;
  const plan: Omit<PlanEntry, "id">[] = [];
  const days = 7;

  // `is_safe` is a household flag, so a food one sibling eats safely can carry
  // this child's allergen. Quick Build drops anything this child reacts to
  // before choosing, and says so when that leaves nothing to choose from.
  const servable = foods.filter(f => isAllergenSafeFor(kid, f));
  const allergenExcluded = servable.length < foods.length;

  const fitKid = {
    id: kid.id,
    allergens: kid.allergens,
    disliked_foods: kid.disliked_foods,
    always_eats_foods: kid.always_eats_foods,
  };
  const kidHistory = history
    .filter((p) => p.kid_id === kidId)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const results: ResultIndex = buildResultIndex(kidHistory, kidId);
  const fitOf = new Map(servable.map((f) => [f.id, getKidFoodFit(fitKid, f, results)]));

  const liked = servable.filter((f) => !fitOf.get(f.id)?.disliked);
  const dislikeExcluded = liked.length < servable.length;
  const alwaysEats = (f: Food) => Boolean(fitOf.get(f.id)?.alwaysEats);
  const anchors = liked.filter((f) => f.is_safe || alwaysEats(f));
  const safeFoods = liked.filter((f) => f.is_safe);
  const tryBites = liked.filter((f) => f.is_try_bite);

  if (anchors.length === 0) {
    throw new Error(
      allergenExcluded
        ? "Every safe food contains one of this child's allergens. Add a safe food without them first."
        : dislikeExcluded
          ? "Every safe food is on this child's dislike list. Add a safe food they like first."
          : "Please add some safe foods first!"
    );
  }

  if (tryBites.length === 0) {
    throw new Error(
      allergenExcluded
        ? "Every try bite food contains one of this child's allergens. Add a try bite without them first."
        : dislikeExcluded
          ? "Every try bite food is on this child's dislike list. Add a different try bite first."
          : "Please add some try bite foods first!"
    );
  }

  // US-818: step the ISO key, not a Date. setDate + toISOString shifted the
  // whole generated week for anyone west of Greenwich, and stepping a Date
  // across a DST boundary repeats or skips a calendar day.
  const startKey = toISODate(startDate);

  // slot -> date -> food ids placed there, seeded from this kid's history so
  // the first days of the week respect what was served just before it.
  const placed = new Map<MealSlot, Map<string, Set<string>>>();
  const place = (slot: MealSlot, date: string, foodId: string) => {
    let byDate = placed.get(slot);
    if (!byDate) placed.set(slot, (byDate = new Map()));
    let ids = byDate.get(date);
    if (!ids) byDate.set(date, (ids = new Set()));
    ids.add(foodId);
  };
  const earliestRelevant = addIsoDays(startKey, -(REPEAT_WINDOW_DAYS - 1));
  for (const p of kidHistory) {
    const d = String(p.date).slice(0, 10);
    if (d >= earliestRelevant && d < startKey && p.food_id) place(p.meal_slot, d, p.food_id);
  }
  const usedRecently = (slot: MealSlot, date: string): Set<string> => {
    const out = new Set<string>();
    const byDate = placed.get(slot);
    if (!byDate) return out;
    for (let back = 1; back < REPEAT_WINDOW_DAYS; back++) {
      for (const id of byDate.get(addIsoDays(date, -back)) ?? []) out.add(id);
    }
    return out;
  };

  const weightOf = (f: Food) =>
    acceptanceWeight(results.get(f.id)) * (alwaysEats(f) ? 2 : 1);

  for (let d = 0; d < days; d++) {
    const dateStr = addIsoDays(startKey, d);
    const snacksToday = new Set<string>();

    for (const slot of MEAL_SLOTS) {
      const pool = MAIN_MEALS.has(slot) ? anchors : safeFoods.length > 0 ? safeFoods : anchors;
      const recent = usedRecently(slot, dateStr);
      const fresh = pool.filter(
        (f) => !recent.has(f.id) && !(SNACK_SLOTS.has(slot) && snacksToday.has(f.id)),
      );
      // Relax the snack rule before the repeat rule, and only when the pantry
      // is too small to honour both.
      const candidates =
        fresh.length > 0
          ? fresh
          : pool.filter((f) => !recent.has(f.id)).length > 0
            ? pool.filter((f) => !recent.has(f.id))
            : pool;
      const pick = weightedPick(candidates, weightOf, random);
      place(slot, dateStr, pick.id);
      if (SNACK_SLOTS.has(slot)) snacksToday.add(pick.id);

      plan.push({
        kid_id: kidId,
        date: dateStr,
        meal_slot: slot,
        food_id: pick.id,
        result: null,
      });
    }

    // Try bite slot: rotate through the list so every try bite gets a turn.
    const tryBite = tryBites[d % tryBites.length];
    place("try_bite", dateStr, tryBite.id);
    plan.push({
      kid_id: kidId,
      date: dateStr,
      meal_slot: "try_bite",
      food_id: tryBite.id,
      result: null,
    });
  }

  return plan;
}

/**
 * An inclusive shopping window, as YYYY-MM-DD date keys.
 *
 * US-713: generation used to run over every plan entry the context held -- a
 * 120-day window -- so "sync from meal plan" put three months of dinners on a
 * single week's shopping list. The caller now names the days it is shopping
 * for.
 */
export interface ShoppingWindow {
  /** Inclusive first day, YYYY-MM-DD. */
  from: string;
  /** Inclusive last day, YYYY-MM-DD. */
  to: string;
}

/** Plan entry dates may carry a time; compare on the date key alone. */
const dateKey = (value: string): string => value.slice(0, 10);

export interface GeneratedGroceryRow {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  checked: boolean;
  category: Food["category"];
  aisle?: string;
  /** US-713: marks the row as regenerable, so a later sync can retire it. */
  auto_generated: true;
  /**
   * US-713: the first plan entry that put this food on the list. A row is
   * aggregated across every entry for the same food in the window, so this
   * names the earliest contributor rather than all of them -- enough to answer
   * "why is this on my list" and to trace a row back to the plan.
   */
  source_plan_entry_id?: string;
}

/**
 * US-795: name/category/aisle come from the caller's already-resolved
 * `EffectiveFood` for each food, keyed by `Food.id`. This file is a plain
 * library with no React context, so it cannot call `useEffectiveFood` itself
 * -- the caller (which has `catalogById`) resolves each food and passes the
 * result in rather than this function reading a food's raw columns. Every
 * food in `foods` must have an entry; a food with no linked catalog row still
 * needs one (`resolveFood(food, null)`), since it carries the household's own
 * values in that case.
 */
export function generateGroceryList(
  planEntries: PlanEntry[],
  foods: Food[],
  effectiveFoodById: Record<string, EffectiveFood>,
  window?: ShoppingWindow,
): GeneratedGroceryRow[] {
  const entries = window
    ? planEntries.filter(
        (entry) =>
          typeof entry.date === "string" &&
          dateKey(entry.date) >= window.from &&
          dateKey(entry.date) <= window.to,
      )
    : planEntries;

  // One family dinner is one purchase. A recipe scheduled for three kids
  // writes one plan row per kid per food (schedule_recipe_to_plan), and
  // counting each of them tripled the shopping for a single pot. Recipe rows
  // collapse on (recipe, date, slot, food); plain food rows still count per
  // kid, since three kids each having an apple is three apples.
  const seenRecipeRows = new Set<string>();
  const counted = entries.filter((entry) => {
    if (!entry.recipe_id) return true;
    const k = `${entry.recipe_id}|${typeof entry.date === "string" ? dateKey(entry.date) : ""}|${entry.meal_slot}|${entry.food_id}`;
    if (seenRecipeRows.has(k)) return false;
    seenRecipeRows.add(k);
    return true;
  });

  const foodById = new Map(foods.map((f) => [f.id, f]));

  const foodCount: Record<
    string,
    { food: Food; count: number; inStock: number; sourcePlanEntryId?: string; firstDate?: string }
  > = {};

  counted.forEach(entry => {
    const food = foodById.get(entry.food_id);
    if (food) {
      const existing = foodCount[food.id];
      if (existing) {
        existing.count++;
        // Keep the earliest entry in the window as the source, so the answer
        // does not depend on the order the entries happen to arrive in.
        const candidate = typeof entry.date === "string" ? dateKey(entry.date) : undefined;
        if (candidate && (!existing.firstDate || candidate < existing.firstDate)) {
          existing.firstDate = candidate;
          existing.sourcePlanEntryId = entry.id;
        }
      } else {
        foodCount[food.id] = {
          food,
          count: 1,
          inStock: food.quantity || 0,
          sourcePlanEntryId: entry.id,
          firstDate: typeof entry.date === "string" ? dateKey(entry.date) : undefined,
        };
      }
    }
  });

  // Only include items that are needed (count > stock)
  return Object.values(foodCount)
    .filter(({ count, inStock }) => count > inStock)
    .map(({ food, count, inStock, sourcePlanEntryId }) => {
      // Guards a caller that built the map from a different array than
      // `foods` (or an out-of-date one): `Record<string, T>` indexes as `T`,
      // not `T | undefined`, so a missing entry would otherwise throw
      // reading `.name` off `undefined` with no compile-time warning.
      // Falling back to `resolveFood(food, null)` -- the household's own
      // values, exactly what an unlinked food already resolves to -- is not
      // "resolving inside this file" as a design choice; it is a defensive
      // guard for a bug that should never happen if the caller built the map
      // correctly.
      const effective = effectiveFoodById[food.id] ?? resolveFood(food, null);
      return {
        id: generateId(),
        name: effective.name,
        quantity: count - inStock, // Only need the difference
        unit: food.unit || "servings", // household state -- never on EffectiveFood
        checked: false,
        category: effective.category,
        aisle: effective.aisle,
        auto_generated: true as const,
        source_plan_entry_id: sourcePlanEntryId,
      };
    });
}
