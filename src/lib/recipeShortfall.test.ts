import { describe, it, expect } from 'vitest';
import { computeRecipeShortfall, countMissingForRecipe } from './recipeShortfall';
import type { Food, GroceryItem, Recipe, RecipeIngredient } from '@/types';

/**
 * US-292: integration-style coverage that simulates the full loop —
 *
 *   plan-add (3 missing) → buy missing → move to pantry (cleared)
 *
 * The badge derivation is pure (`countMissingForRecipe`) so we don't need
 * the real React component or AppContext to validate the transitions.
 */

function buildFood(
  partial: Partial<Food> & Pick<Food, 'id' | 'name'>
): Food {
  return {
    category: partial.category ?? 'protein',
    is_safe: true,
    is_try_bite: false,
    quantity: 0,
    unit: 'lb',
    ...partial,
  };
}

function buildIngredient(
  partial: Partial<RecipeIngredient> & Pick<RecipeIngredient, 'id' | 'name'>
): RecipeIngredient {
  return {
    recipe_id: 'recipe-1',
    sort_order: 0,
    food_id: null,
    quantity: 1,
    unit: 'lb',
    ...partial,
  };
}

describe('countMissingForRecipe', () => {
  it('returns 0 when recipe has no ingredients and no food_ids', () => {
    const recipe: Recipe = {
      id: 'r-empty',
      name: 'Empty',
      food_ids: [],
    };
    expect(countMissingForRecipe(recipe, [])).toBe(0);
  });

  it('legacy food_ids path: counts foods missing or with quantity ≤ 0', () => {
    const recipe: Recipe = {
      id: 'r-1',
      name: 'Pasta',
      food_ids: ['f-pasta', 'f-sauce', 'f-cheese'],
    };
    const foods: Food[] = [
      buildFood({ id: 'f-pasta', name: 'Pasta', quantity: 1 }),
      buildFood({ id: 'f-sauce', name: 'Sauce', quantity: 0 }),
      // f-cheese is absent entirely
    ];
    expect(countMissingForRecipe(recipe, foods)).toBe(2);
  });

  it('structured ingredients path: defers to computeRecipeShortfall', () => {
    const recipe: Recipe = {
      id: 'r-2',
      name: 'Tacos',
      food_ids: [],
      recipe_ingredients: [
        buildIngredient({ id: 'i-1', name: 'Beef', quantity: 1, unit: 'lb' }),
        buildIngredient({ id: 'i-2', name: 'Tortillas', quantity: 8, unit: 'count' }),
      ],
    };
    const foods: Food[] = [
      buildFood({ id: 'f-1', name: 'Beef', quantity: 0, unit: 'lb' }),
      buildFood({ id: 'f-2', name: 'Tortillas', quantity: 8, unit: 'count' }),
    ];
    // Beef is short, tortillas are exactly enough.
    expect(countMissingForRecipe(recipe, foods)).toBe(1);
  });
});

describe('US-292 loop: plan-add → buy → move-to-pantry transitions badges 3 → 1 → 0', () => {
  const recipe: Recipe = {
    id: 'r-spaghetti',
    name: 'Spaghetti Bolognese',
    food_ids: ['f-pasta', 'f-beef', 'f-tomato'],
  };

  it('initial state — three ingredients, none in pantry → 3 missing', () => {
    const foods: Food[] = [];
    expect(countMissingForRecipe(recipe, foods)).toBe(3);
  });

  it('user adds pasta + tomato to grocery and buys them — 1 missing remains', () => {
    // After "buy" the pantry shows pasta=1 and tomato=1; beef still 0.
    const foods: Food[] = [
      buildFood({ id: 'f-pasta', name: 'Pasta', quantity: 1 }),
      buildFood({ id: 'f-tomato', name: 'Tomato', quantity: 1 }),
      // f-beef still not in pantry
    ];
    expect(countMissingForRecipe(recipe, foods)).toBe(1);
  });

  it('user buys the beef too — 0 missing, badge clears', () => {
    const foods: Food[] = [
      buildFood({ id: 'f-pasta', name: 'Pasta', quantity: 1 }),
      buildFood({ id: 'f-tomato', name: 'Tomato', quantity: 1 }),
      buildFood({ id: 'f-beef', name: 'Beef', quantity: 1 }),
    ];
    expect(countMissingForRecipe(recipe, foods)).toBe(0);
  });

  it('detects a "newly cleared" plan entry by comparing pre/post foods', () => {
    // Pre: missing beef.
    const preFoods: Food[] = [
      buildFood({ id: 'f-pasta', name: 'Pasta', quantity: 1 }),
      buildFood({ id: 'f-tomato', name: 'Tomato', quantity: 1 }),
    ];
    // Post: beef just landed in the pantry.
    const postFoods: Food[] = [
      ...preFoods,
      buildFood({ id: 'f-beef', name: 'Beef', quantity: 1 }),
    ];

    const before = countMissingForRecipe(recipe, preFoods);
    const after = countMissingForRecipe(recipe, postFoods);

    expect(before).toBe(1);
    expect(after).toBe(0);
    // This is what handleDoneShopping uses to gate the
    // missing_flags_cleared_after_pantry_move telemetry — only fire when a
    // plan entry crosses the >0 → 0 threshold.
    expect(before > 0 && after === 0).toBe(true);
  });
});

describe('computeRecipeShortfall (sanity, since US-290 builds on it)', () => {
  it('marks no rows when the pantry already covers everything', () => {
    const recipe: Recipe = {
      id: 'r-x',
      name: 'X',
      food_ids: [],
      recipe_ingredients: [
        buildIngredient({ id: 'i-1', name: 'Onion', quantity: 1, unit: 'lb' }),
      ],
    };
    const foods: Food[] = [
      buildFood({ id: 'f-1', name: 'Onion', quantity: 5, unit: 'lb' }),
    ];
    expect(computeRecipeShortfall(recipe, foods)).toEqual([]);
  });
});

describe('computeRecipeShortfall: units, unknown amounts and the list', () => {
  const recipeWith = (...ings: RecipeIngredient[]): Recipe => ({
    id: 'r-u',
    name: 'U',
    food_ids: [],
    recipe_ingredients: ings,
  });
  const listItem = (p: Partial<GroceryItem> & Pick<GroceryItem, 'id' | 'name'>): GroceryItem => ({
    quantity: 1,
    unit: '',
    checked: false,
    category: 'protein',
    ...p,
  });

  it('2 lb on hand covers 16 oz', () => {
    const recipe = recipeWith(buildIngredient({ id: 'i', name: 'Beef', quantity: 16, unit: 'oz' }));
    const foods = [buildFood({ id: 'f', name: 'Beef', quantity: 2, unit: 'lb' })];
    expect(computeRecipeShortfall(recipe, foods)).toEqual([]);
  });

  it('converts a partial cover into the recipe unit', () => {
    const recipe = recipeWith(buildIngredient({ id: 'i', name: 'Beef', quantity: 32, unit: 'oz' }));
    const foods = [buildFood({ id: 'f', name: 'Beef', quantity: 1, unit: 'lb' })];
    const [row] = computeRecipeShortfall(recipe, foods);
    expect(row.comparable).toBe(true);
    expect(row.reason).toBe('short');
    expect(row.needed).toBeCloseTo(16, 3);
  });

  it('keeps cups vs lb as a verify row', () => {
    const recipe = recipeWith(buildIngredient({ id: 'i', name: 'Flour', quantity: 2, unit: 'cup' }));
    const foods = [buildFood({ id: 'f', name: 'Flour', quantity: 5, unit: 'lb' })];
    const [row] = computeRecipeShortfall(recipe, foods);
    expect(row.comparable).toBe(false);
    expect(row.reason).toBe('unit_mismatch');
  });

  it("'to taste' becomes verify, not a guessed 1", () => {
    const recipe = recipeWith(
      buildIngredient({ id: 'i', name: 'Salt', quantity: null, unit: 'to taste' }),
    );
    const [row] = computeRecipeShortfall(recipe, []);
    expect(row.comparable).toBe(false);
    expect(row.reason).toBe('unknown_quantity');
    expect(row.needed).toBe(0);
  });

  it('a zero quantity is verify too, and pantry stock covers it', () => {
    const recipe = recipeWith(buildIngredient({ id: 'i', name: 'Pepper', quantity: 0, unit: '' }));
    expect(computeRecipeShortfall(recipe, [])[0].reason).toBe('unknown_quantity');
    const foods = [buildFood({ id: 'f', name: 'Pepper', quantity: 1, unit: 'jar' })];
    expect(computeRecipeShortfall(recipe, foods)).toEqual([]);
  });

  it('subtracts unchecked list quantities by name', () => {
    const recipe = recipeWith(
      buildIngredient({ id: 'i1', name: 'Milk', quantity: 3, unit: 'cup' }),
      buildIngredient({ id: 'i2', name: 'Eggs', quantity: 6, unit: 'count' }),
    );
    const onList = [
      listItem({ id: 'g1', name: 'milk', quantity: 1, unit: 'cup' }),
      listItem({ id: 'g2', name: 'Eggs', quantity: 12, unit: 'count' }),
      listItem({ id: 'g3', name: 'Milk', quantity: 5, unit: 'cup', checked: true }),
    ];
    const rows = computeRecipeShortfall(recipe, [], onList);
    expect(rows).toHaveLength(1);
    expect(rows[0].ingredient.name).toBe('Milk');
    expect(rows[0].needed).toBe(2);
    expect(rows[0].onListQty).toBe(1);
    expect(countMissingForRecipe(recipe, [], onList)).toBe(1);
  });
});

describe('computeRecipeShortfall scale', () => {
  const recipe: Recipe = {
    id: 'r-scale',
    name: 'Chili',
    food_ids: [],
    recipe_ingredients: [
      buildIngredient({ id: 'i-beef', name: 'Ground beef', quantity: 1, unit: 'lb' }),
      buildIngredient({ id: 'i-beans', name: 'Beans', quantity: 2, unit: 'can', sort_order: 1 }),
    ],
  };

  it('multiplies what is needed by the scale', () => {
    const base = computeRecipeShortfall(recipe, []);
    const doubled = computeRecipeShortfall(recipe, [], undefined, 2);
    expect(base.map((s) => s.needed)).toEqual([1, 2]);
    expect(doubled.map((s) => s.needed)).toEqual([2, 4]);
  });

  it('treats a bad scale as 1', () => {
    expect(computeRecipeShortfall(recipe, [], undefined, Number.NaN).map((s) => s.needed)).toEqual([1, 2]);
  });

  it('does not report an item already on the list as missing', () => {
    const onList: GroceryItem[] = [
      { id: 'g1', name: 'Beans', quantity: 4, unit: 'can', checked: false, category: 'protein' },
    ];
    const out = computeRecipeShortfall(recipe, [], onList, 2);
    expect(out.map((s) => s.ingredient.name)).toEqual(['Ground beef']);
  });
});
