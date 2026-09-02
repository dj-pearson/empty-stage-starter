/**
 * US-718: turning a sibling-solver answer into something the planner can hold.
 *
 * "Use this meal" used to call addPlanEntry with `food_id: ''`. plan_entries
 * .food_id is a NOT NULL uuid, so an empty string is not a missing value -- it
 * is an invalid one, and the insert was rejected every time. Before US-717 the
 * context then appended a locally-generated row anyway, so the meal appeared on
 * the planner, was written to the localStorage backup, and existed nowhere
 * else.
 *
 * A solver result names a RECIPE, not a food, so there is no food_id to send.
 * The recipe is scheduled through schedule_recipe_to_plan, which expands the
 * recipe's own foods into real rows, once per child.
 */

export interface SiblingScheduleRequest {
  p_kid_id: string;
  p_recipe_id: string;
  p_date: string;
  p_meal_slot: string;
}

/**
 * One RPC payload per child. Returns an empty list rather than a bad payload
 * when there is nothing schedulable: no recipe, no children, or a blank id.
 */
export function buildSiblingScheduleRequests(args: {
  recipeId: string | null | undefined;
  kidIds: Array<string | null | undefined>;
  date: string;
  mealSlot: string;
}): SiblingScheduleRequest[] {
  const { recipeId, kidIds, date, mealSlot } = args;
  if (!recipeId || !recipeId.trim()) return [];
  if (!date || !mealSlot) return [];

  const seen = new Set<string>();
  const requests: SiblingScheduleRequest[] = [];

  for (const kidId of kidIds) {
    if (!kidId || !kidId.trim()) continue;
    if (seen.has(kidId)) continue;
    seen.add(kidId);
    requests.push({
      p_kid_id: kidId,
      p_recipe_id: recipeId,
      p_date: date,
      p_meal_slot: mealSlot,
    });
  }

  return requests;
}
