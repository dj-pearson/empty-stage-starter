import React, { createContext, useContext, useState, useEffect } from "react";
import { Food, Kid, PlanEntry, GroceryItem, Recipe } from "@/types";
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
    setKids([...kids, { ...kid, id: generateId() }]);
  };

  const updateKid = (id: string, updates: Partial<Kid>) => {
    setKids(kids.map(k => (k.id === id ? { ...k, ...updates } : k)));
  };

  const deleteKid = (id: string) => {
    setKids(kids.filter(k => k.id !== id));
    // Clean up plan entries and grocery items for this kid
    setPlanEntriesState(planEntries.filter(p => p.kid_id !== id));
    // If deleting active kid, switch to first remaining kid
    if (activeKidId === id) {
      const remaining = kids.filter(k => k.id !== id);
      setActiveKidId(remaining[0]?.id ?? null);
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
    setPlanEntriesState([...planEntries, { ...entry, id: generateId() }]);
  };

  const updatePlanEntry = (id: string, updates: Partial<PlanEntry>) => {
    setPlanEntriesState(
      planEntries.map(e => (e.id === id ? { ...e, ...updates } : e))
    );
  };

  const setGroceryItems = (items: GroceryItem[]) => {
    setGroceryItemsState(items);
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
