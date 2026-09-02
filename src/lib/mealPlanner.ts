import { Food, PlanEntry, MealSlot } from "@/types";
import { generateId } from "./utils";

const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack1", "snack2"];

/**
 * Build a week of meals for one kid.
 *
 * US-715: takes the week to build and returns entries WITHOUT ids. The ids it
 * used to invent were never real -- the caller replaced local state with them
 * and nothing was ever inserted, so the plan was gone on reload and never
 * reached another device. The server assigns ids now, via addPlanEntries.
 */
export function buildWeekPlan(
  kidId: string,
  foods: Food[],
  history: PlanEntry[],
  startDate: Date = new Date()
): Omit<PlanEntry, "id">[] {
  const plan: Omit<PlanEntry, "id">[] = [];
  const days = 7;
  const safeFoods = foods.filter(f => f.is_safe);
  const tryBites = foods.filter(f => f.is_try_bite);

  if (safeFoods.length === 0) {
    throw new Error("Please add some safe foods first!");
  }

  if (tryBites.length === 0) {
    throw new Error("Please add some try bite foods first!");
  }

  const today = startDate;

  for (let d = 0; d < days; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    const dateStr = date.toISOString().split("T")[0];

    // Regular meal slots
    MEAL_SLOTS.forEach(slot => {
      // Get recent foods for this slot (last 3 days)
      const recentFoods = history
        .filter(p => p.meal_slot === slot)
        .slice(-3)
        .map(p => p.food_id);

      // Get available foods (not used recently)
      const available = safeFoods.filter(f => !recentFoods.includes(f.id));
      
      // Pick a food
      const pick = available.length > 0 
        ? available[Math.floor(Math.random() * available.length)]
        : safeFoods[Math.floor(Math.random() * safeFoods.length)];

      plan.push({
        kid_id: kidId,
        date: dateStr,
        meal_slot: slot,
        food_id: pick.id,
        result: null,
      });
    });

    // Try bite slot
    const tryBite = tryBites[d % tryBites.length];
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

export function buildDayPlan(
  kidId: string,
  date: string,
  foods: Food[],
  history: PlanEntry[]
): PlanEntry[] {
  const plan: PlanEntry[] = [];
  const safeFoods = foods.filter(f => f.is_safe);
  const tryBites = foods.filter(f => f.is_try_bite);

  if (safeFoods.length === 0) {
    throw new Error("Please add some safe foods first!");
  }

  if (tryBites.length === 0) {
    throw new Error("Please add some try bite foods first!");
  }

  // Regular meal slots
  MEAL_SLOTS.forEach(slot => {
    // Get recent foods for this slot (last 3 days)
    const recentFoods = history
      .filter(p => p.meal_slot === slot)
      .slice(-3)
      .map(p => p.food_id);

    // Get available foods (not used recently)
    const available = safeFoods.filter(f => !recentFoods.includes(f.id));
    
    // Pick a food
    const pick = available.length > 0 
      ? available[Math.floor(Math.random() * available.length)]
      : safeFoods[Math.floor(Math.random() * safeFoods.length)];

    plan.push({
      id: generateId(),
      kid_id: kidId,
      date,
      meal_slot: slot,
      food_id: pick.id,
      result: null,
    });
  });

  // Try bite slot - use a random try bite
  const tryBite = tryBites[Math.floor(Math.random() * tryBites.length)];
  plan.push({
    id: generateId(),
    kid_id: kidId,
    date,
    meal_slot: "try_bite",
    food_id: tryBite.id,
    result: null,
  });

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

export function generateGroceryList(
  planEntries: PlanEntry[],
  foods: Food[],
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

  const foodCount: Record<
    string,
    { food: Food; count: number; inStock: number; sourcePlanEntryId?: string; firstDate?: string }
  > = {};

  entries.forEach(entry => {
    const food = foods.find(f => f.id === entry.food_id);
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
    .map(({ food, count, inStock, sourcePlanEntryId }) => ({
      id: generateId(),
      name: food.name,
      quantity: count - inStock, // Only need the difference
      unit: food.unit || "servings",
      checked: false,
      category: food.category,
      aisle: food.aisle,
      auto_generated: true as const,
      source_plan_entry_id: sourcePlanEntryId,
    }));
}
