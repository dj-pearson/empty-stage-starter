import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RECIPE_FILTERS,
  activeRecipeFilterCount,
  parseDurationMinutes,
  isQuickRecipe,
  isKidApproved,
  isReadyToCook,
  collectRecipeTags,
  filterAndSortRecipes,
  type FilterableRecipe,
  type RecipeFilters,
} from './recipeFilters';

const make = (r: Partial<FilterableRecipe>): FilterableRecipe => ({ name: 'Untitled', ...r });

const filters = (overrides: Partial<RecipeFilters>): RecipeFilters => ({
  ...DEFAULT_RECIPE_FILTERS,
  ...overrides,
});

describe('parseDurationMinutes', () => {
  it('parses minutes, hours, combos and bare numbers', () => {
    expect(parseDurationMinutes('25 min')).toBe(25);
    expect(parseDurationMinutes('1 hr')).toBe(60);
    expect(parseDurationMinutes('1 hr 10 min')).toBe(70);
    expect(parseDurationMinutes('30')).toBe(30);
    expect(parseDurationMinutes('1h')).toBe(60);
  });
  it('returns null for empty/non-numeric', () => {
    expect(parseDurationMinutes(null)).toBeNull();
    expect(parseDurationMinutes('quick')).toBeNull();
  });
});

describe('quick-filter predicates', () => {
  it('isQuickRecipe uses prep + cook <= 30 min', () => {
    expect(isQuickRecipe(make({ prep_time: '10 min', cook_time: '15 min' }))).toBe(true);
    expect(isQuickRecipe(make({ prep_time: '20 min', cook_time: '25 min' }))).toBe(false);
    expect(isQuickRecipe(make({}))).toBe(false); // no data → not quick
  });
  it('isKidApproved uses score threshold', () => {
    expect(isKidApproved(make({ kid_friendly_score: 80 }))).toBe(true);
    expect(isKidApproved(make({ kid_friendly_score: 40 }))).toBe(false);
  });
  it('isReadyToCook checks ingredient presence', () => {
    expect(isReadyToCook(make({ food_ids: ['a'] }))).toBe(true);
    expect(isReadyToCook(make({ ingredientCount: 3 }))).toBe(true);
    expect(isReadyToCook(make({ food_ids: [] }))).toBe(false);
  });
});

describe('collectRecipeTags', () => {
  it('returns distinct sorted tags', () => {
    const tags = collectRecipeTags([
      make({ tags: ['dinner', 'quick'] }),
      make({ tags: ['quick', 'vegan'] }),
    ]);
    expect(tags).toEqual(['dinner', 'quick', 'vegan']);
  });
});

describe('activeRecipeFilterCount', () => {
  it('counts each active facet and every selected tag', () => {
    expect(activeRecipeFilterCount(DEFAULT_RECIPE_FILTERS)).toBe(0);
    expect(
      activeRecipeFilterCount(
        filters({ category: 'protein', difficulty: 'easy', tags: ['a', 'b'], quick: true })
      )
    ).toBe(5);
  });
});

describe('filterAndSortRecipes', () => {
  const recipes: FilterableRecipe[] = [
    make({
      name: 'Chicken tacos',
      category: 'protein',
      difficulty_level: 'easy',
      tags: ['dinner'],
      kid_friendly_score: 90,
      prep_time: '10 min',
      cook_time: '15 min',
      food_ids: ['x'],
    }),
    make({
      name: 'Beef stew',
      category: 'protein',
      difficulty_level: 'hard',
      tags: ['dinner', 'slow'],
      kid_friendly_score: 30,
      prep_time: '20 min',
      cook_time: '2 hr',
      food_ids: ['y', 'z'],
    }),
    make({
      name: 'Fruit salad',
      category: 'fruit',
      difficulty_level: 'easy',
      tags: ['snack'],
      kid_friendly_score: 75,
      prep_time: '5 min',
      food_ids: [],
    }),
  ];

  it('filters by category', () => {
    const out = filterAndSortRecipes(recipes, filters({ category: 'fruit' }));
    expect(out.map((r) => r.name)).toEqual(['Fruit salad']);
  });

  it('filters by difficulty', () => {
    const out = filterAndSortRecipes(recipes, filters({ difficulty: 'easy' }));
    expect(out.map((r) => r.name).sort()).toEqual(['Chicken tacos', 'Fruit salad']);
  });

  it('filters by tag (AND) and quick flag', () => {
    const out = filterAndSortRecipes(recipes, filters({ tags: ['dinner'], quick: true }));
    expect(out.map((r) => r.name)).toEqual(['Chicken tacos']);
  });

  it('filters kid-approved and ready-to-cook', () => {
    const kid = filterAndSortRecipes(recipes, filters({ kidApproved: true }));
    expect(kid.map((r) => r.name).sort()).toEqual(['Chicken tacos', 'Fruit salad']);
    const ready = filterAndSortRecipes(recipes, filters({ readyToCook: true }));
    expect(ready.map((r) => r.name).sort()).toEqual(['Beef stew', 'Chicken tacos']);
  });

  it('sorts by name / prep / difficulty / kid-friendly / ingredients', () => {
    expect(filterAndSortRecipes(recipes, filters({ sortBy: 'name' })).map((r) => r.name)).toEqual([
      'Beef stew',
      'Chicken tacos',
      'Fruit salad',
    ]);
    expect(
      filterAndSortRecipes(recipes, filters({ sortBy: 'prep-asc' })).map((r) => r.name)
    ).toEqual(['Fruit salad', 'Chicken tacos', 'Beef stew']);
    expect(filterAndSortRecipes(recipes, filters({ sortBy: 'difficulty' }))[0].name).toBe(
      'Chicken tacos'
    );
    expect(filterAndSortRecipes(recipes, filters({ sortBy: 'kid-friendly' }))[0].name).toBe(
      'Chicken tacos'
    );
    expect(filterAndSortRecipes(recipes, filters({ sortBy: 'ingredients' }))[0].name).toBe(
      'Fruit salad'
    );
  });

  it('relevance-ranks when searching and ignores sortBy', () => {
    const out = filterAndSortRecipes(recipes, filters({ search: 'chicken', sortBy: 'name' }));
    expect(out[0].name).toBe('Chicken tacos');
  });

  it('searches ingredient names when provided', () => {
    const withIngredients: FilterableRecipe[] = [
      make({ name: 'Mystery bowl', ingredientNames: ['quinoa', 'avocado'] }),
      make({ name: 'Plain toast', ingredientNames: ['bread'] }),
    ];
    const out = filterAndSortRecipes(withIngredients, filters({ search: 'avocado' }));
    expect(out.map((r) => r.name)).toEqual(['Mystery bowl']);
  });
});
