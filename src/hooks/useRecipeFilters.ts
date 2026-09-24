import { useCallback, useMemo, useState } from 'react';
import { useDebounce } from './useDebounce';
import { useLocalStorage } from './useLocalStorage';
import type { Recipe, Food, Kid, PlanEntry } from '@/types';
import { parseDurationMinutes } from '@/lib/recipeFilters';
import {
  buildRecipeFits,
  fitAcceptanceWeight,
  fitGroup,
  type FitGroup,
  type ItemFit,
} from '@/lib/kidFit';

export const RECIPE_SORT_OPTIONS = [
  'best-fit',
  'kids-eat-most',
  'newest',
  'a-z',
  'rating',
  'cook-time',
  'difficulty',
  'times-made',
  'recently-made',
] as const;

export type RecipeSortOption = (typeof RECIPE_SORT_OPTIONS)[number];

export const RECIPE_VIEW_MODES = ['grid', 'list'] as const;
export type RecipeViewMode = (typeof RECIPE_VIEW_MODES)[number];

/**
 * 'kid-approved' stays in the union so old callers and stored values still
 * type-check, but it is an alias: it used to mean `rating >= 4`, which says
 * nothing about the kids. It maps to 'safe-foods' everywhere it comes in.
 */
export type RecipeQuickFilter =
  | 'favorites'
  | 'ready-to-cook'
  | 'quick'
  | 'allergen-safe'
  | 'no-dislikes'
  | 'safe-foods'
  | 'try-bite'
  | 'kid-approved';

/** The chips the toolbar renders, in order. 'kid-approved' is not one of them. */
export const RECIPE_QUICK_FILTERS = [
  'allergen-safe',
  'safe-foods',
  'no-dislikes',
  'try-bite',
  'quick',
  'ready-to-cook',
  'favorites',
] as const satisfies readonly RecipeQuickFilter[];

/** Quick filters that only mean something when there are kids to score against. */
export const KID_QUICK_FILTERS: readonly RecipeQuickFilter[] = [
  'allergen-safe',
  'safe-foods',
  'no-dislikes',
  'try-bite',
];

const QUICK_MINUTES = 30;
const EMPTY_KIDS: Kid[] = [];
const EMPTY_ENTRIES: PlanEntry[] = [];

export function isRecipeSortOption(value: unknown): value is RecipeSortOption {
  return typeof value === 'string' && (RECIPE_SORT_OPTIONS as readonly string[]).includes(value);
}

export function isRecipeViewMode(value: unknown): value is RecipeViewMode {
  return typeof value === 'string' && (RECIPE_VIEW_MODES as readonly string[]).includes(value);
}

/** Map the legacy alias and drop anything that is not a known filter, deduped. */
export function normalizeQuickFilters(values: readonly unknown[] | null | undefined): RecipeQuickFilter[] {
  const out: RecipeQuickFilter[] = [];
  for (const raw of values ?? []) {
    const v = raw === 'kid-approved' ? 'safe-foods' : raw;
    if (typeof v !== 'string') continue;
    if (!(RECIPE_QUICK_FILTERS as readonly string[]).includes(v)) continue;
    const filter = v as RecipeQuickFilter;
    if (!out.includes(filter)) out.push(filter);
  }
  return out;
}

/**
 * Total time in minutes: total_time_minutes when set, else prep + cook parsed
 * from free text ("1 hour", "25 min"), else null. parseInt read "1 hour" as 1.
 */
export function totalMinutes(recipe: Pick<Recipe, 'total_time_minutes' | 'prepTime' | 'cookTime'>): number | null {
  if (typeof recipe.total_time_minutes === 'number' && recipe.total_time_minutes > 0) {
    return recipe.total_time_minutes;
  }
  const prep = parseDurationMinutes(recipe.prepTime);
  const cook = parseDurationMinutes(recipe.cookTime);
  if (prep == null && cook == null) return null;
  const total = (prep ?? 0) + (cook ?? 0);
  return total > 0 ? total : null;
}

const isOptionalRow = (notes: string | null | undefined): boolean => /\boptional\b/i.test(notes ?? '');

/**
 * Everything the recipe needs is in the pantry: at least one ingredient, every
 * linked food resolves with quantity > 0, and no required ingredient is a
 * free-text row we cannot check. An import nothing matched is not ready.
 */
export function isReadyToCook(
  recipe: Pick<Recipe, 'food_ids' | 'recipe_ingredients'>,
  foodById: ReadonlyMap<string, Food>,
): boolean {
  const rows = recipe.recipe_ingredients ?? [];
  const ids = new Set(recipe.food_ids ?? []);
  for (const row of rows) {
    if (row.food_id) ids.add(row.food_id);
    else if (!isOptionalRow(row.optional_notes)) return false;
  }
  if (ids.size === 0 && rows.length === 0) return false;
  for (const id of ids) {
    const food = foodById.get(id);
    if (!food || (food.quantity ?? 0) <= 0) return false;
  }
  return true;
}

const GROUP_RANK: Record<FitGroup, number> = { safe: 0, trying: 1, other: 2 };

function bestAcceptance(fit: ItemFit | undefined): number {
  if (!fit || fit.perKid.length === 0) return 0;
  return fit.perKid.reduce((m, h) => Math.max(m, fitAcceptanceWeight(h.fit)), 0);
}

function localDateKey(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

interface UseRecipeFiltersOptions {
  recipes: Recipe[];
  foods: Food[];
  kids?: Kid[];
  /** Plan history, for try counts and "kids eat most". */
  planEntries?: PlanEntry[];
  /** Score against one kid, or every kid ('all', the default). */
  worksFor?: string | 'all';
  /** Starting quick filters, e.g. from a URL or older persisted state. */
  initialQuickFilters?: readonly unknown[];
}

export function useRecipeFilters({
  recipes,
  foods,
  kids = EMPTY_KIDS,
  planEntries = EMPTY_ENTRIES,
  worksFor = 'all',
  initialQuickFilters,
}: UseRecipeFiltersOptions) {
  const [searchQuery, setSearchQuery] = useState('');
  const [storedSort, setStoredSort] = useLocalStorage<string | null>('recipe-sort', null);
  const [storedView, setStoredView] = useLocalStorage<string>('recipe-view', 'grid');
  const [quickFilters, setQuickFilters] = useState<RecipeQuickFilter[]>(() =>
    normalizeQuickFilters(initialQuickFilters),
  );

  const hasKids = kids.length > 0;
  const sortBy: RecipeSortOption =
    storedSort == null ? (hasKids ? 'best-fit' : 'newest') : isRecipeSortOption(storedSort) ? storedSort : 'newest';
  const viewMode: RecipeViewMode = isRecipeViewMode(storedView) ? storedView : 'grid';

  const setSortBy = useCallback((sort: RecipeSortOption) => setStoredSort(sort), [setStoredSort]);
  const setViewMode = useCallback((mode: RecipeViewMode) => setStoredView(mode), [setStoredView]);

  // Clearing the box shows everything at once instead of 300ms later.
  const debounced = useDebounce(searchQuery, 300);
  const debouncedSearch = searchQuery === '' ? '' : debounced;

  const foodById = useMemo(() => new Map(foods.map((f) => [f.id, f] as const)), [foods]);

  const targetKids = useMemo(() => {
    if (worksFor === 'all') return kids;
    const one = kids.filter((k) => k.id === worksFor);
    return one.length > 0 ? one : kids;
  }, [kids, worksFor]);

  const fitByRecipeId = useMemo(
    () => buildRecipeFits(recipes, targetKids, foodById, planEntries, localDateKey()),
    [recipes, targetKids, foodById, planEntries],
  );

  const toggleQuickFilter = useCallback((filter: RecipeQuickFilter) => {
    const f: RecipeQuickFilter = filter === 'kid-approved' ? 'safe-foods' : filter;
    setQuickFilters((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }, []);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setQuickFilters([]);
  }, []);

  const filteredAndSorted = useMemo(() => {
    let result = [...recipes];
    const search = debouncedSearch.toLowerCase().trim();

    if (search) {
      result = result.filter((recipe) => {
        if (recipe.name.toLowerCase().includes(search)) return true;
        if (recipe.description?.toLowerCase().includes(search)) return true;
        if (recipe.tags?.some((tag) => tag.toLowerCase().includes(search))) return true;
        if ((recipe.food_ids ?? []).some((id) => foodById.get(id)?.name.toLowerCase().includes(search))) {
          return true;
        }
        if (recipe.recipe_ingredients?.some((row) => (row.name ?? '').toLowerCase().includes(search))) {
          return true;
        }
        return false;
      });
    }

    const active = new Set(normalizeQuickFilters(quickFilters));
    const fit = (r: Recipe) => fitByRecipeId.get(r.id);

    if (active.has('favorites')) result = result.filter((r) => r.is_favorite);
    if (active.has('ready-to-cook')) result = result.filter((r) => isReadyToCook(r, foodById));
    if (active.has('quick')) {
      result = result.filter((r) => {
        const m = totalMinutes(r);
        return m != null && m <= QUICK_MINUTES;
      });
    }
    if (active.has('allergen-safe')) result = result.filter((r) => fit(r)?.allergenStatus === 'safe');
    if (active.has('no-dislikes')) result = result.filter((r) => (fit(r)?.dislikeKids.length ?? 0) === 0);
    if (active.has('safe-foods')) result = result.filter((r) => fit(r)?.safeForAll === true);
    if (active.has('try-bite')) result = result.filter((r) => fit(r)?.trying === true);

    const byName = (a: Recipe, b: Recipe) => a.name.localeCompare(b.name);

    result.sort((a, b) => {
      switch (sortBy) {
        case 'best-fit': {
          const fa = fit(a);
          const fb = fit(b);
          const ga = fa ? GROUP_RANK[fitGroup(fa)] : GROUP_RANK.other;
          const gb = fb ? GROUP_RANK[fitGroup(fb)] : GROUP_RANK.other;
          return ga - gb || byName(a, b);
        }
        case 'kids-eat-most': {
          const fa = fit(a);
          const fb = fit(b);
          const ha = Number(fa?.allergenStatus === 'hit');
          const hb = Number(fb?.allergenStatus === 'hit');
          return (
            ha - hb ||
            bestAcceptance(fb) - bestAcceptance(fa) ||
            (fb?.tries ?? 0) - (fa?.tries ?? 0) ||
            byName(a, b)
          );
        }
        case 'newest':
          return (b.created_at ?? '').localeCompare(a.created_at ?? '');
        case 'a-z':
          return byName(a, b);
        case 'rating':
          return (b.rating ?? 0) - (a.rating ?? 0);
        case 'cook-time': {
          const ta = totalMinutes(a);
          const tb = totalMinutes(b);
          if (ta == null && tb == null) return byName(a, b);
          if (ta == null) return 1;
          if (tb == null) return -1;
          return ta - tb || byName(a, b);
        }
        case 'difficulty': {
          const order = { easy: 0, medium: 1, hard: 2 };
          return (order[a.difficulty_level ?? 'medium'] ?? 1) - (order[b.difficulty_level ?? 'medium'] ?? 1);
        }
        case 'times-made':
          return (b.times_made ?? 0) - (a.times_made ?? 0);
        case 'recently-made':
          return (b.last_made_date ?? '').localeCompare(a.last_made_date ?? '');
        default:
          return 0;
      }
    });

    return result;
  }, [recipes, debouncedSearch, sortBy, quickFilters, foodById, fitByRecipeId]);

  const hasActiveFilters = debouncedSearch.trim().length > 0 || quickFilters.length > 0;

  return {
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    viewMode,
    setViewMode,
    quickFilters,
    toggleQuickFilter,
    clearFilters,
    filteredRecipes: filteredAndSorted,
    resultCount: filteredAndSorted.length,
    totalCount: recipes.length,
    hasActiveFilters,
    foodById,
    fitByRecipeId,
  };
}
