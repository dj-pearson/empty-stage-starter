import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { GroceryItem } from "@/types";
import { supabase } from "@/integrations/supabase/client";
import { generateId } from "@/lib/utils";
import { registerSubscription, unregisterSubscription } from "@/hooks/useRealtimeSubscription";
import { runOptimisticMutation } from "@/lib/optimisticMutation";
import { queueWrite, queueWrites } from "@/lib/webSyncQueue";
import { useAuth } from "./AuthContext";
import { inferFoodCategory } from "@/lib/foodCategoryMap";
import { planGroceryMerge, splitIngredientBlock, type GroceryAddInput } from "@/lib/groceryMerge";
import { buildGroceryRow, GROCERY_DRAFT_PASSTHROUGH_KEYS, type GroceryRowDraftWithId } from "@/lib/groceryRow";
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

/** A bumped row and what it held before, so an Undo can put it back exactly. */
export interface GroceryMergeBump {
  id: string;
  prev: { quantity: number; unit: string; name: string };
}

/**
 * What a merge did. `insertedIds` is known synchronously because
 * buildGroceryRow mints the ids on the client (US-823), so a caller never has
 * to guess which rows are its own by matching names.
 */
export interface GroceryMergeResult {
  /** List lines touched: inserts plus bumps. */
  touched: number;
  insertedIds: string[];
  bumps: GroceryMergeBump[];
}

/** Postgres unique_violation: the row is already there. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

/**
 * The insert draft that puts a row back exactly as it was: its own id, its
 * checked state, and every column the builder passes through. Reads the row
 * as a record because a loaded row carries columns (currency, item_id...)
 * the GroceryItem interface does not name.
 */
function restoreDraft(row: GroceryItem): GroceryRowDraftWithId {
  const source = row as unknown as Record<string, unknown>;
  const draft: Record<string, unknown> = {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    category: row.category,
    notes: row.notes ?? null,
    aisle: row.aisle ?? null,
    added_by_user_id: row.added_by_user_id ?? null,
    checked: row.checked,
  };
  for (const key of GROCERY_DRAFT_PASSTHROUGH_KEYS) {
    if (source[key] !== undefined) draft[key] = source[key];
  }
  return draft as unknown as GroceryRowDraftWithId;
}

interface GroceryContextType {
  groceryItems: GroceryItem[];
  /**
   * False until the list has something honest to show: the cache held rows, or
   * the server load for this account settled (either way). Lets the page tell
   * "still loading" from "your list is empty".
   */
  groceryHydrated: boolean;
  /** Set by AppContext, which owns the load. */
  setGroceryHydrated: (hydrated: boolean) => void;
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
  /** addGroceryItemsMerged with the detail an Undo needs. */
  mergeGroceryItems: (
    items: GroceryAddInput[],
    opts?: { defaultListId?: string | null },
  ) => GroceryMergeResult;
  /**
   * Put rows back under their original ids with every field they had,
   * checked state included. Optimistic, and queued as grocery.insert offline;
   * a row that is somehow still there reads as restored.
   */
  restoreGroceryItems: (rows: GroceryItem[]) => void;
  toggleGroceryItem: (id: string) => void;
  updateGroceryItem: (id: string, updates: Partial<GroceryItem>) => void;
  deleteGroceryItem: (id: string) => void;
  deleteGroceryItems: (ids: string[]) => void;
  clearCheckedGroceryItems: () => void;
}

const GroceryContext = createContext<GroceryContextType | undefined>(undefined);

export function GroceryProvider({ children }: { children: React.ReactNode }) {
  const [groceryItems, setGroceryItemsState] = useState<GroceryItem[]>([]);
  const [groceryHydrated, setGroceryHydratedState] = useState(false);
  const { userId, householdId } = useAuth();

  // The list as the NEXT render will see it. Callbacks that plan against the
  // list (merge, toggle, delete, clear) read this instead of the render's
  // `groceryItems`, so two merges fired in one tick stack onto the same row
  // instead of both planning against the list before either landed, and the
  // callbacks keep a stable identity while the list changes.
  //
  // It is written in two places. Every state update goes through
  // setGroceryItemsRaw below, whose updater records what it produced. And
  // every optimistic change is also applied to the ref eagerly (see
  // `project`), because React defers an updater while the fiber has pending
  // work, so the second of two back-to-back writes would otherwise read a ref
  // the first had not reached yet. The updater's later write is computed from
  // the real previous state, so the ref converges on it either way.
  const itemsRef = useRef<GroceryItem[]>([]);

  const setGroceryItemsRaw = useCallback<React.Dispatch<React.SetStateAction<GroceryItem[]>>>((action) => {
    if (typeof action !== "function") itemsRef.current = action;
    setGroceryItemsState((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      itemsRef.current = next;
      return next;
    });
  }, []);

  /** Apply an optimistic change to the ref now; returns it for the setState. */
  const project = useCallback((change: (prev: GroceryItem[]) => GroceryItem[]) => {
    itemsRef.current = change(itemsRef.current);
    return change;
  }, []);

  // Inserts still on their way to the server, by row id. A second merge in
  // the same moment can bump a row the first one is still inserting, and an
  // RPC that reaches Postgres before the row does updates nothing -- the
  // screen would say 2 and the database 1. So a bump waits for the inserts of
  // the rows it touches.
  const inFlightInserts = useRef(new Map<string, Promise<unknown>>());

  const setGroceryHydrated = useCallback((hydrated: boolean) => {
    setGroceryHydratedState(hydrated);
  }, []);

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
  }, [userId, householdId, setGroceryItemsRaw]);

  const setGroceryItems = useCallback((items: GroceryItem[]) => {
    setGroceryItemsRaw(items);
  }, [setGroceryItemsRaw]);

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

      // US-823: the row is on screen before the request goes out, and it
      // carries the id the insert is about to use, so the server's copy
      // REPLACES it rather than arriving beside it. US-717 still holds -- a
      // rejection that is not an offline failure rolls the row back off the
      // list, because an item that looks added and exists nowhere else is
      // worse than one that never appeared.
      const optimistic: GroceryItem = {
        ...item,
        id: newItem.id as string,
        unit: item.unit ?? '',
        category: newItem.category as GroceryItem['category'],
        checked: false,
      };
      let inserted: GroceryItem | null = null;

      void runOptimisticMutation<GroceryItem>(
        setGroceryItemsRaw,
        project(prev => [...prev, optimistic]),
        async () => {
          const { data, error } = await supabase
            .from('grocery_items')
            .insert(newItem)
            .select()
            .single();
          if (!error && data) inserted = parseGroceryItemRow(data as Record<string, unknown>);
          return { error };
        },
        {
          logLabel: 'Supabase addGroceryItem error:',
          toastMessage: "Couldn't add that item. Please try again.",
          offlineQueue: () => queueWrite(userId, 'grocery.insert', { row: newItem }),
        },
      ).then(() => {
        // Server defaults (created_at, and any column the table fills in) fold
        // over the optimistic row by id.
        if (inserted) setGroceryItemsRaw(prev => upsertById(prev, inserted as GroceryItem));
      });
    } else {
      setGroceryItemsRaw(prev => [...prev, { ...item, id: generateId(), checked: false }]);
    }
  }, [userId, householdId, setGroceryItemsRaw, project]);

  const toggleGroceryItem = useCallback((id: string) => {
    // Read the latest list from the ref, not a setState updater (deferred to
    // render, so unavailable for the branch below) and not the render's
    // closure (stale after a first tap in the same tick, which is how a quick
    // double tap used to set the same value twice instead of undoing).
    const item = itemsRef.current.find(i => i.id === id);
    if (!item) return;
    const newChecked = !item.checked;

    if (userId) {
      // US-320: optimistic toggle with rollback on server rejection.
      void runOptimisticMutation<GroceryItem>(
        setGroceryItemsRaw,
        project(prev => prev.map(i => i.id === id ? { ...i, checked: newChecked } : i)),
        () => supabase.from('grocery_items').update({ checked: newChecked }).eq('id', id),
        {
          logLabel: 'Supabase toggleGroceryItem error:',
          // US-823: checking items off in a shop with no signal is the whole
          // reason this queue exists.
          offlineQueue: () => queueWrite(userId, 'grocery.toggle', { id, checked: newChecked }),
        }
      );
    } else {
      setGroceryItemsRaw(project(prev => prev.map(i => i.id === id ? { ...i, checked: newChecked } : i)));
    }
  }, [userId, setGroceryItemsRaw, project]);

  const updateGroceryItem = useCallback((id: string, updates: Partial<GroceryItem>) => {
    if (userId) {
      void runOptimisticMutation<GroceryItem>(
        setGroceryItemsRaw,
        project(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item)),
        () => supabase.from('grocery_items').update(updates).eq('id', id),
        {
          logLabel: 'Supabase updateGroceryItem error:',
          offlineQueue: () => queueWrite(userId, 'grocery.update', { id, updates }),
        }
      );
    } else {
      setGroceryItemsRaw(project(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item)));
    }
  }, [userId, setGroceryItemsRaw, project]);


  const mergeGroceryItems = useCallback((
    items: GroceryAddInput[],
    opts: { defaultListId?: string | null } = {},
  ): GroceryMergeResult => {
    const empty: GroceryMergeResult = { touched: 0, insertedIds: [], bumps: [] };
    const cleaned = items.filter((i) => i.name && i.name.trim().length > 0);
    if (cleaned.length === 0) return empty;

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
    // piling up as separate rows. The ref, not the render's list: a second
    // merge in the same tick has to see the first one's rows.
    //
    // US-714: scoped per target list. A batch normally shares one list, but a
    // caller may mix them, and merging across lists bumped a row the shopper
    // was not looking at instead of inserting the one they asked for.
    const current = itemsRef.current;
    const byList = new Map<string | null, GroceryAddInput[]>();
    for (const item of expanded) {
      const key = item.grocery_list_id ?? null;
      const bucket = byList.get(key);
      if (bucket) bucket.push(item);
      else byList.set(key, [item]);
    }
    const plan = { inserts: [], updates: [] } as ReturnType<typeof planGroceryMerge>;
    for (const [listId, group] of byList) {
      const part = planGroceryMerge(group, current, {
        targetListId: listId,
        defaultListId: opts.defaultListId,
      });
      plan.inserts.push(...part.inserts);
      plan.updates.push(...part.updates);
    }

    const byIdNow = new Map(current.map((item) => [item.id, item]));
    const bumps: GroceryMergeBump[] = plan.updates.map((u) => {
      const before = byIdNow.get(u.id);
      return {
        id: u.id,
        prev: {
          quantity: before?.quantity ?? 0,
          unit: before?.unit ?? '',
          name: before?.name ?? u.name,
        },
      };
    });

    // 1) Bump existing unchecked rows — ONE optimistic re-render + ONE request
    // (US-334), instead of looping updateGroceryItem (N writes + N re-renders).
    if (plan.updates.length > 0) {
      const byId = new Map(plan.updates.map((u) => [u.id, u]));
      const applyBumps = project((prev: GroceryItem[]) =>
        prev.map((item) => {
          const u = byId.get(item.id);
          return u ? { ...item, quantity: u.quantity, unit: u.unit, name: u.name } : item;
        }));
      if (userId) {
        const waitFor = plan.updates
          .map((u) => inFlightInserts.current.get(u.id))
          .filter((p): p is Promise<unknown> => p !== undefined);
        // Single RPC bulk-update + rollback on error (reuses the US-320 helper).
        void runOptimisticMutation<GroceryItem>(
          setGroceryItemsRaw,
          applyBumps,
          async () => {
            if (waitFor.length > 0) await Promise.all(waitFor);
            // types.ts is regenerated in CI and doesn't yet list this RPC.
            return (
              supabase.rpc as unknown as (
                fn: string,
                args: Record<string, unknown>,
              ) => PromiseLike<{ error: unknown }>
            )('bump_grocery_item_quantities', { p_updates: plan.updates });
          },
          {
            logLabel: 'Supabase bump_grocery_item_quantities error:',
            toastMessage: "Couldn't merge those items — restored. Please try again.",
            // Offline, the bump used to roll back while the insert beside it
            // was queued, so half of one add survived. Each update carries
            // the absolute value, not a delta, so a replay that lands twice
            // still lands on the same number.
            offlineQueue: () =>
              queueWrites(
                userId,
                'grocery.update',
                plan.updates.map((u) => ({
                  id: u.id,
                  updates: { quantity: u.quantity, unit: u.unit, name: u.name },
                })),
              ),
          },
        );
      } else {
        setGroceryItemsRaw(applyBumps);
      }
    }

    // 2) Insert the genuinely-new rows.
    let insertedIds: string[] = [];
    if (plan.inserts.length > 0) {
      if (userId && householdId) {
        // US-777: the same builder the single-add path uses. Two hand-written
        // field lists is how US-713 and US-714 each had to restore columns
        // that one path dropped and the other kept.
        const rows = plan.inserts.map((item) =>
          buildGroceryRow(item, { userId, householdId, inferCategory: inferFoodCategory })
        );
        insertedIds = rows.map((row) => row.id as string);
        // US-823: same shape as the single add. The rows carry their own ids,
        // so they go on screen first and the server's copies replace them by
        // id; offline, each row is queued as its own op so one the server
        // later refuses cannot take the rest of the shop with it.
        const optimisticRows: GroceryItem[] = plan.inserts.map((item, i) => ({
          ...item,
          id: rows[i].id as string,
          unit: item.unit ?? '',
          category: rows[i].category as GroceryItem['category'],
          checked: false,
        }) as GroceryItem);
        let insertedRows: GroceryItem[] = [];
        let settle: () => void = () => {};
        const landed = new Promise<void>((resolve) => { settle = resolve; });
        for (const id of insertedIds) inFlightInserts.current.set(id, landed);

        void runOptimisticMutation<GroceryItem>(
          setGroceryItemsRaw,
          project(prev => [...prev, ...optimisticRows]),
          async () => {
            const { data, error } = await supabase.from('grocery_items').insert(rows).select();
            if (!error && data) insertedRows = parseGroceryItemRows(data as unknown[]);
            return { error };
          },
          {
            // US-717: no phantom rows for a rejected bulk insert.
            logLabel: 'Supabase addGroceryItemsMerged error:',
            toastMessage: "Couldn't add those items. Please try again.",
            offlineQueue: () =>
              queueWrites(userId, 'grocery.insert', rows.map((row) => ({ row }))),
          },
        ).then(() => {
          if (insertedRows.length > 0) {
            setGroceryItemsRaw(prev => upsertManyById(prev, insertedRows));
          }
        }).finally(() => {
          // Released only once the insert has landed, been queued, or been
          // rolled back, so an offline bump is queued AFTER the insert it
          // depends on and the FIFO replay sends them in that order.
          for (const id of insertedIds) {
            if (inFlightInserts.current.get(id) === landed) inFlightInserts.current.delete(id);
          }
          settle();
        });
      } else {
        const localRows = plan.inserts.map(i => ({ ...i, unit: i.unit ?? '', category: i.category as GroceryItem['category'], id: generateId(), checked: false }) as GroceryItem);
        insertedIds = localRows.map((row) => row.id);
        setGroceryItemsRaw(project(prev => [...prev, ...localRows]));
      }
    }

    return { touched: plan.inserts.length + plan.updates.length, insertedIds, bumps };
  }, [userId, householdId, setGroceryItemsRaw, project]);

  const addGroceryItemsMerged = useCallback((
    items: GroceryAddInput[],
    opts: { defaultListId?: string | null } = {},
  ): number => mergeGroceryItems(items, opts).touched, [mergeGroceryItems]);

  const restoreGroceryItems = useCallback((rows: GroceryItem[]) => {
    if (rows.length === 0) return;
    if (userId && householdId) {
      const dbRows = rows.map((row) =>
        buildGroceryRow(restoreDraft(row), { userId, householdId, inferCategory: inferFoodCategory })
      );
      // On screen exactly as they were, under the same ids, so an undo of a
      // checkout or a retire does not reshuffle the list or lose a field.
      const restored = rows.map((row) => ({ ...row }));
      let insertedRows: GroceryItem[] = [];

      void runOptimisticMutation<GroceryItem>(
        setGroceryItemsRaw,
        project(prev => upsertManyById(prev, restored)),
        async () => {
          const first = await supabase.from('grocery_items').insert(dbRows).select();
          if (!first.error) {
            if (first.data) insertedRows = parseGroceryItemRows(first.data as unknown[]);
            return { error: null };
          }
          if (!isUniqueViolation(first.error)) return { error: first.error };
          // One of them is already there (the delete never landed, or a
          // replay beat us). A batch insert is all-or-nothing, so the others
          // go one at a time and a duplicate reads as restored.
          for (const row of dbRows) {
            const { data, error } = await supabase.from('grocery_items').insert(row).select();
            if (error && !isUniqueViolation(error)) return { error };
            if (!error && data) insertedRows.push(...parseGroceryItemRows(data as unknown[]));
          }
          return { error: null };
        },
        {
          logLabel: 'Supabase restoreGroceryItems error:',
          toastMessage: "Couldn't put those items back. Please try again.",
          offlineQueue: () =>
            queueWrites(userId, 'grocery.insert', dbRows.map((row) => ({ row }))),
        },
      ).then(() => {
        if (insertedRows.length > 0) {
          setGroceryItemsRaw(prev => upsertManyById(prev, insertedRows));
        }
      });
    } else {
      setGroceryItemsRaw(project(prev => upsertManyById(prev, rows.map((row) => ({ ...row })))));
    }
  }, [userId, householdId, setGroceryItemsRaw, project]);

  const deleteGroceryItem = useCallback((id: string) => {
    const remove = project((prev: GroceryItem[]) => prev.filter(item => item.id !== id));
    if (userId) {
      void runOptimisticMutation<GroceryItem>(
        setGroceryItemsRaw,
        remove,
        () => supabase.from('grocery_items').delete().eq('id', id),
        {
          logLabel: 'Supabase deleteGroceryItem error:',
          toastMessage: "Couldn't delete that item — restored. Please try again.",
          offlineQueue: () => queueWrite(userId, 'grocery.delete', { id }),
        }
      );
    } else {
      setGroceryItemsRaw(remove);
    }
  }, [userId, setGroceryItemsRaw, project]);

  const deleteGroceryItems = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const remove = project((prev: GroceryItem[]) => prev.filter(item => !idSet.has(item.id)));
    if (userId) {
      void runOptimisticMutation<GroceryItem>(
        setGroceryItemsRaw,
        remove,
        () => supabase.from('grocery_items').delete().in('id', ids),
        {
          logLabel: 'Supabase deleteGroceryItems error:',
          toastMessage: "Couldn't delete those items — restored.",
          offlineQueue: () => queueWrites(userId, 'grocery.delete', ids.map((rowId) => ({ id: rowId }))),
        }
      );
    } else {
      setGroceryItemsRaw(remove);
    }
  }, [userId, setGroceryItemsRaw, project]);

  const clearCheckedGroceryItems = useCallback(() => {
    // Read from the ref rather than firing the network call inside a setState
    // updater (a side-effect anti-pattern that can double-fire under
    // StrictMode), and rather than the render's closure, which misses a tick
    // made in the same event.
    const checkedIds = itemsRef.current.filter(item => item.checked).map(item => item.id);
    if (checkedIds.length === 0) return;
    const idSet = new Set(checkedIds);
    const remove = project((prev: GroceryItem[]) => prev.filter(item => !idSet.has(item.id)));

    if (userId) {
      // US-320: optimistic clear with rollback on server rejection.
      void runOptimisticMutation<GroceryItem>(
        setGroceryItemsRaw,
        remove,
        () => supabase.from('grocery_items').delete().in('id', checkedIds),
        {
          logLabel: 'Supabase clearCheckedGroceryItems error:',
          toastMessage: "Couldn't clear checked items — restored.",
          offlineQueue: () => queueWrites(userId, 'grocery.delete', checkedIds.map((rowId) => ({ id: rowId }))),
        }
      );
    } else {
      setGroceryItemsRaw(remove);
    }
  }, [userId, setGroceryItemsRaw, project]);

  const value = useMemo(() => ({
    groceryItems, groceryHydrated, setGroceryHydrated,
    setGroceryItems, setGroceryItemsState: setGroceryItemsRaw,
    addGroceryItem, addGroceryItemsMerged, mergeGroceryItems, restoreGroceryItems,
    toggleGroceryItem, updateGroceryItem,
    deleteGroceryItem, deleteGroceryItems, clearCheckedGroceryItems
  }), [groceryItems, groceryHydrated, setGroceryHydrated, setGroceryItems, setGroceryItemsRaw,
    addGroceryItem, addGroceryItemsMerged, mergeGroceryItems, restoreGroceryItems, toggleGroceryItem,
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
