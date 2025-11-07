import React, { createContext, useContext, useState, useEffect } from "react";
import { Food, Kid, PlanEntry, GroceryItem, Recipe } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { generateId } from "@/lib/utils";
import { getStorage } from "@/lib/platform";
import { logger } from "@/lib/logger";

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
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      setUserId(uid);

      if (uid) {
        // Get household id
        const { data: hh } = await supabase.rpc('get_user_household_id', { _user_id: uid });
        const hhId = (hh as string) ?? null;
        if (mounted) setHouseholdId(hhId);

        // Load all data from DB
        const [kidsRes, foodsRes, recipesRes, planRes, groceryRes] = await Promise.all([
          supabase.from('kids').select('*').order('created_at', { ascending: true }),
          supabase.from('foods').select('*').order('name', { ascending: true }),
          supabase.from('recipes').select('*').order('created_at', { ascending: true }),
          supabase.from('plan_entries').select('*').order('date', { ascending: true }),
          supabase.from('grocery_items').select('*').order('created_at', { ascending: true })
        ]);

        if (mounted) {
          if (kidsRes.data) {
            setKids(kidsRes.data as unknown as Kid[]);
            // Default to Family view (null) instead of first kid
            setActiveKidId(null);
          }
          if (foodsRes.data) setFoods(foodsRes.data as unknown as Food[]);
          if (recipesRes.data) setRecipes(recipesRes.data as unknown as Recipe[]);
          if (planRes.data) setPlanEntriesState(planRes.data as unknown as PlanEntry[]);
          if (groceryRes.data) setGroceryItemsState(groceryRes.data as unknown as GroceryItem[]);
        }
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
                const dbRecipes = recipesRes.data as unknown as Recipe[];
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
                        const dbPayload: any = {
                          name: recipeData.name,
                          description: recipeData.description,
                          food_ids: recipeData.food_ids,
                          category: (recipeData as any).category,
                          instructions: (recipeData as any).instructions ?? (recipeData as any).tips,
                          prep_time: (recipeData as any).prepTime,
                          cook_time: (recipeData as any).cookTime,
                          servings: (recipeData as any).servings,
                          user_id: uid,
                          household_id: hhId || undefined,
                        };
                        Object.keys(dbPayload).forEach((k) => {
                          if (dbPayload[k] === undefined) delete dbPayload[k];
                        });
                        await supabase.from('recipes').insert([dbPayload]);
                      }
                      
                      // Reload recipes after migration
                      const { data: updatedRecipes } = await supabase
                        .from('recipes')
                        .select('*')
                        .order('created_at', { ascending: true });
                      
                      if (updatedRecipes) {
                        setRecipes(updatedRecipes as unknown as Recipe[]);
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
          });
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
        (payload) => {
          logger.debug('Grocery item changed:', payload);

          if (payload.eventType === 'INSERT') {
            setGroceryItemsState(prev => {
              // Avoid duplicates
              const exists = prev.some(item => item.id === payload.new.id);
              if (exists) return prev;
              return [...prev, payload.new as GroceryItem];
            });
          } else if (payload.eventType === 'UPDATE') {
            setGroceryItemsState(prev =>
              prev.map(item =>
                item.id === (payload.new as GroceryItem).id ? (payload.new as GroceryItem) : item
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setGroceryItemsState(prev =>
              prev.filter(item => item.id !== (payload.old as GroceryItem).id)
            );
          }
        }
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
      // Map camelCase fields to DB snake_case columns and include only known columns
      const dbPayload: any = {
        name: recipe.name,
        description: recipe.description,
        food_ids: recipe.food_ids,
        category: recipe.category,
        instructions: recipe.instructions ?? recipe.tips, // prefer explicit instructions, fallback to tips
        prep_time: recipe.prepTime,
        cook_time: recipe.cookTime,
        servings: recipe.servings,
        user_id: userId,
        household_id: householdId || undefined,
      };
      // Remove undefined keys so PostgREST doesn't reject unknown/undefined
      Object.keys(dbPayload).forEach((k) => {
        if (dbPayload[k] === undefined) delete dbPayload[k];
      });

      const { data, error } = await supabase
        .from('recipes')
        .insert([dbPayload])
        .select()
        .single();

      if (error) {
        logger.error('Supabase addRecipe error:', error);
        logger.error('Failed payload:', dbPayload);
        throw new Error(`Database error: ${error.message}`);
      } else if (data) {
        // Normalize DB response to our Recipe type (camelCase for UI)
        const r: any = data;
        const newRecipe: Recipe = {
          id: r.id,
          name: r.name,
          description: r.description ?? undefined,
          food_ids: r.food_ids ?? [],
          category: r.category ?? undefined,
          instructions: r.instructions ?? undefined,
          prepTime: r.prep_time ?? undefined,
          cookTime: r.cook_time ?? undefined,
          servings: r.servings ?? undefined,
        };
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
      const dbUpdates: any = {
        ...(updates.name !== undefined ? { name: updates.name } : {}),
        ...(updates.description !== undefined ? { description: updates.description } : {}),
        ...(updates.food_ids !== undefined ? { food_ids: updates.food_ids } : {}),
        ...(updates.category !== undefined ? { category: updates.category } : {}),
        ...(updates.instructions !== undefined || updates.tips !== undefined
          ? { instructions: updates.instructions ?? updates.tips }
          : {}),
        ...(updates.prepTime !== undefined ? { prep_time: updates.prepTime } : {}),
        ...(updates.cookTime !== undefined ? { cook_time: updates.cookTime } : {}),
        ...(updates.servings !== undefined ? { servings: updates.servings } : {}),
      };

      supabase
        .from('recipes')
        .update(dbUpdates)
        .eq('id', id)
        .then(({ error }) => {
          if (error) logger.error('Supabase updateRecipe error:', error);
          // Keep UI state in camelCase
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
      supabase
        .from('grocery_items')
        .insert([{ ...item, user_id: userId, household_id: householdId, checked: false }])
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
        outcome: undefined,
        notes: entry.notes,
      };
    });

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
        setRecipes(data as unknown as Recipe[]);
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
