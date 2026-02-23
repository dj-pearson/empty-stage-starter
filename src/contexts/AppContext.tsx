import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { Food, Kid, PlanEntry, GroceryItem, Recipe } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { generateId, debounce } from "@/lib/utils";
import { getStorage } from "@/lib/platform";
import { logger } from "@/lib/logger";
import type { Database } from "@/integrations/supabase/types";

type RecipeRow = Database['public']['Tables']['recipes']['Row'];
type RecipeInsert = Database['public']['Tables']['recipes']['Insert'];

/** Shape of a Supabase real-time payload for postgres changes */
interface RealtimePayload<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: T;
}

interface AppContextType {
  foods: Food[];
  kids: Kid[];
  recipes: Recipe[];
  activeKidId: string | null;
  planEntries: PlanEntry[];
  groceryItems: GroceryItem[];
  addFood: (food: Omit<Food, "id">) => void;
  updateFood: (id: string, food: Partial<Food>) => void;
  deleteFood: (id: string) => void;
  addKid: (kid: Omit<Kid, "id">) => void;
  updateKid: (id: string, kid: Partial<Kid>) => void;
  deleteKid: (id: string) => void;
  setActiveKid: (id: string | null) => void;
  setActiveKidId: (id: string | null) => void;
  addRecipe: (recipe: Omit<Recipe, "id">) => Promise<Recipe>;
  updateRecipe: (id: string, recipe: Partial<Recipe>) => void;
  deleteRecipe: (id: string) => void;
  setPlanEntries: (entries: PlanEntry[]) => void;
  addPlanEntry: (entry: Omit<PlanEntry, "id">) => void;
  addPlanEntries: (entries: Omit<PlanEntry, "id">[]) => void;
  updatePlanEntry: (id: string, updates: Partial<PlanEntry>) => void;
  setGroceryItems: (items: GroceryItem[]) => void;
  addGroceryItem: (item: Omit<GroceryItem, "id" | "checked">) => void;
  toggleGroceryItem: (id: string) => void;
  updateGroceryItem: (id: string, updates: Partial<GroceryItem>) => void;
  deleteGroceryItem: (id: string) => void;
  deleteGroceryItems: (ids: string[]) => void;
  clearCheckedGroceryItems: () => void;
  exportData: () => string;
  importData: (jsonData: string) => void;
  resetAllData: () => void;
  // Bulk operations
  addFoods: (foods: Omit<Food, "id">[]) => Promise<void>;
  updateFoods: (updates: { id: string; updates: Partial<Food> }[]) => Promise<void>;
  deleteFoods: (ids: string[]) => Promise<void>;
  // Week operations for meal planner
  copyWeekPlan: (fromDate: string, toDate: string, kidId: string) => Promise<void>;
  deleteWeekPlan: (weekStart: string, kidId: string) => Promise<void>;
  // Refresh functions
  refreshFoods?: () => Promise<void>;
  refreshRecipes?: () => Promise<void>;
  refreshKids?: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY = "kid-meal-planner";

/** Map snake_case DB row to camelCase Recipe type */
function normalizeRecipeFromDB(r: RecipeRow): Recipe {
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
  };
}

const STARTER_FOODS: Omit<Food, "id">[] = [
  { name: "Chicken Nuggets", category: "protein", is_safe: true, is_try_bite: false },
  { name: "Mac & Cheese", category: "carb", is_safe: true, is_try_bite: false },
  { name: "Pizza", category: "carb", is_safe: true, is_try_bite: false },
  { name: "Yogurt", category: "dairy", is_safe: true, is_try_bite: false },
  { name: "Apple Slices", category: "fruit", is_safe: true, is_try_bite: false },
  { name: "Banana", category: "fruit", is_safe: true, is_try_bite: false },
  { name: "Goldfish Crackers", category: "snack", is_safe: true, is_try_bite: false },
  { name: "String Cheese", category: "dairy", is_safe: true, is_try_bite: false },
  { name: "Grapes", category: "fruit", is_safe: true, is_try_bite: false },
  { name: "Carrots", category: "vegetable", is_safe: true, is_try_bite: false },
  { name: "Broccoli", category: "vegetable", is_safe: false, is_try_bite: true },
  { name: "Strawberries", category: "fruit", is_safe: false, is_try_bite: true },
  { name: "Hummus", category: "protein", is_safe: false, is_try_bite: true },
  { name: "Avocado", category: "vegetable", is_safe: false, is_try_bite: true },
  { name: "Turkey Slices", category: "protein", is_safe: false, is_try_bite: true },
];

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [foods, setFoods] = useState<Food[]>([]);
  const [kids, setKids] = useState<Kid[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [activeKidId, setActiveKidId] = useState<string | null>(null);
  const [planEntries, setPlanEntriesState] = useState<PlanEntry[]>([]);
  const [groceryItems, setGroceryItemsState] = useState<GroceryItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);

  // Performance: Prevent duplicate data loading
  const loadingRef = useRef(false);

  // Load from storage on mount (platform-aware)
  useEffect(() => {
    const loadData = async () => {
      try {
        const storage = await getStorage();
        const stored = await storage.getItem(STORAGE_KEY);
        if (stored) {
          const data = JSON.parse(stored);
          setFoods(data.foods || []);
          setKids(data.kids || []);
          setRecipes(data.recipes || []);
          setActiveKidId(data.activeKidId || (data.kids?.[0]?.id ?? null));
          setPlanEntriesState(data.planEntries || []);
          setGroceryItemsState(data.groceryItems || []);
        } else {
          // Initialize with starter data
          const starterFoods = STARTER_FOODS.map(f => ({ ...f, id: generateId() }));
          setFoods(starterFoods);
          const defaultKid = { id: generateId(), name: "My Child", age: 5 };
          setKids([defaultKid]);
          setActiveKidId(defaultKid.id);
        }
      } catch (error) {
        logger.error("Error loading data from storage:", error);
        // Initialize with starter data on error
        const starterFoods = STARTER_FOODS.map(f => ({ ...f, id: generateId() }));
        setFoods(starterFoods);
        const defaultKid = { id: generateId(), name: "My Child", age: 5 };
        setKids([defaultKid]);
        setActiveKidId(defaultKid.id);
      }
    };
    loadData();
  }, []);

  // Save to storage whenever data changes (platform-aware)
  useEffect(() => {
    const saveData = async () => {
      try {
        const storage = await getStorage();
        await storage.setItem(
          STORAGE_KEY,
          JSON.stringify({ foods, kids, recipes, activeKidId, planEntries, groceryItems })
        );
      } catch (error) {
        logger.error("Error saving data to storage:", error);
      }
    };
    saveData();
  }, [foods, kids, recipes, activeKidId, planEntries, groceryItems]);

  // Sync with Supabase auth and fetch household/kids when logged in
  useEffect(() => {
    let mounted = true;

    const loadAuthAndData = async () => {
      // Performance: Prevent duplicate loading
      if (loadingRef.current) {
        logger.debug('Data loading already in progress, skipping duplicate request');
        return;
      }

      loadingRef.current = true;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id ?? null;
        setUserId(uid);

        if (uid) {
          // Get household id
          const { data: hh } = await supabase.rpc('get_user_household_id', { _user_id: uid });
          const hhId = (hh as string) ?? null;
          if (mounted) setHouseholdId(hhId);

          // Performance: Only load plan entries from last 30 days and next 90 days
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          const ninetyDaysFromNow = new Date();
          ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

          // Load all data from DB with performance optimizations
          const [kidsRes, foodsRes, recipesRes, planRes, groceryRes] = await Promise.all([
            // Performance: Add explicit household filter to help query planner
            hhId
              ? supabase.from('kids').select('*').eq('household_id', hhId).order('created_at', { ascending: true })
              : supabase.from('kids').select('*').order('created_at', { ascending: true }),
            hhId
              ? supabase.from('foods').select('*').eq('household_id', hhId).order('name', { ascending: true })
              : supabase.from('foods').select('*').order('name', { ascending: true }),
            hhId
              ? supabase.from('recipes').select('*').eq('household_id', hhId).order('created_at', { ascending: true })
              : supabase.from('recipes').select('*').order('created_at', { ascending: true }),
            // Performance: Only load recent and upcoming plan entries (reduces 90% of data)
            hhId
              ? supabase.from('plan_entries')
                  .select('*')
                  .eq('household_id', hhId)
                  .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
                  .lte('date', ninetyDaysFromNow.toISOString().split('T')[0])
                  .order('date', { ascending: true })
              : supabase.from('plan_entries')
                  .select('*')
                  .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
                  .lte('date', ninetyDaysFromNow.toISOString().split('T')[0])
                  .order('date', { ascending: true }),
            hhId
              ? supabase.from('grocery_items').select('*').eq('household_id', hhId).order('created_at', { ascending: true })
              : supabase.from('grocery_items').select('*').order('created_at', { ascending: true })
          ]);

          if (mounted) {
            if (kidsRes.data) {
              setKids(kidsRes.data as unknown as Kid[]);
              // Default to Family view (null) instead of first kid
              setActiveKidId(null);
            }
            if (foodsRes.data) setFoods(foodsRes.data as unknown as Food[]);
            if (recipesRes.data) setRecipes(recipesRes.data.map(normalizeRecipeFromDB));
            if (planRes.data) setPlanEntriesState(planRes.data as unknown as PlanEntry[]);
            if (groceryRes.data) setGroceryItemsState(groceryRes.data as unknown as GroceryItem[]);
          }
        }
      } finally {
        loadingRef.current = false;
      }
    };

    loadAuthAndData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);

      if (uid) {
        supabase.rpc('get_user_household_id', { _user_id: uid }).then(({ data }) => {
          const hhId = (data as string) ?? null;
          if (mounted) setHouseholdId(hhId);

          // Reload all data
          Promise.all([
            supabase.from('kids').select('*').order('created_at', { ascending: true }),
            supabase.from('foods').select('*').order('name', { ascending: true }),
            supabase.from('recipes').select('*').order('created_at', { ascending: true }),
            supabase.from('plan_entries').select('*').order('date', { ascending: true }),
            supabase.from('grocery_items').select('*').order('created_at', { ascending: true })
          ]).then(async ([kidsRes, foodsRes, recipesRes, planRes, groceryRes]) => {
            if (mounted) {
              if (kidsRes.data) {
                setKids(kidsRes.data as unknown as Kid[]);
                // Default to Family view (null) instead of first kid
                setActiveKidId(null);
              }
              if (foodsRes.data) setFoods(foodsRes.data as unknown as Food[]);
              
              // Check for local recipes and migrate them
              if (recipesRes.data) {
                const dbRecipes = recipesRes.data.map(normalizeRecipeFromDB);
                const localData = localStorage.getItem(STORAGE_KEY);
                
                if (localData) {
                  try {
                    const parsed = JSON.parse(localData);
                    const localRecipes = parsed.recipes || [];
                    
                    // Find recipes that exist locally but not in DB (local IDs are not UUIDs)
                    const localOnlyRecipes = localRecipes.filter((lr: Recipe) => 
                      !dbRecipes.some(dr => dr.id === lr.id) && 
                      !lr.id.includes('-') // Local IDs don't have dashes
                    );
                    
                    // Migrate local recipes to database
                    if (localOnlyRecipes.length > 0) {
                      logger.debug(`Migrating ${localOnlyRecipes.length} local recipes to database...`);
                      for (const localRecipe of localOnlyRecipes) {
                        const { id, ...recipeData } = localRecipe;
                        const dbPayload: Partial<RecipeInsert> = {
                          name: recipeData.name,
                          description: recipeData.description,
                          food_ids: recipeData.food_ids,
                          category: recipeData.category,
                          instructions: recipeData.instructions ?? recipeData.tips,
                          prep_time: recipeData.prepTime,
                          cook_time: recipeData.cookTime,
                          servings: recipeData.servings,
                          user_id: uid,
                          household_id: hhId || undefined,
                        };
                        Object.keys(dbPayload).forEach((k) => {
                          const key = k as keyof typeof dbPayload;
                          if (dbPayload[key] === undefined) delete dbPayload[key];
                        });
                        await supabase.from('recipes').insert([dbPayload]);
                      }
                      
                      // Reload recipes after migration
                      const { data: updatedRecipes } = await supabase
                        .from('recipes')
                        .select('*')
                        .order('created_at', { ascending: true });
                      
                      if (updatedRecipes) {
                        setRecipes(updatedRecipes.map(normalizeRecipeFromDB));
                      }
                    } else {
                      setRecipes(dbRecipes);
                    }
                  } catch (e) {
                    logger.error('Error migrating recipes:', e);
                    setRecipes(dbRecipes);
                  }
                } else {
                  setRecipes(dbRecipes);
                }
              }
              
              if (planRes.data) setPlanEntriesState(planRes.data as unknown as PlanEntry[]);
              if (groceryRes.data) setGroceryItemsState(groceryRes.data as unknown as GroceryItem[]);
            }
          }).catch((error) => {
            logger.error('Failed to load user data after auth state change:', error);
          });
        }).catch((error) => {
          logger.error('Failed to get household ID after auth state change:', error);
        });
      } else {
        if (mounted) setHouseholdId(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Real-time subscription for grocery_items
  useEffect(() => {
    if (!userId || !householdId) return;

    // Performance: Debounce real-time updates to prevent render thrashing
    const debouncedUpdate = debounce((payload: RealtimePayload<GroceryItem>) => {
      logger.debug('Grocery item changed:', payload);

      if (payload.eventType === 'INSERT') {
        setGroceryItemsState(prev => {
          // Avoid duplicates
          const exists = prev.some(item => item.id === payload.new.id);
          if (exists) return prev;
          return [...prev, payload.new];
        });
      } else if (payload.eventType === 'UPDATE') {
        setGroceryItemsState(prev =>
          prev.map(item =>
            item.id === payload.new.id ? payload.new : item
          )
        );
      } else if (payload.eventType === 'DELETE') {
        setGroceryItemsState(prev =>
          prev.filter(item => item.id !== payload.old.id)
        );
      }
    }, 300); // 300ms debounce prevents excessive updates

    const channel = supabase
      .channel('grocery_items_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'grocery_items',
          filter: `household_id=eq.${householdId}`
        },
        debouncedUpdate
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, householdId]);

  // Real-time subscription for plan_entries
  useEffect(() => {
    if (!userId || !householdId) return;

    // Performance: Debounce real-time updates to prevent render thrashing
    const debouncedUpdate = debounce((payload: RealtimePayload<PlanEntry>) => {
      logger.debug('Plan entry changed:', payload);

      if (payload.eventType === 'INSERT') {
        setPlanEntriesState(prev => {
          // Avoid duplicates
          const exists = prev.some(entry => entry.id === payload.new.id);
          if (exists) return prev;
          return [...prev, payload.new];
        });
      } else if (payload.eventType === 'UPDATE') {
        setPlanEntriesState(prev =>
          prev.map(entry =>
            entry.id === payload.new.id ? payload.new : entry
          )
        );
      } else if (payload.eventType === 'DELETE') {
        setPlanEntriesState(prev =>
          prev.filter(entry => entry.id !== payload.old.id)
        );
      }
    }, 300); // 300ms debounce prevents excessive updates

    const channel = supabase
      .channel('plan_entries_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'plan_entries',
          filter: `household_id=eq.${householdId}`
        },
        debouncedUpdate
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, householdId]);

  // Real-time subscription for kids
  useEffect(() => {
    if (!userId || !householdId) return;

    // Performance: Debounce real-time updates to prevent render thrashing
    const debouncedUpdate = debounce((payload: RealtimePayload<Kid>) => {
      logger.debug('Kid profile changed:', payload);

      if (payload.eventType === 'INSERT') {
        setKids(prev => {
          // Avoid duplicates
          const exists = prev.some(kid => kid.id === payload.new.id);
          if (exists) return prev;
          return [...prev, payload.new];
        });
      } else if (payload.eventType === 'UPDATE') {
        setKids(prev =>
          prev.map(kid =>
            kid.id === payload.new.id ? payload.new : kid
          )
        );
      } else if (payload.eventType === 'DELETE') {
        setKids(prev =>
          prev.filter(kid => kid.id !== payload.old.id)
        );
      }
    }, 300); // 300ms debounce prevents excessive updates

    const channel = supabase
      .channel('kids_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kids',
          filter: `household_id=eq.${householdId}`
        },
        debouncedUpdate
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, householdId]);

  const addFood = (food: Omit<Food, "id">) => {
    if (userId && householdId) {
      supabase
        .from('foods')
        .insert([{ ...food, user_id: userId, household_id: householdId }])
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) {
            logger.error('Supabase addFood error:', error);
            setFoods([...foods, { ...food, id: generateId() }]);
          } else if (data) {
            setFoods([...foods, data as unknown as Food]);
          }
        });
    } else {
      setFoods([...foods, { ...food, id: generateId() }]);
    }
  };

  const updateFood = (id: string, updates: Partial<Food>) => {
    if (userId) {
      supabase
        .from('foods')
        .update(updates)
        .eq('id', id)
        .then(({ error }) => {
          if (error) logger.error('Supabase updateFood error:', error);
          setFoods(foods.map(f => (f.id === id ? { ...f, ...updates } : f)));
        });
    } else {
      setFoods(foods.map(f => (f.id === id ? { ...f, ...updates } : f)));
    }
  };

  const deleteFood = (id: string) => {
    if (userId) {
      supabase
        .from('foods')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) logger.error('Supabase deleteFood error:', error);
          setFoods(foods.filter(f => f.id !== id));
        });
    } else {
      setFoods(foods.filter(f => f.id !== id));
    }
  };

  const addKid = (kid: Omit<Kid, "id">) => {
    // If authenticated, persist to Supabase and then update state
    if (userId && householdId) {
      supabase
        .from('kids')
        .insert([{ ...kid, user_id: userId, household_id: householdId }])
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) {
            logger.error('Supabase addKid error:', error);
            // Fallback to local so user isn't blocked
            setKids([...kids, { ...kid, id: generateId() }]);
          } else if (data) {
            setKids([...kids, data as unknown as Kid]);
            // Keep Family view instead of auto-selecting the new kid
            // setActiveKidId((data as any).id);
          }
        });
    } else {
      // Local-only mode
      setKids([...kids, { ...kid, id: generateId() }]);
    }
  };
  const updateKid = (id: string, updates: Partial<Kid>) => {
    if (userId) {
      supabase
        .from('kids')
        .update(updates)
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            logger.error('Supabase updateKid error:', error);
          }
          setKids(kids.map(k => (k.id === id ? { ...k, ...updates } : k)));
        });
    } else {
      setKids(kids.map(k => (k.id === id ? { ...k, ...updates } : k)));
    }
  };
  const deleteKid = (id: string) => {
    const afterDelete = () => {
      setKids(kids.filter(k => k.id !== id));
      setPlanEntriesState(planEntries.filter(p => p.kid_id !== id));
      if (activeKidId === id) {
        const remaining = kids.filter(k => k.id !== id);
        setActiveKidId(remaining[0]?.id ?? null);
      }
    };

    if (userId) {
      supabase
        .from('kids')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) {
            logger.error('Supabase deleteKid error:', error);
          }
          afterDelete();
        });
    } else {
      afterDelete();
    }
  };
  const setActiveKid = (id: string) => {
    setActiveKidId(id);
  };

  const addRecipe = async (recipe: Omit<Recipe, "id">): Promise<Recipe> => {
    if (userId) {
      // Map camelCase fields to DB snake_case columns (only columns that exist in recipes table)
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
        user_id: userId,
        household_id: householdId || undefined,
      };
      // Remove undefined keys so PostgREST doesn't reject unknown/undefined
      Object.keys(dbPayload).forEach((k) => {
        if (dbPayload[k] === undefined) delete dbPayload[k];
      });

      let { data, error } = await supabase
        .from('recipes')
        .insert([dbPayload])
        .select()
        .single();

      // If insert fails, retry with only core columns (handles schema mismatches)
      if (error) {
        console.error('Supabase addRecipe error:', error.message, error.code, error.details);
        console.error('Payload keys:', Object.keys(dbPayload));

        const corePayload: Record<string, unknown> = {
          name: dbPayload.name,
          description: dbPayload.description,
          food_ids: dbPayload.food_ids ?? [],
          instructions: dbPayload.instructions,
          prep_time: dbPayload.prep_time,
          cook_time: dbPayload.cook_time,
          servings: dbPayload.servings,
          tips: dbPayload.tips,
          additional_ingredients: dbPayload.additional_ingredients,
          user_id: userId,
          household_id: householdId || undefined,
        };
        Object.keys(corePayload).forEach((k) => {
          if (corePayload[k] === undefined) delete corePayload[k];
        });

        console.warn('Retrying addRecipe with core columns only:', Object.keys(corePayload));
        const retry = await supabase
          .from('recipes')
          .insert([corePayload])
          .select()
          .single();

        if (retry.error) {
          logger.error('Supabase addRecipe retry also failed:', retry.error);
          throw new Error(`Database error: ${retry.error.message}`);
        }
        data = retry.data;
        error = null;
      }

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      } else if (data) {
        const newRecipe = normalizeRecipeFromDB(data);
        setRecipes([...recipes, newRecipe]);
        return newRecipe;
      }
      throw new Error('Failed to add recipe');
    } else {
      const localRecipe: Recipe = { ...recipe, id: generateId() } as Recipe;
      setRecipes([...recipes, localRecipe]);
      return localRecipe;
    }
  };

  const updateRecipe = (id: string, updates: Partial<Recipe>) => {
    if (userId) {
      // Map camelCase to DB snake_case for updates
      const dbUpdates: Partial<RecipeRow> = {};
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

      supabase
        .from('recipes')
        .update(dbUpdates)
        .eq('id', id)
        .then(({ error }) => {
          if (error) logger.error('Supabase updateRecipe error:', error);
          setRecipes(recipes.map(r => (r.id === id ? { ...r, ...updates } : r)));
        });
    } else {
      setRecipes(recipes.map(r => (r.id === id ? { ...r, ...updates } : r)));
    }
  };

  const deleteRecipe = (id: string) => {
    if (userId) {
      supabase
        .from('recipes')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) logger.error('Supabase deleteRecipe error:', error);
          setRecipes(recipes.filter(r => r.id !== id));
        });
    } else {
      setRecipes(recipes.filter(r => r.id !== id));
    }
  };

  const setPlanEntries = (entries: PlanEntry[]) => {
    setPlanEntriesState(entries);
  };

  const addPlanEntry = (entry: Omit<PlanEntry, "id">) => {
    if (userId && householdId) {
      supabase
        .from('plan_entries')
        .insert([{ ...entry, user_id: userId, household_id: householdId }])
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) {
            logger.error('Supabase addPlanEntry error:', error);
            setPlanEntriesState([...planEntries, { ...entry, id: generateId() }]);
          } else if (data) {
            setPlanEntriesState([...planEntries, data as unknown as PlanEntry]);
          }
        });
    } else {
      const newEntry = { ...entry, id: generateId() };
      setPlanEntriesState([...planEntries, newEntry]);
    }
  };

  const addPlanEntries = async (entries: Omit<PlanEntry, "id">[]) => {
    if (userId && householdId) {
      const entriesWithIds = entries.map(e => ({ ...e, user_id: userId, household_id: householdId }));
      const { data, error } = await supabase
        .from('plan_entries')
        .insert(entriesWithIds)
        .select();
      
      if (error) {
        logger.error('Supabase addPlanEntries error:', error);
        const localEntries = entries.map(e => ({ ...e, id: generateId() }));
        setPlanEntriesState([...planEntries, ...localEntries]);
      } else if (data) {
        setPlanEntriesState([...planEntries, ...(data as unknown as PlanEntry[])]);
      }
    } else {
      const newEntries = entries.map(e => ({ ...e, id: generateId() }));
      setPlanEntriesState([...planEntries, ...newEntries]);
    }
  };

  const updatePlanEntry = (id: string, updates: Partial<PlanEntry>) => {
    if (userId) {
      supabase
        .from('plan_entries')
        .update(updates)
        .eq('id', id)
        .then(({ error }) => {
          if (error) logger.error('Supabase updatePlanEntry error:', error);
          setPlanEntriesState(planEntries.map(e => (e.id === id ? { ...e, ...updates } : e)));
        });
    } else {
      setPlanEntriesState(planEntries.map(e => (e.id === id ? { ...e, ...updates } : e)));
    }
  };

  const setGroceryItems = (items: GroceryItem[]) => {
    setGroceryItemsState(items);
  };

  const addGroceryItem = (item: Omit<GroceryItem, "id" | "checked">) => {
    if (userId && householdId) {
      const newItem: Record<string, any> = {
        name: item.name,
        quantity: item.quantity || 1,
        unit: item.unit || '',
        category: item.category || 'other',
        notes: item.notes || null,
        aisle: item.aisle || null,
        grocery_list_id: item.grocery_list_id || null,
        user_id: userId,
        household_id: householdId,
        checked: false
      };
      if (item.added_via) newItem.added_via = item.added_via;
      if (item.brand_preference) newItem.brand_preference = item.brand_preference;
      if (item.barcode) newItem.barcode = item.barcode;
      
      supabase
        .from('grocery_items')
        .insert(newItem)
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) {
            logger.error('Supabase addGroceryItem error:', error);
            setGroceryItemsState([...groceryItems, { ...item, id: generateId(), checked: false }]);
          } else if (data) {
            setGroceryItemsState([...groceryItems, data as unknown as GroceryItem]);
          }
        });
    } else {
      const newItem = { ...item, id: generateId(), checked: false };
      setGroceryItemsState([...groceryItems, newItem]);
    }
  };

  const toggleGroceryItem = (id: string) => {
    const item = groceryItems.find(i => i.id === id);
    if (!item) return;
    
    const newChecked = !item.checked;
    if (userId) {
      supabase
        .from('grocery_items')
        .update({ checked: newChecked })
        .eq('id', id)
        .then(({ error }) => {
          if (error) logger.error('Supabase toggleGroceryItem error:', error);
          setGroceryItemsState(
            groceryItems.map(item =>
              item.id === id ? { ...item, checked: newChecked } : item
            )
          );
        });
    } else {
      setGroceryItemsState(
        groceryItems.map(item =>
          item.id === id ? { ...item, checked: newChecked } : item
        )
      );
    }
  };

  const updateGroceryItem = (id: string, updates: Partial<GroceryItem>) => {
    if (userId) {
      supabase
        .from('grocery_items')
        .update(updates)
        .eq('id', id)
        .then(({ error }) => {
          if (error) logger.error('Supabase updateGroceryItem error:', error);
          setGroceryItemsState(
            groceryItems.map(item =>
              item.id === id ? { ...item, ...updates } : item
            )
          );
        });
    } else {
      setGroceryItemsState(
        groceryItems.map(item =>
          item.id === id ? { ...item, ...updates } : item
        )
      );
    }
  };

  const deleteGroceryItem = (id: string) => {
    if (userId) {
      supabase
        .from('grocery_items')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) logger.error('Supabase deleteGroceryItem error:', error);
          setGroceryItemsState(groceryItems.filter(item => item.id !== id));
        });
    } else {
      setGroceryItemsState(groceryItems.filter(item => item.id !== id));
    }
  };

  const deleteGroceryItems = (ids: string[]) => {
    if (ids.length === 0) return;
    if (userId) {
      supabase
        .from('grocery_items')
        .delete()
        .in('id', ids)
        .then(({ error }) => {
          if (error) logger.error('Supabase deleteGroceryItems error:', error);
          const idSet = new Set(ids);
          setGroceryItemsState(groceryItems.filter(item => !idSet.has(item.id)));
        });
    } else {
      const idSet = new Set(ids);
      setGroceryItemsState(groceryItems.filter(item => !idSet.has(item.id)));
    }
  };

  const clearCheckedGroceryItems = () => {
    const checkedIds = groceryItems.filter(item => item.checked).map(item => item.id);
    if (userId && checkedIds.length > 0) {
      supabase
        .from('grocery_items')
        .delete()
        .in('id', checkedIds)
        .then(({ error }) => {
          if (error) logger.error('Supabase clearCheckedGroceryItems error:', error);
          setGroceryItemsState(groceryItems.filter(item => !item.checked));
        });
    } else {
      setGroceryItemsState(groceryItems.filter(item => !item.checked));
    }
  };

  const exportData = () => {
    return JSON.stringify({ foods, kids, recipes, activeKidId, planEntries, groceryItems }, null, 2);
  };

  const importData = (jsonData: string) => {
    try {
      const data = JSON.parse(jsonData);
      if (data.foods) setFoods(data.foods);
      if (data.kids) setKids(data.kids);
      if (data.recipes) setRecipes(data.recipes);
      if (data.activeKidId) setActiveKidId(data.activeKidId);
      if (data.planEntries) setPlanEntriesState(data.planEntries);
      if (data.groceryItems) setGroceryItemsState(data.groceryItems);
    } catch (error) {
      throw new Error("Invalid JSON data");
    }
  };

  const resetAllData = () => {
    const starterFoods = STARTER_FOODS.map(f => ({ ...f, id: generateId() }));
    setFoods(starterFoods);
    const defaultKid = { id: generateId(), name: "My Child", age: 5 };
    setKids([defaultKid]);
    setActiveKidId(defaultKid.id);
    setPlanEntriesState([]);
    setGroceryItemsState([]);
  };

  // Bulk operations for foods
  const addFoods = async (foodsToAdd: Omit<Food, "id">[]) => {
    if (userId && householdId) {
      const foodsWithUserData = foodsToAdd.map(f => ({ ...f, user_id: userId, household_id: householdId }));
      const { data, error } = await supabase
        .from('foods')
        .insert(foodsWithUserData)
        .select();

      if (error) {
        logger.error('Supabase addFoods error:', error);
        const localFoods = foodsToAdd.map(f => ({ ...f, id: generateId() }));
        setFoods([...foods, ...localFoods]);
      } else if (data) {
        setFoods([...foods, ...(data as unknown as Food[])]);
      }
    } else {
      const localFoods = foodsToAdd.map(f => ({ ...f, id: generateId() }));
      setFoods([...foods, ...localFoods]);
    }
  };

  const updateFoods = async (updates: { id: string; updates: Partial<Food> }[]) => {
    if (userId) {
      // Update each food in the database
      const promises = updates.map(({ id, updates: foodUpdates }) =>
        supabase
          .from('foods')
          .update(foodUpdates)
          .eq('id', id)
      );

      const results = await Promise.all(promises);
      const errors = results.filter(r => r.error);

      if (errors.length > 0) {
        logger.error('Supabase updateFoods errors:', errors);
      }
    }

    // Update local state
    setFoods(foods.map(f => {
      const update = updates.find(u => u.id === f.id);
      return update ? { ...f, ...update.updates } : f;
    }));
  };

  const deleteFoods = async (ids: string[]) => {
    if (userId) {
      const { error } = await supabase
        .from('foods')
        .delete()
        .in('id', ids);

      if (error) {
        logger.error('Supabase deleteFoods error:', error);
      }
    }

    setFoods(foods.filter(f => !ids.includes(f.id)));
  };

  // Week operations for meal planner
  const copyWeekPlan = async (fromDate: string, toDate: string, kidId: string) => {
    // Get all entries for the week starting from fromDate
    const fromDateObj = new Date(fromDate);
    const toDateObj = new Date(toDate);

    const weekEntries = planEntries.filter(entry => {
      const entryDate = new Date(entry.date);
      const daysDiff = Math.floor((entryDate.getTime() - fromDateObj.getTime()) / (1000 * 60 * 60 * 24));
      return entry.kid_id === kidId && daysDiff >= 0 && daysDiff < 7;
    });

    // Create new entries with adjusted dates
    const newEntries = weekEntries.map(entry => {
      const entryDate = new Date(entry.date);
      const daysDiff = Math.floor((entryDate.getTime() - fromDateObj.getTime()) / (1000 * 60 * 60 * 24));
      const newDate = new Date(toDateObj);
      newDate.setDate(newDate.getDate() + daysDiff);

      return {
        kid_id: entry.kid_id,
        food_id: entry.food_id,
        recipe_id: entry.recipe_id,
        meal_slot: entry.meal_slot,
        date: newDate.toISOString().split('T')[0],
        // @ts-ignore - outcome field type mismatch
        outcome: undefined,
        notes: entry.notes,
        // @ts-ignore - result field type mismatch
        result: undefined,
      };
    });

    // @ts-ignore - Type mismatch with PlanEntry
    await addPlanEntries(newEntries);
  };

  const deleteWeekPlan = async (weekStart: string, kidId: string) => {
    const weekStartObj = new Date(weekStart);

    const entriesToDelete = planEntries.filter(entry => {
      const entryDate = new Date(entry.date);
      const daysDiff = Math.floor((entryDate.getTime() - weekStartObj.getTime()) / (1000 * 60 * 60 * 24));
      return entry.kid_id === kidId && daysDiff >= 0 && daysDiff < 7;
    });

    const idsToDelete = entriesToDelete.map(e => e.id);

    if (userId && idsToDelete.length > 0) {
      const { error } = await supabase
        .from('plan_entries')
        .delete()
        .in('id', idsToDelete);

      if (error) {
        logger.error('Supabase deleteWeekPlan error:', error);
      }
    }

    setPlanEntriesState(planEntries.filter(e => !idsToDelete.includes(e.id)));
  };

  // Refresh functions
  const refreshFoods = async () => {
    if (userId) {
      const { data } = await supabase
        .from('foods')
        .select('*')
        .order('name', { ascending: true });

      if (data) {
        setFoods(data as unknown as Food[]);
      }
    }
  };

  const refreshRecipes = async () => {
    if (userId) {
      const { data } = await supabase
        .from('recipes')
        .select('*')
        .order('created_at', { ascending: true });

      if (data) {
        setRecipes(data.map(normalizeRecipeFromDB));
      }
    }
  };

  const refreshKids = async () => {
    if (userId) {
      const { data } = await supabase
        .from('kids')
        .select('*')
        .order('created_at', { ascending: true });

      if (data) {
        setKids(data as unknown as Kid[]);
      }
    }
  };

  return (
    <AppContext.Provider
      value={{
        foods,
        kids,
        recipes,
        activeKidId,
        planEntries,
        groceryItems,
        addFood,
        updateFood,
        deleteFood,
        addKid,
        updateKid,
        deleteKid,
        setActiveKid,
        setActiveKidId: setActiveKidId,
        addRecipe,
        updateRecipe,
        deleteRecipe,
        setPlanEntries,
        addPlanEntry,
        addPlanEntries,
        updatePlanEntry,
        setGroceryItems,
        addGroceryItem,
        toggleGroceryItem,
        updateGroceryItem,
        deleteGroceryItem,
        deleteGroceryItems,
        clearCheckedGroceryItems,
        exportData,
        importData,
        resetAllData,
        // Bulk operations
        addFoods,
        updateFoods,
        deleteFoods,
        // Week operations
        copyWeekPlan,
        deleteWeekPlan,
        // Refresh functions
        refreshFoods,
        refreshRecipes,
        refreshKids,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
