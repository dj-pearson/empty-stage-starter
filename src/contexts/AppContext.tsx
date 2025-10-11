import React, { createContext, useContext, useState, useEffect } from "react";
import { Food, Kid, PlanEntry, GroceryItem, Recipe } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { generateId } from "@/lib/utils";

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
  setActiveKid: (id: string) => void;
  setActiveKidId: (id: string) => void;
  addRecipe: (recipe: Omit<Recipe, "id">) => void;
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

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
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
  }, []);

  // Save to localStorage whenever data changes
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ foods, kids, recipes, activeKidId, planEntries, groceryItems })
    );
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
            setActiveKidId(kidsRes.data[0]?.id ?? null);
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
          ]).then(([kidsRes, foodsRes, recipesRes, planRes, groceryRes]) => {
            if (mounted) {
              if (kidsRes.data) {
                setKids(kidsRes.data as unknown as Kid[]);
                setActiveKidId(kidsRes.data[0]?.id ?? null);
              }
              if (foodsRes.data) setFoods(foodsRes.data as unknown as Food[]);
              if (recipesRes.data) setRecipes(recipesRes.data as unknown as Recipe[]);
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

  const addFood = (food: Omit<Food, "id">) => {
    if (userId && householdId) {
      supabase
        .from('foods')
        .insert([{ ...food, user_id: userId, household_id: householdId }])
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error('Supabase addFood error:', error);
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
          if (error) console.error('Supabase updateFood error:', error);
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
          if (error) console.error('Supabase deleteFood error:', error);
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
            console.error('Supabase addKid error:', error);
            // Fallback to local so user isn't blocked
            setKids([...kids, { ...kid, id: generateId() }]);
          } else if (data) {
            setKids([...kids, data as unknown as Kid]);
            setActiveKidId((data as any).id);
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
            console.error('Supabase updateKid error:', error);
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
            console.error('Supabase deleteKid error:', error);
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
    if (userId && householdId) {
      const { data, error } = await supabase
        .from('recipes')
        .insert([{ ...recipe, user_id: userId, household_id: householdId }])
        .select()
        .single();

      if (error) {
        console.error('Supabase addRecipe error:', error);
        const localRecipe = { ...recipe, id: generateId() };
        setRecipes([...recipes, localRecipe]);
        return localRecipe;
      } else if (data) {
        const newRecipe = data as unknown as Recipe;
        setRecipes([...recipes, newRecipe]);
        return newRecipe;
      }
      throw new Error('Failed to add recipe');
    } else {
      const localRecipe = { ...recipe, id: generateId() };
      setRecipes([...recipes, localRecipe]);
      return localRecipe;
    }
  };

  const updateRecipe = (id: string, updates: Partial<Recipe>) => {
    if (userId) {
      supabase
        .from('recipes')
        .update(updates)
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('Supabase updateRecipe error:', error);
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
          if (error) console.error('Supabase deleteRecipe error:', error);
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
            console.error('Supabase addPlanEntry error:', error);
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
        console.error('Supabase addPlanEntries error:', error);
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
          if (error) console.error('Supabase updatePlanEntry error:', error);
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
            console.error('Supabase addGroceryItem error:', error);
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
          if (error) console.error('Supabase toggleGroceryItem error:', error);
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
          if (error) console.error('Supabase clearCheckedGroceryItems error:', error);
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
