import React, { createContext, useContext, useState, useCallback, useMemo } from "react";
import { Food } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { generateId } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { checkFeatureLimit } from "@/lib/featureLimits";
import { requestUpgradePrompt } from "@/lib/upgradePromptBus";
import { runOptimisticMutation } from "@/lib/optimisticMutation";
import { useAuth } from "./AuthContext";

interface FoodsContextType {
  foods: Food[];
  setFoods: React.Dispatch<React.SetStateAction<Food[]>>;
  addFood: (food: Omit<Food, "id">) => Promise<boolean>;
  updateFood: (id: string, food: Partial<Food>) => void;
  deleteFood: (id: string) => void;
  addFoods: (foods: Omit<Food, "id">[]) => Promise<boolean>;
  updateFoods: (updates: { id: string; updates: Partial<Food> }[]) => Promise<void>;
  deleteFoods: (ids: string[]) => Promise<void>;
  refreshFoods: () => Promise<void>;
}

const FoodsContext = createContext<FoodsContextType | undefined>(undefined);

export function FoodsProvider({ children }: { children: React.ReactNode }) {
  const [foods, setFoods] = useState<Food[]>([]);
  const { userId, householdId } = useAuth();

  const addFood = useCallback(async (food: Omit<Food, "id">): Promise<boolean> => {
    if (userId && householdId) {
      const limit = await checkFeatureLimit('pantry_foods', foods.length);
      if (!limit.allowed) {
        requestUpgradePrompt({
          feature: 'More pantry foods',
          message: limit.message,
        });
        return false;
      }

      const { data, error } = await supabase
        .from('foods')
        .insert([{ ...food, user_id: userId, household_id: householdId }])
        .select()
        .single();

      if (error) {
        logger.error('Supabase addFood error:', error);
        setFoods(prev => [...prev, { ...food, id: generateId() }]);
      } else if (data) {
        setFoods(prev => [...prev, data as unknown as Food]);
      }
      return true;
    }

    setFoods(prev => [...prev, { ...food, id: generateId() }]);
    return true;
  }, [userId, householdId, foods.length]);

  const updateFood = useCallback((id: string, updates: Partial<Food>) => {
    if (userId) {
      // US-320: optimistic update with rollback + toast on server rejection.
      void runOptimisticMutation<Food>(
        setFoods,
        prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)),
        () => supabase.from('foods').update(updates).eq('id', id),
        { logLabel: 'Supabase updateFood error:' }
      );
    } else {
      setFoods(prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)));
    }
  }, [userId]);

  const deleteFood = useCallback((id: string) => {
    if (userId) {
      void runOptimisticMutation<Food>(
        setFoods,
        prev => prev.filter(f => f.id !== id),
        () => supabase.from('foods').delete().eq('id', id),
        { logLabel: 'Supabase deleteFood error:', toastMessage: "Couldn't delete that food — it's back. Please try again." }
      );
    } else {
      setFoods(prev => prev.filter(f => f.id !== id));
    }
  }, [userId]);

  const addFoods = useCallback(async (foodsToAdd: Omit<Food, "id">[]): Promise<boolean> => {
    if (foodsToAdd.length === 0) return true;

    if (userId && householdId) {
      // Check whether the new total would exceed the plan limit. The RPC blocks when
      // current_count >= max, so we pass the count *after* the batch would be inserted.
      const projectedTotal = foods.length + foodsToAdd.length;
      const limit = await checkFeatureLimit('pantry_foods', projectedTotal - 1);
      if (!limit.allowed) {
        requestUpgradePrompt({
          feature: 'More pantry foods',
          message: limit.message,
        });
        return false;
      }

      const foodsWithUserData = foodsToAdd.map(f => ({ ...f, user_id: userId, household_id: householdId }));
      const { data, error } = await supabase
        .from('foods')
        .insert(foodsWithUserData)
        .select();

      if (error) {
        logger.error('Supabase addFoods error:', error);
        const localFoods = foodsToAdd.map(f => ({ ...f, id: generateId() }));
        setFoods(prev => [...prev, ...localFoods]);
      } else if (data) {
        setFoods(prev => [...prev, ...(data as unknown as Food[])]);
      }
      return true;
    }

    const localFoods = foodsToAdd.map(f => ({ ...f, id: generateId() }));
    setFoods(prev => [...prev, ...localFoods]);
    return true;
  }, [userId, householdId, foods.length]);

  const updateFoods = useCallback(async (updates: { id: string; updates: Partial<Food> }[]) => {
    if (!userId) {
      setFoods(prev => prev.map(f => {
        const update = updates.find(u => u.id === f.id);
        return update ? { ...f, ...update.updates } : f;
      }));
      return;
    }
    // US-320: optimistic bulk update; roll back all if any row fails.
    await runOptimisticMutation<Food>(
      setFoods,
      prev => prev.map(f => {
        const update = updates.find(u => u.id === f.id);
        return update ? { ...f, ...update.updates } : f;
      }),
      () =>
        Promise.all(
          updates.map(({ id, updates: foodUpdates }) =>
            supabase.from('foods').update(foodUpdates).eq('id', id)
          )
        ).then(results => ({ error: results.find(r => r.error)?.error ?? null })),
      { logLabel: 'Supabase updateFoods errors:', toastMessage: "Couldn't save all changes — reverted." }
    );
  }, [userId]);

  const deleteFoods = useCallback(async (ids: string[]) => {
    if (!userId) {
      setFoods(prev => prev.filter(f => !ids.includes(f.id)));
      return;
    }
    await runOptimisticMutation<Food>(
      setFoods,
      prev => prev.filter(f => !ids.includes(f.id)),
      () => supabase.from('foods').delete().in('id', ids),
      { logLabel: 'Supabase deleteFoods error:', toastMessage: "Couldn't delete those foods — restored." }
    );
  }, [userId]);

  const refreshFoods = useCallback(async () => {
    if (userId) {
      const { data } = await supabase.from('foods').select('*').order('name', { ascending: true }).limit(500);
      if (data) setFoods(data as unknown as Food[]);
    }
  }, [userId]);

  const value = useMemo(() => ({
    foods, setFoods, addFood, updateFood, deleteFood, addFoods, updateFoods, deleteFoods, refreshFoods
  }), [foods, addFood, updateFood, deleteFood, addFoods, updateFoods, deleteFoods, refreshFoods]);

  return (
    <FoodsContext.Provider value={value}>
      {children}
    </FoodsContext.Provider>
  );
}

export function useFoods() {
  const context = useContext(FoodsContext);
  if (!context) throw new Error("useFoods must be used within FoodsProvider");
  return context;
}
