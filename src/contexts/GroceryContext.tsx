import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { GroceryItem } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { generateId, debounce } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { registerSubscription, unregisterSubscription } from "@/hooks/useRealtimeSubscription";
import { useAuth } from "./AuthContext";
import { inferFoodCategory } from "@/lib/foodCategoryMap";
import { resolveIngredientId } from "@/lib/ingredientResolver";

interface RealtimePayload<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: T;
}

interface GroceryContextType {
  groceryItems: GroceryItem[];
  setGroceryItems: (items: GroceryItem[]) => void;
  setGroceryItemsState: React.Dispatch<React.SetStateAction<GroceryItem[]>>;
  addGroceryItem: (item: Omit<GroceryItem, "id" | "checked">) => void;
  toggleGroceryItem: (id: string) => void;
  updateGroceryItem: (id: string, updates: Partial<GroceryItem>) => void;
  deleteGroceryItem: (id: string) => void;
  deleteGroceryItems: (ids: string[]) => void;
  clearCheckedGroceryItems: () => void;
}

const GroceryContext = createContext<GroceryContextType | undefined>(undefined);

export function GroceryProvider({ children }: { children: React.ReactNode }) {
  const [groceryItems, setGroceryItemsRaw] = useState<GroceryItem[]>([]);
  const { userId, householdId } = useAuth();

  // Real-time subscription for grocery_items
  useEffect(() => {
    if (!userId || !householdId) return;

    const debouncedUpdate = debounce((payload: RealtimePayload<GroceryItem>) => {
      if (payload.eventType === 'INSERT') {
        setGroceryItemsRaw(prev => {
          const exists = prev.some(item => item.id === payload.new.id);
          if (exists) return prev;
          return [...prev, payload.new];
        });
      } else if (payload.eventType === 'UPDATE') {
        setGroceryItemsRaw(prev => prev.map(item => item.id === payload.new.id ? payload.new : item));
      } else if (payload.eventType === 'DELETE') {
        setGroceryItemsRaw(prev => prev.filter(item => item.id !== payload.old.id));
      }
    }, 300);

    const channel = supabase
      .channel('grocery_items_changes')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'grocery_items',
        filter: `household_id=eq.${householdId}`
      }, debouncedUpdate)
      .subscribe();

    registerSubscription('grocery_items_changes', 'grocery_items');

    return () => {
      unregisterSubscription('grocery_items_changes');
      supabase.removeChannel(channel);
    };
  }, [userId, householdId]);

  const setGroceryItems = useCallback((items: GroceryItem[]) => {
    setGroceryItemsRaw(items);
  }, []);

  const addGroceryItem = useCallback((item: Omit<GroceryItem, "id" | "checked">) => {
    if (userId && householdId) {
      const newItem: Record<string, unknown> = {
        name: item.name, quantity: item.quantity || 1, unit: item.unit || '',
        category: item.category || inferFoodCategory(item.name), notes: item.notes || null,
        aisle: item.aisle || null, grocery_list_id: item.grocery_list_id || null,
        user_id: userId, household_id: householdId, checked: false
      };
      if (item.added_via) newItem.added_via = item.added_via;
      if (item.brand_preference) newItem.brand_preference = item.brand_preference;
      if (item.barcode) newItem.barcode = item.barcode;
      if (item.source_recipe_id) newItem.source_recipe_id = item.source_recipe_id;

      // US-303: resolve canonical ingredient_id. Best-effort; null on miss.
      // Caller-supplied ingredient_id wins if present (e.g. when adding from
      // a recipe-shortfall row that already carries the id).
      const ingredientPromise = item.ingredient_id !== undefined
        ? Promise.resolve(item.ingredient_id)
        : resolveIngredientId(item.name);

      void ingredientPromise.then((ingredient_id) => {
        newItem.ingredient_id = ingredient_id;
        return supabase.from('grocery_items').insert(newItem).select().single();
      }).then((result) => {
        if (!result) return;
        const { data, error } = result;
        if (error) {
          logger.error('Supabase addGroceryItem error:', error);
          setGroceryItemsRaw(prev => [...prev, {
            ...item,
            ingredient_id: newItem.ingredient_id as string | null | undefined,
            id: generateId(),
            checked: false,
          }]);
        } else if (data) {
          setGroceryItemsRaw(prev => [...prev, data as unknown as GroceryItem]);
        }
      });
    } else {
      setGroceryItemsRaw(prev => [...prev, { ...item, id: generateId(), checked: false }]);
    }
  }, [userId, householdId]);

  const toggleGroceryItem = useCallback((id: string) => {
    setGroceryItemsRaw(prev => {
      const item = prev.find(i => i.id === id);
      if (!item) return prev;
      const newChecked = !item.checked;

      if (userId) {
        supabase.from('grocery_items').update({ checked: newChecked }).eq('id', id)
          .then(({ error }) => {
            if (error) logger.error('Supabase toggleGroceryItem error:', error);
          });
      }

      return prev.map(i => i.id === id ? { ...i, checked: newChecked } : i);
    });
  }, [userId]);

  const updateGroceryItem = useCallback((id: string, updates: Partial<GroceryItem>) => {
    // US-303: when the name changes, re-resolve ingredient_id unless the
    // caller passed one explicitly.
    const applyUpdate = (finalUpdates: Partial<GroceryItem>) => {
      if (userId) {
        supabase.from('grocery_items').update(finalUpdates).eq('id', id)
          .then(({ error }) => {
            if (error) logger.error('Supabase updateGroceryItem error:', error);
            setGroceryItemsRaw(prev => prev.map(item => item.id === id ? { ...item, ...finalUpdates } : item));
          });
      } else {
        setGroceryItemsRaw(prev => prev.map(item => item.id === id ? { ...item, ...finalUpdates } : item));
      }
    };

    // Only re-resolve when logged in - the local-only branch needs to stay
    // synchronous so callers can assert on state immediately after the call.
    if (userId && updates.name !== undefined && updates.ingredient_id === undefined) {
      void resolveIngredientId(updates.name).then((ingredient_id) => {
        applyUpdate({ ...updates, ingredient_id });
      });
    } else {
      applyUpdate(updates);
    }
  }, [userId]);

  const deleteGroceryItem = useCallback((id: string) => {
    if (userId) {
      supabase.from('grocery_items').delete().eq('id', id)
        .then(({ error }) => {
          if (error) logger.error('Supabase deleteGroceryItem error:', error);
          setGroceryItemsRaw(prev => prev.filter(item => item.id !== id));
        });
    } else {
      setGroceryItemsRaw(prev => prev.filter(item => item.id !== id));
    }
  }, [userId]);

  const deleteGroceryItems = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    if (userId) {
      supabase.from('grocery_items').delete().in('id', ids)
        .then(({ error }) => {
          if (error) logger.error('Supabase deleteGroceryItems error:', error);
          const idSet = new Set(ids);
          setGroceryItemsRaw(prev => prev.filter(item => !idSet.has(item.id)));
        });
    } else {
      const idSet = new Set(ids);
      setGroceryItemsRaw(prev => prev.filter(item => !idSet.has(item.id)));
    }
  }, [userId]);

  const clearCheckedGroceryItems = useCallback(() => {
    setGroceryItemsRaw(prev => {
      const checkedIds = prev.filter(item => item.checked).map(item => item.id);
      if (userId && checkedIds.length > 0) {
        supabase.from('grocery_items').delete().in('id', checkedIds)
          .then(({ error }) => {
            if (error) logger.error('Supabase clearCheckedGroceryItems error:', error);
          });
      }
      return prev.filter(item => !item.checked);
    });
  }, [userId]);

  const value = useMemo(() => ({
    groceryItems, setGroceryItems, setGroceryItemsState: setGroceryItemsRaw,
    addGroceryItem, toggleGroceryItem, updateGroceryItem,
    deleteGroceryItem, deleteGroceryItems, clearCheckedGroceryItems
  }), [groceryItems, setGroceryItems, addGroceryItem, toggleGroceryItem,
    updateGroceryItem, deleteGroceryItem, deleteGroceryItems, clearCheckedGroceryItems]);

  return (
    <GroceryContext.Provider value={value}>
      {children}
    </GroceryContext.Provider>
  );
}

export function useGrocery() {
  const context = useContext(GroceryContext);
  if (!context) throw new Error("useGrocery must be used within GroceryProvider");
  return context;
}
