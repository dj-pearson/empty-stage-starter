/**
 * Pure transforms behind manage-meal-plan-templates (US-716).
 *
 * Extracted from the handler so the two pieces that were actually wrong can be
 * tested without a database or a deployed function: building plan_entries rows
 * from a template, and folding a planned week back into template entries.
 */

export interface TemplateEntry {
  day_of_week: number;
  meal_slot: string;
  recipe_id?: string | null;
  food_ids?: string[] | null;
  notes?: string | null;
}

export interface KidSafety {
  id: string;
  allergens?: string[] | null;
  dietary_restrictions?: string[] | null;
}

export interface FoodSafety {
  name: string;
  allergens: string[];
}

export interface PlanRow {
  user_id: string;
  household_id: string | null;
  kid_id: string;
  date: string;
  meal_slot: string;
  recipe_id: string | null;
  food_id: string;
  is_primary_dish: boolean;
  notes: string;
}

export interface RecipeOnlySchedule {
  kid_id: string;
  recipe_id: string;
  date: string;
  meal_slot: string;
}

export interface SkippedFood {
  kid_id: string;
  food_id: string;
  reason: string;
}

export interface BuildResult {
  rows: PlanRow[];
  recipeOnly: RecipeOnlySchedule[];
  skipped: SkippedFood[];
}

const lower = (values: string[] | null | undefined): string[] =>
  (values ?? []).map((v) => String(v).toLowerCase());

/** The date `dayOffset` days after `startDate`, as a YYYY-MM-DD key. */
export function dateForOffset(startDate: string, dayOffset: number): string {
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d.toISOString().split('T')[0];
}

/**
 * Why a food is unsafe for a kid, or null when it is fine.
 *
 * This is the check the handler had carried as a `// TODO: Check allergens`
 * comment since it was written, while the dialog offered per-child selection.
 */
export function unsafeReason(
  kid: KidSafety,
  foodId: string,
  foodsById: Map<string, FoodSafety>,
): string | null {
  const food = foodsById.get(foodId);
  if (!food) return null;

  const foodAllergens = lower(food.allergens);
  const kidAllergens = lower(kid.allergens);
  const hit = foodAllergens.find((a) => kidAllergens.includes(a));
  if (hit) return `contains ${hit}`;

  const restrictions = lower(kid.dietary_restrictions);
  const restricted = foodAllergens.find((a) => restrictions.includes(a));
  if (restricted) return `restricted: ${restricted}`;

  return null;
}

/**
 * Build the plan_entries rows for a template application.
 *
 * Three things this fixes, all of which made an apply fail outright or lose
 * data:
 *  - user_id was never stamped, and plan_entries.user_id is NOT NULL with no
 *    trigger to fill it, so every insert was rejected.
 *  - a recipe-only entry (no food_ids) was inserted with food_id null, which is
 *    also NOT NULL. Those are returned separately, to be scheduled through
 *    schedule_recipe_to_plan, which expands the recipe's own foods.
 *  - foods carrying an allergen the child reacts to were scheduled anyway.
 */
export function buildTemplatePlanRows(args: {
  templateEntries: TemplateEntry[];
  kids: KidSafety[];
  foodsById: Map<string, FoodSafety>;
  userId: string;
  householdId: string | null;
  startDate: string;
  templateName: string;
}): BuildResult {
  const { templateEntries, kids, foodsById, userId, householdId, startDate, templateName } = args;

  const rows: PlanRow[] = [];
  const recipeOnly: RecipeOnlySchedule[] = [];
  const skipped: SkippedFood[] = [];

  for (const entry of templateEntries) {
    const date = dateForOffset(startDate, entry.day_of_week);

    for (const kid of kids) {
      const foodIds = entry.food_ids ?? [];

      if (foodIds.length === 0) {
        if (entry.recipe_id) {
          recipeOnly.push({
            kid_id: kid.id,
            recipe_id: entry.recipe_id,
            date,
            meal_slot: entry.meal_slot,
          });
        }
        continue;
      }

      foodIds.forEach((foodId, index) => {
        const reason = unsafeReason(kid, foodId, foodsById);
        if (reason) {
          skipped.push({ kid_id: kid.id, food_id: foodId, reason });
          return;
        }
        rows.push({
          user_id: userId,
          household_id: householdId,
          kid_id: kid.id,
          date,
          meal_slot: entry.meal_slot,
          recipe_id: index === 0 ? (entry.recipe_id ?? null) : null,
          food_id: foodId,
          is_primary_dish: index === 0,
          notes: `From template: ${templateName}${
            entry.notes && index === 0 ? ` | ${entry.notes}` : ''
          }`,
        });
      });
    }
  }

  return { rows, recipeOnly, skipped };
}

export interface PlannedEntry {
  date: string;
  meal_slot: string;
  recipe_id?: string | null;
  food_id?: string | null;
  is_primary_dish?: boolean | null;
  notes?: string | null;
}

export interface GroupedTemplateEntry {
  day_of_week: number;
  meal_slot: string;
  recipe_id: string | null;
  food_ids: string[];
  notes: string | null;
}

/**
 * Fold a planned week into template entries, grouped by
 * (date, meal_slot, recipe_id).
 *
 * The handler used to filter the query to is_primary_dish and map one row to
 * one template entry, so a meal of four foods was saved as its first food and
 * every side was lost. Grouping keeps the whole meal in one entry's food_ids,
 * which is the shape buildTemplatePlanRows reads back, and still collapses the
 * duplicates the filter existed to avoid.
 */
export function groupPlannedWeekIntoTemplateEntries(
  planEntries: PlannedEntry[],
  startDate: string,
): GroupedTemplateEntry[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const groups = new Map<string, GroupedTemplateEntry>();

  for (const entry of planEntries) {
    const entryDate = new Date(`${entry.date}T00:00:00Z`);
    const dayOfWeek = Math.floor(
      (entryDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    );
    const key = `${entry.date}|${entry.meal_slot}|${entry.recipe_id ?? ''}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        day_of_week: dayOfWeek,
        meal_slot: entry.meal_slot,
        recipe_id: entry.recipe_id ?? null,
        food_ids: [],
        notes: entry.notes ?? null,
      };
      groups.set(key, group);
    }

    if (entry.food_id && !group.food_ids.includes(entry.food_id)) {
      // Primary dish first, so the index-0 rule in buildTemplatePlanRows still
      // names the same food when the template is applied again.
      if (entry.is_primary_dish) group.food_ids.unshift(entry.food_id);
      else group.food_ids.push(entry.food_id);
    }
    if (!group.notes && entry.notes) group.notes = entry.notes;
  }

  return [...groups.values()];
}
