import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { GroceryItem } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { generateId, debounce } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { registerSubscription, unregisterSubscription } from "@/hooks/useRealtimeSubscription";
import { runOptimisticMutation } from "@/lib/optimisticMutation";
import { useAuth } from "./AuthContext";
import { inferFoodCategory } from "@/lib/foodCategoryMap";
import { planGroceryMerge, splitIngredientBlock, type GroceryAddInput } from "@/lib/groceryMerge";

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
  /**
   * Bulk-add that STACKS duplicates: same-ingredient lines (e.g. "ground beef"
   * + "ground beef 80/20") collapse into one row with a unit-aware summed
   * quantity, folding into an existing unchecked row when one matches.
   * Returns how many list lines were touched (inserts + merges).
   */
  addGroceryItemsMerged: (items: GroceryAddInput[]) => number;
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

    // Household-scoped channel name so switching households tears down the old
    // channel and opens a distinct one (no stale/duplicate channels). (US-332)
    const channelName = `grocery_items:${householdId}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'grocery_items',
        filter: `household_id=eq.${householdId}`
      }, debouncedUpdate)
      .subscribe();

    registerSubscription(channelName, 'grocery_items');

    return () => {
      unregisterSubscription(channelName);
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

      supabase.from('grocery_items').insert(newItem).select().single()
        .then(({ data, error }) => {
          if (error) {
            logger.error('Supabase addGroceryItem error:', error);
            setGroceryItemsRaw(prev => [...prev, { ...item, id: generateId(), checked: false }]);
          } else if (data) {
            setGroceryItemsRaw(prev => [...prev, data as unknown as GroceryItem]);
          }
        });
    } else {
      setGroceryItemsRaw(prev => [...prev, { ...item, id: generateId(), checked: false }]);
    }
  }, [userId, householdId]);

  const toggleGroceryItem = useCallback((id: string) => {
    // Read current state from the closure (groceryItems is in deps) — not via
    // a setState updater, whose run is deferred to render and so wouldn't be
    // available for the synchronous branch below.
    const item = groceryItems.find(i => i.id === id);
    if (!item) return;
    const newChecked = !item.checked;

    if (userId) {
      // US-320: optimistic toggle with rollback on server rejection.
      void runOptimisticMutation<GroceryItem>(
        setGroceryItemsRaw,
        prev => prev.map(i => i.id === id ? { ...i, checked: newChecked } : i),
        () => supabase.from('grocery_items').update({ checked: newChecked }).eq('id', id),
        { logLabel: 'Supabase toggleGroceryItem error:' }
      );
    } else {
      setGroceryItemsRaw(prev => prev.map(i => i.id === id ? { ...i, checked: newChecked } : i));
    }
  }, [userId, groceryItems]);

  const updateGroceryItem = useCallback((id: string, updates: Partial<GroceryItem>) => {
    if (userId) {
      void runOptimisticMutation<GroceryItem>(
        setGroceryItemsRaw,
        prev => prev.map(item => item.id === id ? { ...item, ...updates } : item),
        () => supabase.from('grocery_items').update(updates).eq('id', id),
        { logLabel: 'Supabase updateGroceryItem error:' }
      );
    } else {
      setGroceryItemsRaw(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
    }
  }, [userId]);

  const addGroceryItemsMerged = useCallback((items: GroceryAddInput[]): number => {
    const cleaned = items.filter((i) => i.name && i.name.trim().length > 0);
    if (cleaned.length === 0) return 0;

    // Issue #2: a recipe whose ingredients arrived as one newline/bullet blob
    // should explode into individual lines. Only split on hard separators
    // (newline / bullet) so plain names like "beef, ground" stay intact.
    const expanded = cleaned.flatMap((i) =>
      /[\n\r•·]/.test(i.name)
        ? splitIngredientBlock(i.name).map((s) => ({
            ...i,
            name: s.name,
            quantity: s.quantity || i.quantity,
            unit: s.unit || i.unit,
          }))
        : [i]
    );

    // Plan against the current list so duplicates stack (issue #3) instead of
    // piling up as separate rows.
    const plan = planGroceryMerge(expanded, groceryItems);

    // 1) Bump existing unchecked rows.
    for (const u of plan.updates) {
      updateGroceryItem(u.id, { quantity: u.quantity, unit: u.unit, name: u.name });
    }

    // 2) Insert the genuinely-new rows.
    if (plan.inserts.length > 0) {
      if (userId && householdId) {
        const rows = plan.inserts.map((item) => {
          const row: Record<string, unknown> = {
            name: item.name,
            quantity: item.quantity || 1,
            unit: item.unit || '',
            category: item.category || inferFoodCategory(item.name),
            notes: item.notes || null,
            aisle: item.aisle || null,
            user_id: userId,
            household_id: householdId,
            checked: false,
          };
          if (item.added_via) row.added_via = item.added_via;
          if (item.source_recipe_id) row.source_recipe_id = item.source_recipe_id;
          return row;
        });
        supabase.from('grocery_items').insert(rows).select()
          .then(({ data, error }) => {
            if (error) {
              logger.error('Supabase addGroceryItemsMerged error:', error);
              setGroceryItemsRaw(prev => [
                ...prev,
                ...plan.inserts.map(i => ({ ...i, unit: i.unit ?? '', category: i.category as GroceryItem['category'], id: generateId(), checked: false }) as GroceryItem),
              ]);
            } else if (data) {
              setGroceryItemsRaw(prev => [...prev, ...(data as unknown as GroceryItem[])]);
            }
          });
      } else {
        setGroceryItemsRaw(prev => [
          ...prev,
          ...plan.inserts.map(i => ({ ...i, unit: i.unit ?? '', category: i.category as GroceryItem['category'], id: generateId(), checked: false }) as GroceryItem),
        ]);
      }
    }

    return plan.inserts.length + plan.updates.length;
  }, [userId, householdId, groceryItems, updateGroceryItem]);

  const deleteGroceryItem = useCallback((id: string) => {
    if (userId) {
      void runOptimisticMutation<GroceryItem>(
        setGroceryItemsRaw,
        prev => prev.filter(item => item.id !== id),
        () => supabase.from('grocery_items').delete().eq('id', id),
        { logLabel: 'Supabase deleteGroceryItem error:', toastMessage: "Couldn't delete that item — restored. Please try again." }
      );
    } else {
      setGroceryItemsRaw(prev => prev.filter(item => item.id !== id));
    }
  }, [userId]);

  const deleteGroceryItems = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    if (userId) {
      void runOptimisticMutation<GroceryItem>(
        setGroceryItemsRaw,
        prev => prev.filter(item => !idSet.has(item.id)),
        () => supabase.from('grocery_items').delete().in('id', ids),
        { logLabel: 'Supabase deleteGroceryItems error:', toastMessage: "Couldn't delete those items — restored." }
      );
    } else {
      setGroceryItemsRaw(prev => prev.filter(item => !idSet.has(item.id)));
    }
  }, [userId]);

  const clearCheckedGroceryItems = useCallback(() => {
    // Read from the closure (groceryItems is in deps) rather than firing the
    // network call inside a setState updater (a side-effect anti-pattern that
    // can double-fire under StrictMode).
    const checkedIds = groceryItems.filter(item => item.checked).map(item => item.id);
    if (checkedIds.length === 0) return;
    const idSet = new Set(checkedIds);

    if (userId) {
      // US-320: optimistic clear with rollback on server rejection.
      void runOptimisticMutation<GroceryItem>(
        setGroceryItemsRaw,
        prev => prev.filter(item => !idSet.has(item.id)),
        () => supabase.from('grocery_items').delete().in('id', checkedIds),
        { logLabel: 'Supabase clearCheckedGroceryItems error:', toastMessage: "Couldn't clear checked items — restored." }
      );
    } else {
      setGroceryItemsRaw(prev => prev.filter(item => !idSet.has(item.id)));
    }
  }, [userId, groceryItems]);

  const value = useMemo(() => ({
    groceryItems, setGroceryItems, setGroceryItemsState: setGroceryItemsRaw,
    addGroceryItem, addGroceryItemsMerged, toggleGroceryItem, updateGroceryItem,
    deleteGroceryItem, deleteGroceryItems, clearCheckedGroceryItems
  }), [groceryItems, setGroceryItems, addGroceryItem, addGroceryItemsMerged, toggleGroceryItem,
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
