import { Food, PlanEntry, MealSlot } from "@/types";
import { generateId } from "./utils";

const MEAL_SLOTS: MealSlot[] = ["breakfast", "lunch", "dinner", "snack1", "snack2"];

export function buildWeekPlan(
  kidId: string,
  foods: Food[],
  history: PlanEntry[]
): PlanEntry[] {
  const plan: PlanEntry[] = [];
  const days = 7;
  const safeFoods = foods.filter(f => f.is_safe);
  const tryBites = foods.filter(f => f.is_try_bite);

  if (safeFoods.length === 0) {
    throw new Error("Please add some safe foods first!");
  }

  if (tryBites.length === 0) {
    throw new Error("Please add some try bite foods first!");
  }

  const today = new Date();

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
        id: generateId(),
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
      id: generateId(),
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


export function generateGroceryList(planEntries: PlanEntry[], foods: Food[]) {
  const foodCount: Record<string, { food: Food; count: number; inStock: number }> = {};

  planEntries.forEach(entry => {
    const food = foods.find(f => f.id === entry.food_id);
    if (food) {
      if (foodCount[food.id]) {
        foodCount[food.id].count++;
      } else {
        foodCount[food.id] = { 
          food, 
          count: 1, 
          inStock: food.quantity || 0 
        };
      }
    }
  });

  // Only include items that are needed (count > stock)
  return Object.values(foodCount)
    .filter(({ count, inStock }) => count > inStock)
    .map(({ food, count, inStock }) => ({
      id: generateId(),
      name: food.name,
      quantity: count - inStock, // Only need the difference
      unit: food.unit || "servings",
      checked: false,
      category: food.category,
      aisle: food.aisle,
    }));
}
