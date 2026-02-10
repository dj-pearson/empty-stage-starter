import { useMemo, useState } from 'react';
import { useDebounce } from './useDebounce';
import { useLocalStorage } from './useLocalStorage';
import { Recipe, Food } from '@/types';

export type RecipeSortOption =
  | 'newest'
  | 'a-z'
  | 'rating'
  | 'cook-time'
  | 'difficulty'
  | 'times-made'
  | 'recently-made';

export type RecipeViewMode = 'grid' | 'list';

export type RecipeQuickFilter = 'favorites' | 'ready-to-cook' | 'quick' | 'kid-approved';

interface UseRecipeFiltersOptions {
  recipes: Recipe[];
  foods: Food[];
}

export function useRecipeFilters({ recipes, foods }: UseRecipeFiltersOptions) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useLocalStorage<RecipeSortOption>('recipe-sort', 'newest');
  const [viewMode, setViewMode] = useLocalStorage<RecipeViewMode>('recipe-view', 'grid');
  const [quickFilters, setQuickFilters] = useState<RecipeQuickFilter[]>([]);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // Build a food name lookup for ingredient search
  const foodNameMap = useMemo(() => {
    const map = new Map<string, string>();
    foods.forEach(f => map.set(f.id, f.name.toLowerCase()));
    return map;
  }, [foods]);

  const toggleQuickFilter = (filter: RecipeQuickFilter) => {
    setQuickFilters(prev =>
      prev.includes(filter) ? prev.filter(f => f !== filter) : [...prev, filter]
    );
  };

  const clearFilters = () => {
    setSearchQuery('');
    setQuickFilters([]);
  };

  const filteredAndSorted = useMemo(() => {
    let result = [...recipes];
    const search = debouncedSearch.toLowerCase().trim();

    // Search filter
    if (search) {
      result = result.filter(recipe => {
        if (recipe.name.toLowerCase().includes(search)) return true;
        if (recipe.description?.toLowerCase().includes(search)) return true;
        if (recipe.tags?.some(tag => tag.toLowerCase().includes(search))) return true;
        // Search ingredient names
        if (recipe.food_ids.some(id => foodNameMap.get(id)?.includes(search))) return true;
        return false;
      });
    }

    // Quick filters
    if (quickFilters.includes('favorites')) {
      result = result.filter(r => r.is_favorite);
    }
    if (quickFilters.includes('ready-to-cook')) {
      result = result.filter(recipe => {
        const recipeFoods = recipe.food_ids.map(id => foods.find(f => f.id === id)).filter(Boolean);
        return recipeFoods.every(food => food && (food.quantity ?? 0) > 0);
      });
    }
    if (quickFilters.includes('quick')) {
      result = result.filter(recipe => {
        const totalTime = recipe.total_time_minutes ||
          (parseInt(recipe.prepTime || '0') + parseInt(recipe.cookTime || '0'));
        return totalTime > 0 && totalTime <= 30;
      });
    }
    if (quickFilters.includes('kid-approved')) {
      result = result.filter(r => (r.rating ?? 0) >= 4);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return (b.created_at ?? '').localeCompare(a.created_at ?? '');
        case 'a-z':
          return a.name.localeCompare(b.name);
        case 'rating':
          return (b.rating ?? 0) - (a.rating ?? 0);
        case 'cook-time': {
          const timeA = a.total_time_minutes || (parseInt(a.prepTime || '0') + parseInt(a.cookTime || '0'));
          const timeB = b.total_time_minutes || (parseInt(b.prepTime || '0') + parseInt(b.cookTime || '0'));
          return timeA - timeB;
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
  }, [recipes, debouncedSearch, sortBy, quickFilters, foodNameMap, foods]);

  const hasActiveFilters = searchQuery.length > 0 || quickFilters.length > 0;

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
  };
}
