import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { GroceryItem } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { generateId } from "@/lib/utils";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { registerSubscription, unregisterSubscription } from "@/hooks/useRealtimeSubscription";
import { runOptimisticMutation } from "@/lib/optimisticMutation";
import { useAuth } from "./AuthContext";
import { inferFoodCategory } from "@/lib/foodCategoryMap";
import { planGroceryMerge, splitIngredientBlock, type GroceryAddInput } from "@/lib/groceryMerge";
import { buildGroceryRow } from "@/lib/groceryRow";
import { parseGroceryItemRow, parseGroceryItemRows, upsertById, upsertManyById } from "@/lib/normalizeEntities";

interface RealtimePayload<T> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: T;
  old: T;
}

/**
 * Merge a realtime grocery payload into prior state (US-333). Normalizes the
 * raw snake_case row to a consistent client shape and dedupes by id (an INSERT
 * for an id we already hold — e.g. our own optimistic row — updates in place
 * rather than appending a duplicate).
 */
export function applyGroceryItemRealtime(
  prev: GroceryItem[],
  payload: RealtimePayload<Record<string, unknown>>,
): GroceryItem[] {
  if (payload.eventType === 'DELETE') {
    const id = (payload.old as { id?: string })?.id;
    return id ? prev.filter((i) => i.id !== id) : prev;
  }
  const item = parseGroceryItemRow(payload.new);
  if (!item) return prev; // US-536: drop an invalid realtime row
  const idx = prev.findIndex((i) => i.id === item.id);
  if (idx === -1) return [...prev, item];
  const next = prev.slice();
  next[idx] = item;
  return next;
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
  addGroceryItemsMerged: (
    items: GroceryAddInput[],
    opts?: { defaultListId?: string | null },
  ) => number;
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

    // Apply EVERY payload (US-525). A trailing debounce here coalesced distinct
    // events (a bulk insert, or a DELETE+INSERT pair within the window) down to
    // only the last one; each payload is a distinct row change and must be
    // folded in. applyGroceryItemRealtime is a cheap pure reducer, so there is
    // no reason to debounce it.
    const handleChange = (payload: RealtimePayload<Record<string, unknown>>) => {
      setGroceryItemsRaw((prev) => applyGroceryItemRealtime(prev, payload));
    };

    // Household-scoped channel name so switching households tears down the old
    // channel and opens a distinct one (no stale/duplicate channels). (US-332)
    const channelName = `grocery_items:${householdId}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'grocery_items',
        filter: `household_id=eq.${householdId}`
      }, handleChange)
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
      // US-777: one builder for both insert paths. This one used to carry its
      // own field list and was missing priority, price_per_unit and
      // added_by_user_id, so a priority set on a single add was lost while the
      // same field survived a bulk add.
      const newItem = buildGroceryRow(item, {
        userId,
        householdId,
        inferCategory: inferFoodCategory,
      });

      supabase.from('grocery_items').insert(newItem).select().single()
        .then(({ data, error }) => {
          if (error) {
            // US-717: a rejected insert used to append a locally-generated row
            // anyway, so the item looked added, reached the localStorage
            // backup, and existed nowhere else.
            logger.error('Supabase addGroceryItem error:', error);
            toast.error("Couldn't add that item. Please try again.");
          } else if (data) {
            const inserted = parseGroceryItemRow(data as Record<string, unknown>);
            if (inserted) setGroceryItemsRaw(prev => upsertById(prev, inserted));
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

  const addGroceryItemsMerged = useCallback((
    items: GroceryAddInput[],
    opts: { defaultListId?: string | null } = {},
  ): number => {
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
    //
    // US-714: scoped per target list. A batch normally shares one list, but a
    // caller may mix them, and merging across lists bumped a row the shopper
    // was not looking at instead of inserting the one they asked for.
    const byList = new Map<string | null, GroceryAddInput[]>();
    for (const item of expanded) {
      const key = item.grocery_list_id ?? null;
      const bucket = byList.get(key);
      if (bucket) bucket.push(item);
      else byList.set(key, [item]);
    }
    const plan = { inserts: [], updates: [] } as ReturnType<typeof planGroceryMerge>;
    for (const [listId, group] of byList) {
      const part = planGroceryMerge(group, groceryItems, {
        targetListId: listId,
        defaultListId: opts.defaultListId,
      });
      plan.inserts.push(...part.inserts);
      plan.updates.push(...part.updates);
    }

    // 1) Bump existing unchecked rows — ONE optimistic re-render + ONE request
    // (US-334), instead of looping updateGroceryItem (N writes + N re-renders).
    if (plan.updates.length > 0) {
      const byId = new Map(plan.updates.map((u) => [u.id, u]));
      const applyBumps = (prev: GroceryItem[]) =>
        prev.map((item) => {
          const u = byId.get(item.id);
          return u ? { ...item, quantity: u.quantity, unit: u.unit, name: u.name } : item;
        });
      if (userId) {
        // Single RPC bulk-update + rollback on error (reuses the US-320 helper).
        void runOptimisticMutation<GroceryItem>(
          setGroceryItemsRaw,
          applyBumps,
          () =>
            // types.ts is regenerated in CI and doesn't yet list this RPC.
            (
              supabase.rpc as unknown as (
                fn: string,
                args: Record<string, unknown>,
              ) => PromiseLike<{ error: unknown }>
            )('bump_grocery_item_quantities', { p_updates: plan.updates }),
          {
            logLabel: 'Supabase bump_grocery_item_quantities error:',
            toastMessage: "Couldn't merge those items — restored. Please try again.",
          },
        );
      } else {
        setGroceryItemsRaw(applyBumps);
      }
    }

    // 2) Insert the genuinely-new rows.
    if (plan.inserts.length > 0) {
      if (userId && householdId) {
        // US-777: the same builder the single-add path uses. Two hand-written
        // field lists is how US-713 and US-714 each had to restore columns
        // that one path dropped and the other kept.
        const rows = plan.inserts.map((item) =>
          buildGroceryRow(item, { userId, householdId, inferCategory: inferFoodCategory })
        );
        supabase.from('grocery_items').insert(rows).select()
          .then(({ data, error }) => {
            if (error) {
              // US-717: no phantom rows for a rejected bulk insert.
              logger.error('Supabase addGroceryItemsMerged error:', error);
              toast.error("Couldn't add those items. Please try again.");
            } else if (data) {
              setGroceryItemsRaw(prev => upsertManyById(prev, parseGroceryItemRows(data as unknown[])));
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
  }, [userId, householdId, groceryItems]);

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
