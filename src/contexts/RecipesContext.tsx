import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Recipe, RecipeIngredient } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { generateId } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { useAuth } from "./AuthContext";
import type { Database } from "@/integrations/supabase/types";

type RecipeRow = Database['public']['Tables']['recipes']['Row'];

/**
 * Joined select string for `recipes` queries that need ingredient data.
 * US-281: every recipe-fetch path uses this so `recipe.recipe_ingredients`
 * is hydrated and downstream consumers (US-284 missing-ingredient prompt,
 * grocery-from-recipe, scaling) don't need a follow-up round trip.
 *
 * String-typed because the generated `Database` types are stale on the
 * `recipe_ingredients` table (lists `ingredient_name` etc. while the live
 * schema uses `name`, `group_label`, `optional_notes`). Run
 * `supabase gen types typescript --local > src/integrations/supabase/types.ts`
 * after the next migration to sync them.
 */
export const RECIPE_WITH_INGREDIENTS_SELECT =
  '*, recipe_ingredients(id, recipe_id, food_id, sort_order, name, quantity, unit, group_label, optional_notes, created_at)';

/** Loose row shape with optionally joined ingredients. */
type RecipeRowWithIngredients = RecipeRow & {
  recipe_ingredients?: RecipeIngredient[] | null;
};

/** Map snake_case DB row to camelCase Recipe type */
export function normalizeRecipeFromDB(r: RecipeRow | RecipeRowWithIngredients): Recipe {
  const ingredients = ((r as RecipeRowWithIngredients).recipe_ingredients ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    food_ids: r.food_ids ?? [],
    category: r.category ?? undefined,
    instructions: r.instructions ?? undefined,
    prepTime: r.prep_time ?? undefined,
    cookTime: r.cook_time ?? undefined,
    servings: r.servings ?? undefined,
    additionalIngredients: r.additional_ingredients ?? undefined,
    tips: r.tips ?? undefined,
    assigned_kid_ids: r.assigned_kid_ids ?? undefined,
    image_url: r.image_url ?? undefined,
    source_url: r.source_url ?? undefined,
    source_type: r.source_type ?? undefined,
    tags: r.tags ?? undefined,
    rating: r.rating ?? undefined,
    times_made: r.times_made ?? undefined,
    last_made_date: r.last_made_date ?? undefined,
    total_time_minutes: r.total_time_minutes ?? undefined,
    difficulty_level: r.difficulty_level ?? undefined,
    kid_friendly_score: r.kid_friendly_score ?? undefined,
    is_favorite: r.is_favorite ?? false,
    created_at: r.created_at ?? undefined,
    nutrition_info: r.nutrition_info ?? undefined,
    parent_recipe_id:
      (r as RecipeRow & { parent_recipe_id?: string | null }).parent_recipe_id ?? undefined,
    variant_kind:
      (r as RecipeRow & { variant_kind?: string | null }).variant_kind ?? undefined,
    recipe_ingredients: ingredients,
  };
}

interface RecipesContextType {
  recipes: Recipe[];
  setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>;
  addRecipe: (recipe: Omit<Recipe, "id">) => Promise<Recipe>;
  updateRecipe: (id: string, recipe: Partial<Recipe>) => void;
  deleteRecipe: (id: string) => void;
  refreshRecipes: () => Promise<void>;
}

const RecipesContext = createContext<RecipesContextType | undefined>(undefined);

export function RecipesProvider({ children }: { children: React.ReactNode }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const { userId, householdId } = useAuth();

  const addRecipe = useCallback(async (recipe: Omit<Recipe, "id">): Promise<Recipe> => {
    if (userId) {
      const dbPayload: Record<string, unknown> = {
        name: recipe.name,
        description: recipe.description,
        food_ids: recipe.food_ids,
        category: recipe.category,
        instructions: recipe.instructions ?? recipe.tips,
        prep_time: recipe.prepTime,
        cook_time: recipe.cookTime,
        servings: recipe.servings,
        image_url: recipe.image_url,
        source_url: recipe.source_url,
        source_type: recipe.source_type,
        tags: recipe.tags,
        rating: recipe.rating,
        times_made: recipe.times_made,
        last_made_date: recipe.last_made_date,
        total_time_minutes: recipe.total_time_minutes,
        difficulty_level: recipe.difficulty_level,
        kid_friendly_score: recipe.kid_friendly_score,
        nutrition_info: recipe.nutrition_info,
        tips: recipe.tips,
        additional_ingredients: recipe.additionalIngredients,
        parent_recipe_id: recipe.parent_recipe_id,
        variant_kind: recipe.variant_kind,
        user_id: userId,
        household_id: householdId || undefined,
      };
      Object.keys(dbPayload).forEach((k) => {
        if (dbPayload[k] === undefined) delete dbPayload[k];
      });

      let { data, error } = await supabase.from('recipes').insert([dbPayload]).select().single();

      if (error) {
        const corePayload: Record<string, unknown> = {
          name: dbPayload.name, description: dbPayload.description,
          food_ids: dbPayload.food_ids ?? [], instructions: dbPayload.instructions,
          prep_time: dbPayload.prep_time, cook_time: dbPayload.cook_time,
          servings: dbPayload.servings, tips: dbPayload.tips,
          additional_ingredients: dbPayload.additional_ingredients,
          user_id: userId, household_id: householdId || undefined,
        };
        Object.keys(corePayload).forEach((k) => {
          if (corePayload[k] === undefined) delete corePayload[k];
        });

        const retry = await supabase.from('recipes').insert([corePayload]).select().single();
        if (retry.error) {
          logger.error('Supabase addRecipe retry failed:', retry.error);
          throw new Error(`Database error: ${retry.error.message}`);
        }
        data = retry.data;
        error = null;
      }

      if (error) throw new Error(`Database error: ${error.message}`);
      if (data) {
        const newRecipe = normalizeRecipeFromDB(data);
        setRecipes(prev => [...prev, newRecipe]);
        return newRecipe;
      }
      throw new Error('Failed to add recipe');
    } else {
      const localRecipe: Recipe = { ...recipe, id: generateId() } as Recipe;
      setRecipes(prev => [...prev, localRecipe]);
      return localRecipe;
    }
  }, [userId, householdId]);

  const updateRecipe = useCallback((id: string, updates: Partial<Recipe>) => {
    if (userId) {
      const dbUpdates: Record<string, unknown> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.food_ids !== undefined) dbUpdates.food_ids = updates.food_ids;
      if (updates.category !== undefined) dbUpdates.category = updates.category;
      if (updates.instructions !== undefined || updates.tips !== undefined) {
        dbUpdates.instructions = updates.instructions ?? updates.tips;
      }
      if (updates.prepTime !== undefined) dbUpdates.prep_time = updates.prepTime;
      if (updates.cookTime !== undefined) dbUpdates.cook_time = updates.cookTime;
      if (updates.servings !== undefined) dbUpdates.servings = updates.servings;
      if (updates.image_url !== undefined) dbUpdates.image_url = updates.image_url;
      if (updates.source_url !== undefined) dbUpdates.source_url = updates.source_url;
      if (updates.source_type !== undefined) dbUpdates.source_type = updates.source_type;
      if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
      if (updates.rating !== undefined) dbUpdates.rating = updates.rating;
      if (updates.times_made !== undefined) dbUpdates.times_made = updates.times_made;
      if (updates.last_made_date !== undefined) dbUpdates.last_made_date = updates.last_made_date;
      if (updates.total_time_minutes !== undefined) dbUpdates.total_time_minutes = updates.total_time_minutes;
      if (updates.difficulty_level !== undefined) dbUpdates.difficulty_level = updates.difficulty_level;
      if (updates.kid_friendly_score !== undefined) dbUpdates.kid_friendly_score = updates.kid_friendly_score;
      if (updates.nutrition_info !== undefined) dbUpdates.nutrition_info = updates.nutrition_info;
      if (updates.tips !== undefined) dbUpdates.tips = updates.tips;
      if (updates.additionalIngredients !== undefined) dbUpdates.additional_ingredients = updates.additionalIngredients;

      supabase.from('recipes').update(dbUpdates).eq('id', id)
        .then(({ error }) => {
          if (error) logger.error('Supabase updateRecipe error:', error);
          setRecipes(prev => prev.map(r => (r.id === id ? { ...r, ...updates } : r)));
        });
    } else {
      setRecipes(prev => prev.map(r => (r.id === id ? { ...r, ...updates } : r)));
    }
  }, [userId]);

  const deleteRecipe = useCallback((id: string) => {
    if (userId) {
      supabase.from('recipes').delete().eq('id', id)
        .then(({ error }) => {
          if (error) logger.error('Supabase deleteRecipe error:', error);
          setRecipes(prev => prev.filter(r => r.id !== id));
        });
    } else {
      setRecipes(prev => prev.filter(r => r.id !== id));
    }
  }, [userId]);

  const refreshRecipes = useCallback(async () => {
    if (userId) {
      const { data } = await supabase
        .from('recipes')
        .select(RECIPE_WITH_INGREDIENTS_SELECT)
        .order('created_at', { ascending: true });
      if (data) setRecipes((data as unknown[]).map((r) => normalizeRecipeFromDB(r as RecipeRowWithIngredients)));
    }
  }, [userId]);

  const value = useMemo(() => ({
    recipes, setRecipes, addRecipe, updateRecipe, deleteRecipe, refreshRecipes
  }), [recipes, addRecipe, updateRecipe, deleteRecipe, refreshRecipes]);

  return (
    <RecipesContext.Provider value={value}>
      {children}
    </RecipesContext.Provider>
  );
}

export function useRecipes() {
  const context = useContext(RecipesContext);
  if (!context) throw new Error("useRecipes must be used within RecipesProvider");
  return context;
}
