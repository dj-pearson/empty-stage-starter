import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useMobileAuth } from './MobileAuthProvider';
import { safeStorage } from '@/lib/platform';

interface Food {
  id: string;
  name: string;
  category: string;
  is_safe: boolean;
  allergens?: string[];
  nutrition_info?: Record<string, number>;
  barcode?: string;
  user_id?: string;
  created_at?: string;
}

interface Kid {
  id: string;
  name: string;
  age?: number;
  allergens?: string[];
  profile_picture_url?: string;
  user_id?: string;
}

interface Recipe {
  id: string;
  name: string;
  food_ids?: string[];
  instructions?: string;
  nutrition_info?: Record<string, number>;
  prep_time?: number;
  cook_time?: number;
  servings?: number;
  image_url?: string;
  user_id?: string;
}

interface PlanEntry {
  id: string;
  kid_id: string;
  date: string;
  meal_slot: string;
  food_id?: string;
  recipe_id?: string;
  result?: string;
  notes?: string;
  user_id?: string;
}

interface GroceryItem {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  checked: boolean;
  category?: string;
  grocery_list_id?: string;
  user_id?: string;
}

interface MobileAppContextType {
  foods: Food[];
  kids: Kid[];
  recipes: Recipe[];
  planEntries: PlanEntry[];
  groceryItems: GroceryItem[];
  activeKidId: string | null;
  isLoading: boolean;
  setActiveKidId: (id: string | null) => void;
  addFood: (food: Partial<Food>) => Promise<void>;
  updateFood: (id: string, updates: Partial<Food>) => Promise<void>;
  deleteFood: (id: string) => Promise<void>;
  addKid: (kid: Partial<Kid>) => Promise<void>;
  updateKid: (id: string, updates: Partial<Kid>) => Promise<void>;
  deleteKid: (id: string) => Promise<void>;
  addRecipe: (recipe: Partial<Recipe>) => Promise<void>;
  updateRecipe: (id: string, updates: Partial<Recipe>) => Promise<void>;
  deleteRecipe: (id: string) => Promise<void>;
  addPlanEntry: (entry: Partial<PlanEntry>) => Promise<void>;
  updatePlanEntry: (id: string, updates: Partial<PlanEntry>) => Promise<void>;
  deletePlanEntry: (id: string) => Promise<void>;
  addGroceryItem: (item: Partial<GroceryItem>) => Promise<void>;
  updateGroceryItem: (id: string, updates: Partial<GroceryItem>) => Promise<void>;
  deleteGroceryItem: (id: string) => Promise<void>;
  refreshData: () => Promise<void>;
}

const MobileAppContext = createContext<MobileAppContextType>({
  foods: [],
  kids: [],
  recipes: [],
  planEntries: [],
  groceryItems: [],
  activeKidId: null,
  isLoading: true,
  setActiveKidId: () => {},
  addFood: async () => {},
  updateFood: async () => {},
  deleteFood: async () => {},
  addKid: async () => {},
  updateKid: async () => {},
  deleteKid: async () => {},
  addRecipe: async () => {},
  updateRecipe: async () => {},
  deleteRecipe: async () => {},
  addPlanEntry: async () => {},
  updatePlanEntry: async () => {},
  deletePlanEntry: async () => {},
  addGroceryItem: async () => {},
  updateGroceryItem: async () => {},
  deleteGroceryItem: async () => {},
  refreshData: async () => {},
});

export function MobileAppProvider({ children }: { children: ReactNode }) {
  const { user } = useMobileAuth();
  const [foods, setFoods] = useState<Food[]>([]);
  const [kids, setKids] = useState<Kid[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [planEntries, setPlanEntries] = useState<PlanEntry[]>([]);
  const [groceryItems, setGroceryItems] = useState<GroceryItem[]>([]);
  const [activeKidId, setActiveKidId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) {
      setFoods([]);
      setKids([]);
      setRecipes([]);
      setPlanEntries([]);
      setGroceryItems([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [foodsRes, kidsRes, recipesRes, planRes, groceryRes] = await Promise.all([
        supabase.from('foods').select('*').eq('user_id', user.id),
        supabase.from('kids').select('*').eq('user_id', user.id),
        supabase.from('recipes').select('*').eq('user_id', user.id),
        supabase.from('plan_entries').select('*').eq('user_id', user.id),
        supabase.from('grocery_items').select('*').eq('user_id', user.id),
      ]);

      if (foodsRes.data) setFoods(foodsRes.data as Food[]);
      if (kidsRes.data) setKids(kidsRes.data as Kid[]);
      if (recipesRes.data) setRecipes(recipesRes.data as Recipe[]);
      if (planRes.data) setPlanEntries(planRes.data as PlanEntry[]);
      if (groceryRes.data) setGroceryItems(groceryRes.data as GroceryItem[]);

      // Set first kid as active if none selected
      if (kidsRes.data && kidsRes.data.length > 0 && !activeKidId) {
        setActiveKidId(kidsRes.data[0].id);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, activeKidId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time subscriptions
  useEffect(() => {
    if (!user) return;

    const channels = [
      supabase.channel('foods_changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'foods', filter: `user_id=eq.${user.id}` },
        () => fetchData()
      ),
      supabase.channel('kids_changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kids', filter: `user_id=eq.${user.id}` },
        () => fetchData()
      ),
      supabase.channel('grocery_changes').on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'grocery_items', filter: `user_id=eq.${user.id}` },
        () => fetchData()
      ),
    ];

    channels.forEach(ch => ch.subscribe());

    return () => {
      channels.forEach(ch => ch.unsubscribe());
    };
  }, [user, fetchData]);

  // CRUD operations
  const addFood = async (food: Partial<Food>) => {
    if (!user) return;
    const { data, error } = await supabase.from('foods').insert({ ...food, user_id: user.id }).select().single();
    if (data && !error) setFoods(prev => [...prev, data as Food]);
  };

  const updateFood = async (id: string, updates: Partial<Food>) => {
    const { error } = await supabase.from('foods').update(updates).eq('id', id);
    if (!error) setFoods(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const deleteFood = async (id: string) => {
    const { error } = await supabase.from('foods').delete().eq('id', id);
    if (!error) setFoods(prev => prev.filter(f => f.id !== id));
  };

  const addKid = async (kid: Partial<Kid>) => {
    if (!user) return;
    const { data, error } = await supabase.from('kids').insert({ ...kid, user_id: user.id }).select().single();
    if (data && !error) setKids(prev => [...prev, data as Kid]);
  };

  const updateKid = async (id: string, updates: Partial<Kid>) => {
    const { error } = await supabase.from('kids').update(updates).eq('id', id);
    if (!error) setKids(prev => prev.map(k => k.id === id ? { ...k, ...updates } : k));
  };

  const deleteKid = async (id: string) => {
    const { error } = await supabase.from('kids').delete().eq('id', id);
    if (!error) setKids(prev => prev.filter(k => k.id !== id));
  };

  const addRecipe = async (recipe: Partial<Recipe>) => {
    if (!user) return;
    const { data, error } = await supabase.from('recipes').insert({ ...recipe, user_id: user.id }).select().single();
    if (data && !error) setRecipes(prev => [...prev, data as Recipe]);
  };

  const updateRecipe = async (id: string, updates: Partial<Recipe>) => {
    const { error } = await supabase.from('recipes').update(updates).eq('id', id);
    if (!error) setRecipes(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const deleteRecipe = async (id: string) => {
    const { error } = await supabase.from('recipes').delete().eq('id', id);
    if (!error) setRecipes(prev => prev.filter(r => r.id !== id));
  };

  const addPlanEntry = async (entry: Partial<PlanEntry>) => {
    if (!user) return;
    const { data, error } = await supabase.from('plan_entries').insert({ ...entry, user_id: user.id }).select().single();
    if (data && !error) setPlanEntries(prev => [...prev, data as PlanEntry]);
  };

  const updatePlanEntry = async (id: string, updates: Partial<PlanEntry>) => {
    const { error } = await supabase.from('plan_entries').update(updates).eq('id', id);
    if (!error) setPlanEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const deletePlanEntry = async (id: string) => {
    const { error } = await supabase.from('plan_entries').delete().eq('id', id);
    if (!error) setPlanEntries(prev => prev.filter(e => e.id !== id));
  };

  const addGroceryItem = async (item: Partial<GroceryItem>) => {
    if (!user) return;
    const { data, error } = await supabase.from('grocery_items').insert({ ...item, user_id: user.id }).select().single();
    if (data && !error) setGroceryItems(prev => [...prev, data as GroceryItem]);
  };

  const updateGroceryItem = async (id: string, updates: Partial<GroceryItem>) => {
    const { error } = await supabase.from('grocery_items').update(updates).eq('id', id);
    if (!error) setGroceryItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };

  const deleteGroceryItem = async (id: string) => {
    const { error } = await supabase.from('grocery_items').delete().eq('id', id);
    if (!error) setGroceryItems(prev => prev.filter(i => i.id !== id));
  };

  return (
    <MobileAppContext.Provider
      value={{
        foods,
        kids,
        recipes,
        planEntries,
        groceryItems,
        activeKidId,
        isLoading,
        setActiveKidId,
        addFood,
        updateFood,
        deleteFood,
        addKid,
        updateKid,
        deleteKid,
        addRecipe,
        updateRecipe,
        deleteRecipe,
        addPlanEntry,
        updatePlanEntry,
        deletePlanEntry,
        addGroceryItem,
        updateGroceryItem,
        deleteGroceryItem,
        refreshData: fetchData,
      }}
    >
      {children}
    </MobileAppContext.Provider>
  );
}

export const useMobileApp = () => useContext(MobileAppContext);
