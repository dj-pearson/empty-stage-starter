/**
 * Pure, dependency-free recipe search + filter + sort used by the mobile
 * Recipes screen. Mirrors the web toolbar's sort/quick-filter set
 * (`src/components/recipes/RecipeToolbar.tsx`) so the two platforms behave
 * consistently, but stays free of React/DOM so Metro can bundle it and Vitest
 * can cover it. Search relevance comes from `mobileSearch`.
 */
import { searchRank, type SearchField } from './mobileSearch';

export type RecipeSort =
  | 'recent'
  | 'name'
  | 'prep-asc'
  | 'difficulty'
  | 'kid-friendly'
  | 'ingredients';

export type RecipeDifficulty = 'easy' | 'medium' | 'hard';

/** Minimum shape the filters need; screen row types are a superset. */
export interface FilterableRecipe {
  name: string;
  description?: string | null;
  category?: string | null;
  tags?: string[] | null;
  difficulty_level?: string | null;
  kid_friendly_score?: number | null;
  prep_time?: string | null;
  cook_time?: string | null;
  food_ids?: string[] | null;
  /** Optional ingredient names for search (loaded lazily by the screen). */
  ingredientNames?: string[];
  /** Optional explicit ingredient count; falls back to food_ids length. */
  ingredientCount?: number;
}

export interface RecipeFilters {
  search: string;
  category: string | null;
  difficulty: RecipeDifficulty | null;
  /** All selected tags must be present (AND). */
  tags: string[];
  quick: boolean;
  kidApproved: boolean;
  readyToCook: boolean;
  sortBy: RecipeSort;
}

export const DEFAULT_RECIPE_FILTERS: RecipeFilters = {
  search: '',
  category: null,
  difficulty: null,
  tags: [],
  quick: false,
  kidApproved: false,
  readyToCook: false,
  sortBy: 'recent',
};

/** Number of facet/quick filters currently narrowing the list (for a badge). */
export function activeRecipeFilterCount(filters: RecipeFilters): number {
  let n = 0;
  if (filters.category) n++;
  if (filters.difficulty) n++;
  n += filters.tags.length;
  if (filters.quick) n++;
  if (filters.kidApproved) n++;
  if (filters.readyToCook) n++;
  return n;
}

const QUICK_MEAL_MAX_MINUTES = 30;
const KID_APPROVED_MIN_SCORE = 70;

/**
 * Parse a human duration string ("25 min", "1 hr 10 min", "30", "1h") into
 * total minutes. Returns null when nothing numeric is present.
 */
export function parseDurationMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = value.toLowerCase();
  let minutes = 0;
  let matched = false;

  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  if (hourMatch) {
    minutes += parseFloat(hourMatch[1]) * 60;
    matched = true;
  }
  const minMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/);
  if (minMatch) {
    minutes += parseFloat(minMatch[1]);
    matched = true;
  }
  if (!matched) {
    // Bare number → assume minutes.
    const bare = text.match(/(\d+(?:\.\d+)?)/);
    if (bare) {
      minutes = parseFloat(bare[1]);
      matched = true;
    }
  }
  return matched ? minutes : null;
}

function ingredientCountOf(recipe: FilterableRecipe): number {
  if (typeof recipe.ingredientCount === 'number') return recipe.ingredientCount;
  return recipe.food_ids?.length ?? 0;
}

export function isQuickRecipe(recipe: FilterableRecipe): boolean {
  const prep = parseDurationMinutes(recipe.prep_time) ?? 0;
  const cook = parseDurationMinutes(recipe.cook_time) ?? 0;
  const total = prep + cook;
  return total > 0 && total <= QUICK_MEAL_MAX_MINUTES;
}

export function isKidApproved(recipe: FilterableRecipe): boolean {
  return (recipe.kid_friendly_score ?? 0) >= KID_APPROVED_MIN_SCORE;
}

export function isReadyToCook(recipe: FilterableRecipe): boolean {
  return ingredientCountOf(recipe) > 0;
}

/** Distinct tags across a set of recipes, sorted alphabetically. */
export function collectRecipeTags(recipes: FilterableRecipe[]): string[] {
  const set = new Set<string>();
  for (const r of recipes) {
    for (const tag of r.tags ?? []) {
      const t = tag.trim();
      if (t) set.add(t);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

const DIFFICULTY_RANK: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

function applySort<T extends FilterableRecipe>(recipes: T[], sortBy: RecipeSort): T[] {
  const list = [...recipes];
  switch (sortBy) {
    case 'name':
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case 'prep-asc':
      return list.sort((a, b) => {
        const am = parseDurationMinutes(a.prep_time);
        const bm = parseDurationMinutes(b.prep_time);
        if (am == null && bm == null) return a.name.localeCompare(b.name);
        if (am == null) return 1;
        if (bm == null) return -1;
        return am - bm || a.name.localeCompare(b.name);
      });
    case 'difficulty':
      return list.sort((a, b) => {
        const ar = DIFFICULTY_RANK[a.difficulty_level ?? ''] ?? 99;
        const br = DIFFICULTY_RANK[b.difficulty_level ?? ''] ?? 99;
        return ar - br || a.name.localeCompare(b.name);
      });
    case 'kid-friendly':
      return list.sort(
        (a, b) =>
          (b.kid_friendly_score ?? -1) - (a.kid_friendly_score ?? -1) ||
          a.name.localeCompare(b.name)
      );
    case 'ingredients':
      return list.sort(
        (a, b) => ingredientCountOf(a) - ingredientCountOf(b) || a.name.localeCompare(b.name)
      );
    case 'recent':
    default:
      return list; // input is already server-ordered newest-first
  }
}

/**
 * Search, facet-filter, then sort. When a search query is present the result is
 * relevance-ranked (the explicit `sortBy` is ignored so the best matches stay
 * on top); with no query the chosen `sortBy` applies.
 */
export function filterAndSortRecipes<T extends FilterableRecipe>(
  recipes: T[],
  filters: RecipeFilters
): T[] {
  const hasSearch = filters.search.trim().length > 0;

  let result = searchRank(recipes, filters.search, (r) => {
    const fields: SearchField[] = [
      { value: r.name, weight: 3 },
      { value: r.description, weight: 1 },
    ];
    for (const tag of r.tags ?? []) fields.push({ value: tag, weight: 2 });
    for (const ing of r.ingredientNames ?? []) fields.push({ value: ing, weight: 1 });
    return fields;
  });

  result = result.filter((r) => {
    if (filters.category && (r.category ?? null) !== filters.category) return false;
    if (filters.difficulty && (r.difficulty_level ?? null) !== filters.difficulty) return false;
    if (filters.tags.length > 0) {
      const recipeTags = new Set((r.tags ?? []).map((t) => t.toLowerCase()));
      if (!filters.tags.every((t) => recipeTags.has(t.toLowerCase()))) return false;
    }
    if (filters.quick && !isQuickRecipe(r)) return false;
    if (filters.kidApproved && !isKidApproved(r)) return false;
    if (filters.readyToCook && !isReadyToCook(r)) return false;
    return true;
  });

  if (!hasSearch) result = applySort(result, filters.sortBy);
  return result;
}
