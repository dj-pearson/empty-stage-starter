import React, { useCallback, useMemo, useEffect, useRef, createContext, useContext } from "react";
import { Food, Kid, PlanEntry, GroceryItem, Recipe } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { generateId, debounce } from "@/lib/utils";
import { getStorage } from "@/lib/platform";
import { logger } from "@/lib/logger";
import { AuthProvider, useAuth } from "./AuthContext";
import { FoodsProvider, useFoods } from "./FoodsContext";
import { KidsProvider, useKids } from "./KidsContext";
import { RecipesProvider, useRecipes, normalizeRecipeFromDB } from "./RecipesContext";
import { PlanProvider, usePlan } from "./PlanContext";
import { GroceryProvider, useGrocery } from "./GroceryContext";

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
  addFoods: (foods: Omit<Food, "id">[]) => Promise<void>;
  updateFoods: (updates: { id: string; updates: Partial<Food> }[]) => Promise<void>;
  deleteFoods: (ids: string[]) => Promise<void>;
  copyWeekPlan: (fromDate: string, toDate: string, kidId: string) => Promise<void>;
  deleteWeekPlan: (weekStart: string, kidId: string) => Promise<void>;
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

/** Inner component that composes all domain contexts into a single AppContext for backward compatibility */
function AppContextComposer({ children }: { children: React.ReactNode }) {
  const { userId, householdId } = useAuth();
  const { foods, setFoods, addFood, updateFood, deleteFood, addFoods, updateFoods, deleteFoods, refreshFoods } = useFoods();
  const { kids, setKids, activeKidId, setActiveKidId, addKid, updateKid, deleteKid, setActiveKid, refreshKids } = useKids();
  const { recipes, setRecipes, addRecipe, updateRecipe, deleteRecipe, refreshRecipes } = useRecipes();
  const { planEntries, setPlanEntries, setPlanEntriesState, addPlanEntry, addPlanEntries, updatePlanEntry, copyWeekPlan, deleteWeekPlan } = usePlan();
  const { groceryItems, setGroceryItems, setGroceryItemsState, addGroceryItem, toggleGroceryItem, updateGroceryItem, deleteGroceryItem, deleteGroceryItems, clearCheckedGroceryItems } = useGrocery();

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
          const starterFoods = STARTER_FOODS.map(f => ({ ...f, id: generateId() }));
          setFoods(starterFoods);
          const defaultKid = { id: generateId(), name: "My Child", age: 5 };
          setKids([defaultKid]);
          setActiveKidId(defaultKid.id);
        }
      } catch (error) {
        logger.error("Error loading data from storage:", error);
        const starterFoods = STARTER_FOODS.map(f => ({ ...f, id: generateId() }));
        setFoods(starterFoods);
        const defaultKid = { id: generateId(), name: "My Child", age: 5 };
        setKids([defaultKid]);
        setActiveKidId(defaultKid.id);
      }
    };
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save to storage whenever data changes (platform-aware, debounced)
  const debouncedSaveRef = useRef(
    debounce(async (data: Record<string, unknown>) => {
      try {
        const storage = await getStorage();
        await storage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (error) {
        logger.error("Error saving data to storage:", error);
      }
    }, 500)
  );

  useEffect(() => {
    debouncedSaveRef.current({ foods, kids, recipes, activeKidId, planEntries, groceryItems });
  }, [foods, kids, recipes, activeKidId, planEntries, groceryItems]);

  // Sync with Supabase when authenticated
  useEffect(() => {
    if (!userId) return;
    if (loadingRef.current) return;
    loadingRef.current = true;

    const loadUserData = async () => {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const ninetyDaysFromNow = new Date();
        ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

        const [kidsRes, foodsRes, recipesRes, planRes, groceryRes] = await Promise.all([
          householdId
            ? supabase.from('kids').select('*').eq('household_id', householdId).order('created_at', { ascending: true })
            : supabase.from('kids').select('*').order('created_at', { ascending: true }),
          householdId
            ? supabase.from('foods').select('*').eq('household_id', householdId).order('name', { ascending: true }).limit(500)
            : supabase.from('foods').select('*').order('name', { ascending: true }).limit(500),
          householdId
            ? supabase.from('recipes').select('*').eq('household_id', householdId).order('created_at', { ascending: true }).limit(200)
            : supabase.from('recipes').select('*').order('created_at', { ascending: true }).limit(200),
          householdId
            ? supabase.from('plan_entries').select('*').eq('household_id', householdId)
                .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
                .lte('date', ninetyDaysFromNow.toISOString().split('T')[0])
                .order('date', { ascending: true })
            : supabase.from('plan_entries').select('*')
                .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
                .lte('date', ninetyDaysFromNow.toISOString().split('T')[0])
                .order('date', { ascending: true }),
          householdId
            ? supabase.from('grocery_items').select('*').eq('household_id', householdId).order('created_at', { ascending: true }).limit(500)
            : supabase.from('grocery_items').select('*').order('created_at', { ascending: true }).limit(500)
        ]);

        if (kidsRes.data) {
          setKids(kidsRes.data as unknown as Kid[]);
          setActiveKidId(null);
        }
        if (foodsRes.data) setFoods(foodsRes.data as unknown as Food[]);
        if (recipesRes.data) {
          const dbRecipes = recipesRes.data.map(normalizeRecipeFromDB);
          // Check for local recipes and migrate them
          const localData = localStorage.getItem(STORAGE_KEY);
          if (localData) {
            try {
              const parsed = JSON.parse(localData);
              const localRecipes = parsed.recipes || [];
              const localOnlyRecipes = localRecipes.filter((lr: Recipe) =>
                !dbRecipes.some(dr => dr.id === lr.id) && !lr.id.includes('-')
              );
              if (localOnlyRecipes.length > 0) {
                logger.debug(`Migrating ${localOnlyRecipes.length} local recipes to database...`);
                const bulkPayload = localOnlyRecipes.map((localRecipe: Recipe) => {
                  const { id: _id, ...recipeData } = localRecipe;
                  const dbPayload: Record<string, unknown> = {
                    name: recipeData.name, description: recipeData.description,
                    food_ids: recipeData.food_ids, category: recipeData.category,
                    instructions: recipeData.instructions ?? recipeData.tips,
                    prep_time: recipeData.prepTime, cook_time: recipeData.cookTime,
                    servings: recipeData.servings, user_id: userId,
                    household_id: householdId || undefined,
                  };
                  Object.keys(dbPayload).forEach((k) => {
                    if (dbPayload[k] === undefined) delete dbPayload[k];
                  });
                  return dbPayload;
                });
                await supabase.from('recipes').insert(bulkPayload);
                const { data: updatedRecipes } = await supabase.from('recipes').select('*').order('created_at', { ascending: true });
                if (updatedRecipes) setRecipes(updatedRecipes.map(normalizeRecipeFromDB));
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
      } finally {
        loadingRef.current = false;
      }
    };

    loadUserData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, householdId]);

  const exportData = useCallback(() => {
    return JSON.stringify({ foods, kids, recipes, activeKidId, planEntries, groceryItems }, null, 2);
  }, [foods, kids, recipes, activeKidId, planEntries, groceryItems]);

  const importData = useCallback((jsonData: string) => {
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
  }, [setFoods, setKids, setRecipes, setActiveKidId, setPlanEntriesState, setGroceryItemsState]);

  const resetAllData = useCallback(() => {
    const starterFoods = STARTER_FOODS.map(f => ({ ...f, id: generateId() }));
    setFoods(starterFoods);
    const defaultKid = { id: generateId(), name: "My Child", age: 5 };
    setKids([defaultKid]);
    setActiveKidId(defaultKid.id);
    setPlanEntriesState([]);
    setGroceryItemsState([]);
  }, [setFoods, setKids, setActiveKidId, setPlanEntriesState, setGroceryItemsState]);

  const value = useMemo<AppContextType>(() => ({
    foods, kids, recipes, activeKidId, planEntries, groceryItems,
    addFood, updateFood, deleteFood,
    addKid, updateKid, deleteKid, setActiveKid, setActiveKidId,
    addRecipe, updateRecipe, deleteRecipe,
    setPlanEntries, addPlanEntry, addPlanEntries, updatePlanEntry,
    setGroceryItems, addGroceryItem, toggleGroceryItem,
    updateGroceryItem, deleteGroceryItem, deleteGroceryItems, clearCheckedGroceryItems,
    exportData, importData, resetAllData,
    addFoods, updateFoods, deleteFoods,
    copyWeekPlan, deleteWeekPlan,
    refreshFoods, refreshRecipes, refreshKids,
  }), [
    foods, kids, recipes, activeKidId, planEntries, groceryItems,
    addFood, updateFood, deleteFood,
    addKid, updateKid, deleteKid, setActiveKid, setActiveKidId,
    addRecipe, updateRecipe, deleteRecipe,
    setPlanEntries, addPlanEntry, addPlanEntries, updatePlanEntry,
    setGroceryItems, addGroceryItem, toggleGroceryItem,
    updateGroceryItem, deleteGroceryItem, deleteGroceryItems, clearCheckedGroceryItems,
    exportData, importData, resetAllData,
    addFoods, updateFoods, deleteFoods,
    copyWeekPlan, deleteWeekPlan,
    refreshFoods, refreshRecipes, refreshKids,
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <FoodsProvider>
        <KidsProvider>
          <RecipesProvider>
            <PlanProvider>
              <GroceryProvider>
                <AppContextComposer>
                  {children}
                </AppContextComposer>
              </GroceryProvider>
            </PlanProvider>
          </RecipesProvider>
        </KidsProvider>
      </FoodsProvider>
    </AuthProvider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
}
