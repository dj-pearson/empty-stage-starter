import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getStorage } from "@/lib/platform";
import { assertUUID } from "@/lib/query-sanitize";
import { logger } from "@/lib/logger";

export type GroceryListRow = Database["public"]["Tables"]["grocery_lists"]["Row"];

export interface UseGroceryListsResult {
  lists: GroceryListRow[];
  /** The household default: the oldest list flagged is_default, else the oldest list. */
  defaultListId: string | null;
  /** The stored selection while it still exists, otherwise the default. */
  selectedListId: string | null;
  setSelectedListId: (id: string) => void;
  loading: boolean;
  /** The last server fetch failed. Cached lists, if any, are still in `lists`. */
  error: boolean;
  refresh: () => Promise<void>;
  /** Put a row the caller just wrote into the list, then confirm with the server. */
  upsertLocal: (row: GroceryListRow) => void;
  /** Drop a row the caller just deleted, then confirm with the server. */
  removeLocal: (id: string) => void;
}

export const listsCacheKey = (userId: string) => `grocery:lists:${userId}`;
export const selectedListCacheKey = (userId: string) => `grocery:selectedList:${userId}`;

const createdAtMs = (row: GroceryListRow) => {
  const ms = row.created_at ? Date.parse(row.created_at) : NaN;
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
};

const byOldest = (a: GroceryListRow, b: GroceryListRow) =>
  createdAtMs(a) - createdAtMs(b) || a.id.localeCompare(b.id);

/**
 * Two rows can both carry is_default (the web cleared defaults by user_id while
 * iOS wrote by household), so "the default" needs a rule that every client
 * agrees on: the oldest one wins.
 */
export function pickDefaultListId(lists: GroceryListRow[]): string | null {
  const defaults = lists.filter((l) => l.is_default).sort(byOldest);
  if (defaults.length > 0) return defaults[0].id;
  const oldest = [...lists].sort(byOldest)[0];
  return oldest?.id ?? null;
}

const isListRowArray = (value: unknown): value is GroceryListRow[] =>
  Array.isArray(value) &&
  value.every((r) => typeof r === "object" && r !== null && typeof (r as { id?: unknown }).id === "string");

/**
 * The household's grocery lists and which one is on screen.
 *
 * Load precedence follows US-341: the cache paints first, a successful server
 * fetch replaces it wholesale, and a failed one leaves the cache on screen with
 * `error` set so the UI can offer a retry instead of "Create your first list".
 *
 * US-864: the fetch runs once per identity (userId, householdId), once per
 * mutation and once per window focus -- never because the selection changed or
 * because a caller passed a new callback. Everything the effect reads that is
 * not part of the filter sits in a ref.
 */
export function useGroceryLists(userId: string | null, householdId: string | null): UseGroceryListsResult {
  const [lists, setLists] = useState<GroceryListRow[]>([]);
  const [storedSelection, setStoredSelection] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(userId));
  const [error, setError] = useState(false);

  const requestSeq = useRef(0);
  const serverAnswered = useRef(false);
  const inFlight = useRef(false);
  const identity = useRef({ userId, householdId });
  identity.current = { userId, householdId };

  const writeCache = useCallback(async (uid: string, rows: GroceryListRow[]) => {
    try {
      const storage = await getStorage();
      await storage.setItem(listsCacheKey(uid), JSON.stringify(rows));
    } catch (err) {
      logger.warn("Could not cache grocery lists", err);
    }
  }, []);

  const fetchLists = useCallback(async () => {
    const { userId: uid, householdId: hid } = identity.current;
    if (!uid) return;
    const seq = ++requestSeq.current;
    inFlight.current = true;
    try {
      let query = supabase
        .from("grocery_lists")
        .select("*")
        .eq("is_archived", false)
        .order("is_default", { ascending: false })
        .order("name");
      query = hid
        ? query.or(`user_id.eq.${assertUUID(uid, "userId")},household_id.eq.${assertUUID(hid, "householdId")}`)
        : query.eq("user_id", uid);

      const { data, error: fetchError } = await query;
      if (seq !== requestSeq.current) return;
      if (fetchError || !data) {
        logger.error("Error loading grocery lists:", fetchError);
        setError(true);
        return;
      }
      serverAnswered.current = true;
      setLists(data);
      setError(false);
      void writeCache(uid, data);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      logger.error("Error loading grocery lists:", err);
      setError(true);
    } finally {
      if (seq === requestSeq.current) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }, [writeCache]);

  // Hydrate from the cache, then ask the server. Keyed on identity only.
  useEffect(() => {
    requestSeq.current += 1; // drop any response for the previous identity
    serverAnswered.current = false;
    setLists([]);
    setStoredSelection(null);
    setError(false);
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;

    void (async () => {
      try {
        const storage = await getStorage();
        const [rawLists, rawSelected] = await Promise.all([
          storage.getItem(listsCacheKey(userId)),
          storage.getItem(selectedListCacheKey(userId)),
        ]);
        if (cancelled) return;
        if (rawSelected) setStoredSelection(rawSelected);
        if (rawLists && !serverAnswered.current) {
          const parsed: unknown = JSON.parse(rawLists);
          if (isListRowArray(parsed)) setLists(parsed);
        }
      } catch (err) {
        logger.warn("Could not read cached grocery lists", err);
      }
    })();

    void fetchLists();

    return () => {
      cancelled = true;
    };
  }, [userId, householdId, fetchLists]);

  // Another device may have added or renamed a list while this tab was away.
  useEffect(() => {
    if (!userId) return;
    const onFocus = () => {
      if (!inFlight.current) void fetchLists();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [userId, fetchLists]);

  const refresh = useCallback(() => fetchLists(), [fetchLists]);

  const setSelectedListId = useCallback((id: string) => {
    setStoredSelection(id);
    const uid = identity.current.userId;
    if (!uid) return;
    void (async () => {
      try {
        const storage = await getStorage();
        await storage.setItem(selectedListCacheKey(uid), id);
      } catch (err) {
        logger.warn("Could not remember the selected grocery list", err);
      }
    })();
  }, []);

  const upsertLocal = useCallback(
    (row: GroceryListRow) => {
      setLists((prev) => {
        // The server cleared the other defaults before writing this one.
        const base = row.is_default ? prev.map((l) => (l.is_default ? { ...l, is_default: false } : l)) : prev;
        const exists = base.some((l) => l.id === row.id);
        return exists ? base.map((l) => (l.id === row.id ? row : l)) : [...base, row];
      });
      void fetchLists();
    },
    [fetchLists],
  );

  const removeLocal = useCallback(
    (id: string) => {
      setLists((prev) => prev.filter((l) => l.id !== id));
      void fetchLists();
    },
    [fetchLists],
  );

  const defaultListId = useMemo(() => pickDefaultListId(lists), [lists]);
  const selectedListId = useMemo(() => {
    if (storedSelection && lists.some((l) => l.id === storedSelection)) return storedSelection;
    return defaultListId;
  }, [storedSelection, lists, defaultListId]);

  return {
    lists,
    defaultListId,
    selectedListId,
    setSelectedListId,
    loading,
    error,
    refresh,
    upsertLocal,
    removeLocal,
  };
}
