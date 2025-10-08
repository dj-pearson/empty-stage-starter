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
  addRecipe: (recipe: Omit<Recipe, "id">) => void;
  updateRecipe: (id: string, recipe: Partial<Recipe>) => void;
  deleteRecipe: (id: string) => void;
  setPlanEntries: (entries: PlanEntry[]) => void;
  addPlanEntry: (entry: Omit<PlanEntry, "id">) => void;
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
        if (mounted) setHouseholdId((hh as string) ?? null);

        // Load kids from DB (RLS restricts to household)
        const { data: kidRows } = await supabase
          .from('kids')
          .select('*')
          .order('created_at', { ascending: true });

        if (mounted && kidRows) {
          setKids(kidRows as unknown as Kid[]);
          setActiveKidId(kidRows[0]?.id ?? null);
        }
      }
    };

    loadAuthAndData();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);

      if (uid) {
        supabase.rpc('get_user_household_id', { _user_id: uid }).then(({ data }) => {
          if (mounted) setHouseholdId((data as string) ?? null);
        });

        supabase
          .from('kids')
          .select('*')
          .order('created_at', { ascending: true })
          .then(({ data }) => {
            if (mounted && data) {
              setKids(data as unknown as Kid[]);
              setActiveKidId(data[0]?.id ?? null);
            }
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
    setFoods([...foods, { ...food, id: generateId() }]);
  };

  const updateFood = (id: string, updates: Partial<Food>) => {
    setFoods(foods.map(f => (f.id === id ? { ...f, ...updates } : f)));
  };

  const deleteFood = (id: string) => {
    setFoods(foods.filter(f => f.id !== id));
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

  const addRecipe = (recipe: Omit<Recipe, "id">) => {
    setRecipes([...recipes, { ...recipe, id: generateId() }]);
  };

  const updateRecipe = (id: string, updates: Partial<Recipe>) => {
    setRecipes(recipes.map(r => (r.id === id ? { ...r, ...updates } : r)));
  };

  const deleteRecipe = (id: string) => {
    setRecipes(recipes.filter(r => r.id !== id));
  };

  const setPlanEntries = (entries: PlanEntry[]) => {
    setPlanEntriesState(entries);
  };

  const addPlanEntry = (entry: Omit<PlanEntry, "id">) => {
    const newEntry = { ...entry, id: generateId() };
    console.log('Adding plan entry:', newEntry);
    setPlanEntriesState([...planEntries, newEntry]);
  };

  const updatePlanEntry = (id: string, updates: Partial<PlanEntry>) => {
    console.log('Updating plan entry:', id, 'Updates:', updates);
    const updatedEntries = planEntries.map(e => (e.id === id ? { ...e, ...updates } : e));
    console.log('Updated entries:', updatedEntries.filter(e => e.id === id));
    setPlanEntriesState(updatedEntries);
  };

  const setGroceryItems = (items: GroceryItem[]) => {
    setGroceryItemsState(items);
  };

  const addGroceryItem = (item: Omit<GroceryItem, "id" | "checked">) => {
    const newItem = { ...item, id: generateId(), checked: false };
    setGroceryItemsState([...groceryItems, newItem]);
  };

  const toggleGroceryItem = (id: string) => {
    setGroceryItemsState(
      groceryItems.map(item =>
        item.id === id ? { ...item, checked: !item.checked } : item
      )
    );
  };

  const clearCheckedGroceryItems = () => {
    setGroceryItemsState(groceryItems.filter(item => !item.checked));
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
        addRecipe,
        updateRecipe,
        deleteRecipe,
        setPlanEntries,
        addPlanEntry,
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
