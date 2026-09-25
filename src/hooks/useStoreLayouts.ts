import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getStorage } from "@/lib/platform";
import { assertUUID } from "@/lib/query-sanitize";
import { logger } from "@/lib/logger";
import {
  isCatalogStore,
  sortAislesByWalk,
  storeDisplayName,
  type FoodAisleMappingInsert,
  type StoreAisleRow,
  type StoreLayoutRow,
  type StoreLayoutWithAisles,
} from "@/lib/storeLayouts";
import { parseAisleOverrides, type WalkOrderContext } from "@/lib/storeWalkOrder";
import "@/i18n/appLocale";

export interface UseStoreLayoutsResult {
  /** The household's own stores, then the shared catalog chains, each by name. */
  stores: StoreLayoutRow[];
  /** The store chosen for the selected list (grocery_lists.store_layout_id). */
  selectedStore: StoreLayoutRow | null;
  /** Point the selected list at a store, or at the typical store with null. */
  setSelectedStoreId: (id: string | null) => Promise<void>;
  /** Hand this to sortAisleGroupNames / aislePosition. Null means the typical store. */
  walkContext: WalkOrderContext | null;
  /** The selected custom store's aisles in walk order. Empty for chains. */
  aisles: StoreAisleRow[];
  /** Best-effort: remember that this food lives in this aisle of the selected store. */
  rememberAisle: (foodName: string, aisleId: string) => void;
  refresh: () => Promise<void>;
}

interface StoreCache {
  stores: StoreLayoutWithAisles[];
  /** list id -> store id, so a reload walks the store before the server answers. */
  byList: Record<string, string | null>;
}

export const storeLayoutsCacheKey = (householdId: string | null) =>
  `grocery:storeLayouts:${householdId ?? "personal"}`;

const isStoreCache = (value: unknown): value is StoreCache =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as StoreCache).stores) &&
  typeof (value as StoreCache).byList === "object" &&
  (value as StoreCache).byList !== null;

const sortStores = (rows: StoreLayoutWithAisles[]) =>
  [...rows].sort((a, b) => {
    const ac = isCatalogStore(a);
    const bc = isCatalogStore(b);
    if (ac !== bc) return ac ? 1 : -1;
    return storeDisplayName(a).localeCompare(storeDisplayName(b));
  });

const stripAisles = ({ store_aisles: _aisles, ...row }: StoreLayoutWithAisles): StoreLayoutRow => row;

/**
 * The stores a list can be walked in, and which one the selected list uses.
 *
 * One embedded select brings the household's stores, their aisles and the
 * shared catalog chains (household_id and user_id null; RLS exposes them to
 * everyone). The selection lives on grocery_lists.store_layout_id -- the field
 * iOS reads -- so a store picked on the phone app walks the same way here.
 */
export function useStoreLayouts(householdId: string | null, selectedListId: string | null): UseStoreLayoutsResult {
  const { t } = useTranslation();
  const [stores, setStores] = useState<StoreLayoutWithAisles[]>([]);
  const [byList, setByList] = useState<Record<string, string | null>>({});
  const byListRef = useRef(byList);
  byListRef.current = byList;

  const cacheRef = useRef<StoreCache>({ stores: [], byList: {} });
  const layoutsSeq = useRef(0);
  const selectionSeq = useRef(0);
  const householdRef = useRef(householdId);
  householdRef.current = householdId;
  const listRef = useRef(selectedListId);
  listRef.current = selectedListId;

  const persist = useCallback(async (next: Partial<StoreCache>) => {
    cacheRef.current = { ...cacheRef.current, ...next };
    try {
      const storage = await getStorage();
      await storage.setItem(storeLayoutsCacheKey(householdRef.current), JSON.stringify(cacheRef.current));
    } catch (err) {
      logger.warn("Could not cache store layouts", err);
    }
  }, []);

  const fetchLayouts = useCallback(async () => {
    const hid = householdRef.current;
    const seq = ++layoutsSeq.current;
    try {
      let query = supabase.from("store_layouts").select("*, store_aisles(*)");
      if (hid) query = query.or(`household_id.is.null,household_id.eq.${assertUUID(hid, "householdId")}`);
      const { data, error } = await query;
      if (seq !== layoutsSeq.current) return;
      if (error || !data) {
        logger.error("Error loading store layouts:", error);
        return;
      }
      const sorted = sortStores(data);
      setStores(sorted);
      void persist({ stores: sorted });
    } catch (err) {
      logger.error("Error loading store layouts:", err);
    }
  }, [persist]);

  const fetchSelection = useCallback(async () => {
    const listId = listRef.current;
    if (!listId) return;
    const seq = ++selectionSeq.current;
    try {
      const { data, error } = await supabase
        .from("grocery_lists")
        .select("store_layout_id")
        .eq("id", listId)
        .maybeSingle();
      if (seq !== selectionSeq.current || error || !data) return;
      setByList((prev) => ({ ...prev, [listId]: data.store_layout_id }));
      void persist({ byList: { ...cacheRef.current.byList, [listId]: data.store_layout_id } });
    } catch (err) {
      logger.error("Error loading the list's store:", err);
    }
  }, [persist]);

  // Cache first, then the server, per household.
  useEffect(() => {
    let cancelled = false;
    layoutsSeq.current += 1;
    setStores([]);
    setByList({});
    cacheRef.current = { stores: [], byList: {} };

    void (async () => {
      try {
        const storage = await getStorage();
        const raw = await storage.getItem(storeLayoutsCacheKey(householdId));
        if (cancelled || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (!isStoreCache(parsed)) return;
        cacheRef.current = parsed;
        setStores((prev) => (prev.length === 0 ? parsed.stores : prev));
        setByList((prev) => ({ ...parsed.byList, ...prev }));
      } catch (err) {
        logger.warn("Could not read cached store layouts", err);
      }
    })();

    void fetchLayouts();
    return () => {
      cancelled = true;
    };
  }, [householdId, fetchLayouts]);

  useEffect(() => {
    void fetchSelection();
  }, [selectedListId, fetchSelection]);

  const selectedStoreId = selectedListId ? (byList[selectedListId] ?? null) : null;
  const selectedWithAisles = useMemo(
    () => stores.find((s) => s.id === selectedStoreId) ?? null,
    [stores, selectedStoreId],
  );

  const aisles = useMemo(
    () => (selectedWithAisles ? sortAislesByWalk(selectedWithAisles.store_aisles ?? []) : []),
    [selectedWithAisles],
  );

  const walkContext = useMemo<WalkOrderContext | null>(() => {
    if (!selectedWithAisles) return null;
    if (aisles.length > 0) return { kind: "custom", storeId: selectedWithAisles.id, aisles };
    const overrides = parseAisleOverrides(selectedWithAisles.aisle_overrides);
    if (isCatalogStore(selectedWithAisles) || Object.keys(overrides).length > 0) {
      return { kind: "catalog", storeId: selectedWithAisles.id, overrides };
    }
    // A custom store with no aisles yet walks like the typical store.
    return { kind: "custom", storeId: selectedWithAisles.id, aisles: [] };
  }, [selectedWithAisles, aisles]);

  const setSelectedStoreId = useCallback(
    async (id: string | null) => {
      const listId = listRef.current;
      if (!listId) return;
      const previous = byListRef.current[listId] ?? null;
      setByList((prev) => ({ ...prev, [listId]: id }));
      selectionSeq.current += 1; // a slower read of the old value must not land on top
      try {
        const { data, error } = await supabase
          .from("grocery_lists")
          .update({ store_layout_id: id })
          .eq("id", listId)
          .select("id");
        if (error) throw error;
        if (!data || data.length === 0) throw new Error("No list updated");
        void persist({ byList: { ...cacheRef.current.byList, [listId]: id } });
      } catch (err) {
        logger.error("Error choosing the list's store:", err);
        setByList((prev) => ({ ...prev, [listId]: previous }));
        toast.error(t("grocery.stores.picker.saveFailed", "Couldn't change the store. Try again."));
      }
    },
    [persist, t],
  );

  const rememberAisle = useCallback(
    (foodName: string, aisleId: string) => {
      const storeId = selectedWithAisles?.id;
      const name = foodName.trim();
      if (!storeId || !name) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      void (async () => {
        try {
          const { data: auth } = await supabase.auth.getUser();
          const row: FoodAisleMappingInsert = {
            store_layout_id: storeId,
            food_name: name,
            store_aisle_id: aisleId,
            // The table carries both aisle columns (two migrations merged);
            // set both so either reader finds it.
            aisle_id: aisleId,
            user_id: auth.user?.id ?? null,
          };
          // UNIQUE(store_layout_id, food_name): re-placing a food in the same
          // store moves it rather than failing on the second pick.
          const { error } = await supabase
            .from("food_aisle_mappings")
            .upsert(row, { onConflict: "store_layout_id,food_name" });
          if (error) logger.warn("Could not remember the aisle for a food", error);
        } catch (err) {
          logger.warn("Could not remember the aisle for a food", err);
        }
      })();
    },
    [selectedWithAisles],
  );

  const refresh = useCallback(async () => {
    await Promise.all([fetchLayouts(), fetchSelection()]);
  }, [fetchLayouts, fetchSelection]);

  const plainStores = useMemo(() => stores.map(stripAisles), [stores]);
  const selectedStore = useMemo(
    () => (selectedWithAisles ? stripAisles(selectedWithAisles) : null),
    [selectedWithAisles],
  );

  return {
    stores: plainStores,
    selectedStore,
    setSelectedStoreId,
    walkContext,
    aisles,
    rememberAisle,
    refresh,
  };
}
