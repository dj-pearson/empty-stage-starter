/**
 * Recipe components — normalization (US-612).
 *
 * Pure module. Turns `recipe_components` rows into the camelCase shape the
 * app uses, and groups the existing `recipe_ingredients` rows underneath them.
 *
 * The important property is that components are OPTIONAL. A recipe that has
 * never been deconstructed has no component rows and every ingredient
 * ungrouped, and that is a valid, complete recipe — not a half-filled one. So
 * `groupIngredientsByComponent` always returns the ungrouped remainder
 * alongside the components rather than dropping it, and a recipe with no
 * components comes back as "everything ungrouped" instead of empty.
 *
 * The sensory flags are deliberately conservative in the DB defaults
 * (`can_touch_other_foods` true, `is_mixed_in` false) so an unfilled component
 * never invents a restriction the parent did not describe. That reading is
 * preserved here rather than re-defaulted.
 */

import type { Database } from '@/integrations/supabase/types';

type ComponentRow = Database['public']['Tables']['recipe_components']['Row'];
type IngredientRow = Database['public']['Tables']['recipe_ingredients']['Row'];

export interface RecipeComponent {
  id: string;
  recipeId: string;
  name: string;
  sortOrder: number;
  /** False means this part needs a gap around it, or its own bowl. */
  canTouchOtherFoods: boolean;
  /** Stirred through. Once on it cannot come off, so decide before combining. */
  isMixedIn: boolean;
  /** False marks a part that IS the dish; holding it back serves something else. */
  canBeHeldBack: boolean;
  /** Same vocabulary as `kids.texture_dislikes`. */
  textures: string[];
  foodId: string | null;
  notes: string | null;
}

export interface ComponentGroup {
  component: RecipeComponent;
  ingredients: IngredientRow[];
}

export interface GroupedRecipe {
  groups: ComponentGroup[];
  /** Ingredients not assigned to any component. Never dropped. */
  ungrouped: IngredientRow[];
  /** False for every recipe that has never been deconstructed. */
  hasComponents: boolean;
}

export function normalizeRecipeComponent(row: ComponentRow): RecipeComponent {
  return {
    id: row.id,
    recipeId: row.recipe_id,
    name: row.name,
    sortOrder: row.sort_order,
    canTouchOtherFoods: row.can_touch_other_foods,
    isMixedIn: row.is_mixed_in,
    canBeHeldBack: row.can_be_held_back,
    textures: row.textures ?? [],
    foodId: row.food_id,
    notes: row.notes,
  };
}

export function normalizeRecipeComponents(rows: ComponentRow[]): RecipeComponent[] {
  return rows
    .map(normalizeRecipeComponent)
    .sort((a, b) =>
      a.sortOrder === b.sortOrder ? a.name.localeCompare(b.name) : a.sortOrder - b.sortOrder
    );
}

/**
 * Group a recipe's ingredients under its components.
 *
 * An ingredient whose `component_id` points at a component that is not in
 * `components` (a stale id, or a partial fetch) lands in `ungrouped` rather
 * than vanishing: losing an ingredient off a recipe is a much worse failure
 * than showing it unsorted.
 */
export function groupIngredientsByComponent(
  components: RecipeComponent[],
  ingredients: IngredientRow[]
): GroupedRecipe {
  const ordered = normalizeById(components);
  const groups: ComponentGroup[] = ordered.map((component) => ({ component, ingredients: [] }));
  const byId = new Map(groups.map((group) => [group.component.id, group]));
  const ungrouped: IngredientRow[] = [];

  for (const ingredient of ingredients) {
    const group = ingredient.component_id ? byId.get(ingredient.component_id) : undefined;
    if (group) group.ingredients.push(ingredient);
    else ungrouped.push(ingredient);
  }

  const bySortOrder = (a: IngredientRow, b: IngredientRow) =>
    a.sort_order === b.sort_order ? a.name.localeCompare(b.name) : a.sort_order - b.sort_order;
  for (const group of groups) group.ingredients.sort(bySortOrder);
  ungrouped.sort(bySortOrder);

  return { groups, ungrouped, hasComponents: components.length > 0 };
}

function normalizeById(components: RecipeComponent[]): RecipeComponent[] {
  return [...components].sort((a, b) =>
    a.sortOrder === b.sortOrder ? a.name.localeCompare(b.name) : a.sortOrder - b.sortOrder
  );
}
