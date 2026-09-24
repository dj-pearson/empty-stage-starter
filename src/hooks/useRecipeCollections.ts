import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { RecipeCollection } from "@/types";
import { assertUUID } from "@/lib/query-sanitize";
import { logger } from "@/lib/logger";
import { generateId } from "@/lib/utils";
import { DEFAULT_COLLECTION_COLOR, DEFAULT_COLLECTION_ICON } from "@/lib/collectionAppearance";
import "@/i18n/appLocale";

/**
 * Recipe collections and their membership, from one place.
 *
 * Before this, the page, the selector and the manage dialog each fetched
 * recipe_collections on their own, and the page read every row of
 * recipe_collection_items it could see. Now there is one fetch of the
 * collections, then one fetch of items scoped to those collection ids, and
 * every mutation is applied to local state first and rolled back if the write
 * fails, so the UI never waits on a refetch.
 *
 * Load errors land in `error` and are not toasted (the selector shows a
 * disabled state instead); the hook retries when the browser comes back
 * online. Mutation failures do toast, since the user just asked for something.
 */

type CollectionRow = Database["public"]["Tables"]["recipe_collections"]["Row"];

export interface CollectionInput {
  name: string;
  description?: string | null;
  icon?: string;
  color?: string;
  is_default?: boolean;
}

export type CollectionPatch = Partial<CollectionInput>;

export interface RemovedCollection {
  collection: RecipeCollection;
  recipeIds: string[];
  /** Puts the collection and its members back. Same as restore(snapshot). */
  undo: () => Promise<boolean>;
}

export interface UseRecipeCollections {
  collections: RecipeCollection[];
  itemsByCollection: Record<string, Set<string>>;
  collectionIdsByRecipe: Record<string, string[]>;
  countsByCollection: Record<string, number>;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  create: (input: CollectionInput) => Promise<RecipeCollection | null>;
  update: (id: string, patch: CollectionPatch) => Promise<boolean>;
  remove: (id: string) => Promise<RemovedCollection | null>;
  restore: (snapshot: Pick<RemovedCollection, "collection" | "recipeIds">) => Promise<boolean>;
  setMembership: (recipeId: string, collectionIds: readonly string[]) => Promise<boolean>;
  dropRecipe: (recipeId: string) => void;
}

function toCollection(row: CollectionRow): RecipeCollection {
  const now = new Date().toISOString();
  return {
    id: row.id,
    user_id: row.user_id ?? "",
    household_id: row.household_id ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    icon: row.icon ?? undefined,
    color: row.color ?? undefined,
    is_default: Boolean(row.is_default),
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at ?? now,
    updated_at: row.updated_at ?? now,
  };
}

function sortCollections(list: RecipeCollection[]): RecipeCollection[] {
  return [...list].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (e && typeof e === "object" && "message" in e) return new Error(String((e as { message: unknown }).message));
  return new Error(String(e));
}

export function useRecipeCollections(
  userId: string | null | undefined,
  householdId: string | null | undefined,
): UseRecipeCollections {
  const { t } = useTranslation();
  const [collections, setCollections] = useState<RecipeCollection[]>([]);
  const [itemsByCollection, setItemsByCollection] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState<boolean>(Boolean(userId));
  const [error, setError] = useState<Error | null>(null);

  const requestRef = useRef(0);
  const collectionsRef = useRef(collections);
  collectionsRef.current = collections;
  const itemsRef = useRef(itemsByCollection);
  itemsRef.current = itemsByCollection;
  const errorRef = useRef(error);
  errorRef.current = error;

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    if (!userId) {
      setCollections([]);
      setItemsByCollection({});
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let filter = `user_id.eq.${assertUUID(userId, "userId")}`;
      if (householdId) filter += `,household_id.eq.${assertUUID(householdId, "householdId")}`;
      const { data, error: loadError } = await supabase
        .from("recipe_collections")
        .select("*")
        .or(filter)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (loadError) throw loadError;
      if (request !== requestRef.current) return;

      const loaded = (data ?? []).map(toCollection);
      const ids = loaded.map((c) => c.id);
      const items: Record<string, Set<string>> = {};
      for (const id of ids) items[id] = new Set();

      if (ids.length > 0) {
        const { data: rows, error: itemsError } = await supabase
          .from("recipe_collection_items")
          .select("collection_id, recipe_id")
          .in("collection_id", ids);
        if (itemsError) throw itemsError;
        if (request !== requestRef.current) return;
        for (const row of rows ?? []) {
          if (!row.collection_id || !row.recipe_id) continue;
          (items[row.collection_id] ??= new Set()).add(row.recipe_id);
        }
      }

      setCollections(loaded);
      setItemsByCollection(items);
      setError(null);
    } catch (e) {
      if (request !== requestRef.current) return;
      logger.error("Error loading recipe collections:", e);
      setError(toError(e));
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [userId, householdId]);

  useEffect(() => {
    void load();
  }, [load]);

  // A failed load retries itself when the connection comes back.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      if (errorRef.current) void load();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [load]);

  // ---- local state helpers (used by both the optimistic step and rollback)

  const putCollectionLocal = useCallback((collection: RecipeCollection, members?: Iterable<string>) => {
    setCollections((prev) => sortCollections([...prev.filter((c) => c.id !== collection.id), collection]));
    setItemsByCollection((prev) => ({
      ...prev,
      [collection.id]: new Set(members ?? prev[collection.id] ?? []),
    }));
  }, []);

  const dropCollectionLocal = useCallback((id: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
    setItemsByCollection((prev) => withoutKey(prev, id));
  }, []);

  const applyMembershipLocal = useCallback((recipeId: string, add: readonly string[], del: readonly string[]) => {
    if (add.length === 0 && del.length === 0) return;
    setItemsByCollection((prev) => {
      const next = { ...prev };
      for (const id of add) {
        const set = new Set(next[id] ?? []);
        set.add(recipeId);
        next[id] = set;
      }
      for (const id of del) {
        if (!next[id]) continue;
        const set = new Set(next[id]);
        set.delete(recipeId);
        next[id] = set;
      }
      return next;
    });
  }, []);

  // ---- mutations

  const create = useCallback(
    async (input: CollectionInput): Promise<RecipeCollection | null> => {
      const name = input.name.trim();
      if (!userId || !name) return null;
      const now = new Date().toISOString();
      const optimistic: RecipeCollection = {
        id: generateId(),
        user_id: userId,
        household_id: householdId ?? undefined,
        name,
        description: input.description?.trim() || undefined,
        icon: input.icon ?? DEFAULT_COLLECTION_ICON,
        color: input.color ?? DEFAULT_COLLECTION_COLOR,
        is_default: Boolean(input.is_default),
        sort_order: 0,
        created_at: now,
        updated_at: now,
      };
      putCollectionLocal(optimistic, []);

      const { data, error: insertError } = await supabase
        .from("recipe_collections")
        .insert({
          id: optimistic.id,
          user_id: userId,
          household_id: householdId ?? null,
          name,
          description: optimistic.description ?? null,
          icon: optimistic.icon,
          color: optimistic.color,
          is_default: optimistic.is_default,
          sort_order: 0,
        })
        .select()
        .single();

      if (insertError || !data) {
        logger.error("Error creating collection:", insertError);
        dropCollectionLocal(optimistic.id);
        toast.error(t("recipes.collections.createFailed", { defaultValue: "Couldn't create that collection" }));
        return null;
      }
      const saved = toCollection(data);
      setCollections((prev) => sortCollections(prev.map((c) => (c.id === saved.id ? saved : c))));
      return saved;
    },
    [userId, householdId, putCollectionLocal, dropCollectionLocal, t],
  );

  const update = useCallback(
    async (id: string, patch: CollectionPatch): Promise<boolean> => {
      const previous = collectionsRef.current.find((c) => c.id === id);
      if (!previous) return false;
      const next: RecipeCollection = {
        ...previous,
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.description !== undefined ? { description: patch.description?.trim() || undefined } : {}),
        ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.is_default !== undefined ? { is_default: patch.is_default } : {}),
        updated_at: new Date().toISOString(),
      };
      setCollections((prev) => sortCollections(prev.map((c) => (c.id === id ? next : c))));

      const { error: updateError } = await supabase
        .from("recipe_collections")
        .update({
          name: next.name,
          description: next.description ?? null,
          icon: next.icon ?? null,
          color: next.color ?? null,
          is_default: next.is_default,
          updated_at: next.updated_at,
        })
        .eq("id", id);

      if (updateError) {
        logger.error("Error updating collection:", updateError);
        setCollections((prev) => sortCollections(prev.map((c) => (c.id === id ? previous : c))));
        toast.error(t("recipes.collections.updateFailed", { defaultValue: "Couldn't save that collection" }));
        return false;
      }
      return true;
    },
    [t],
  );

  const restore = useCallback(
    async (snapshot: Pick<RemovedCollection, "collection" | "recipeIds">): Promise<boolean> => {
      const { collection, recipeIds } = snapshot;
      putCollectionLocal(collection, recipeIds);

      const { error: collectionError } = await supabase.from("recipe_collections").upsert(
        {
          id: collection.id,
          user_id: collection.user_id || userId || null,
          household_id: collection.household_id ?? null,
          name: collection.name,
          description: collection.description ?? null,
          icon: collection.icon ?? null,
          color: collection.color ?? null,
          is_default: collection.is_default,
          sort_order: collection.sort_order,
        },
        { onConflict: "id" },
      );
      let failure: unknown = collectionError;
      if (!failure && recipeIds.length > 0) {
        const { error: itemsError } = await supabase
          .from("recipe_collection_items")
          .upsert(
            recipeIds.map((recipeId) => ({ collection_id: collection.id, recipe_id: recipeId })),
            { onConflict: "collection_id,recipe_id", ignoreDuplicates: true },
          );
        failure = itemsError;
      }
      if (failure) {
        logger.error("Error restoring collection:", failure);
        if (collectionError) dropCollectionLocal(collection.id);
        toast.error(t("recipes.collections.restoreFailed", { defaultValue: "Couldn't bring that collection back" }));
        return false;
      }
      return true;
    },
    [userId, putCollectionLocal, dropCollectionLocal, t],
  );

  const remove = useCallback(
    async (id: string): Promise<RemovedCollection | null> => {
      const collection = collectionsRef.current.find((c) => c.id === id);
      if (!collection) return null;
      const recipeIds = [...(itemsRef.current[id] ?? [])];
      dropCollectionLocal(id);

      // recipe_collection_items.collection_id is ON DELETE CASCADE, so the
      // members go with the collection in one statement.
      const { error: deleteError } = await supabase.from("recipe_collections").delete().eq("id", id);
      if (deleteError) {
        logger.error("Error deleting collection:", deleteError);
        putCollectionLocal(collection, recipeIds);
        toast.error(t("recipes.collections.deleteFailed", { defaultValue: "Couldn't delete that collection" }));
        return null;
      }
      const snapshot: RemovedCollection = {
        collection,
        recipeIds,
        undo: () => restore({ collection, recipeIds }),
      };
      return snapshot;
    },
    [dropCollectionLocal, putCollectionLocal, restore, t],
  );

  const setMembership = useCallback(
    async (recipeId: string, collectionIds: readonly string[]): Promise<boolean> => {
      const wanted = new Set(collectionIds);
      const known = new Set(collectionsRef.current.map((c) => c.id));
      const current = Object.entries(itemsRef.current)
        .filter(([, set]) => set.has(recipeId))
        .map(([id]) => id);
      const add = [...wanted].filter((id) => known.has(id) && !current.includes(id));
      const del = current.filter((id) => !wanted.has(id));
      if (add.length === 0 && del.length === 0) return true;

      applyMembershipLocal(recipeId, add, del);

      let failure: unknown = null;
      if (add.length > 0) {
        const { error: upsertError } = await supabase
          .from("recipe_collection_items")
          .upsert(
            add.map((collectionId) => ({ collection_id: collectionId, recipe_id: recipeId })),
            { onConflict: "collection_id,recipe_id", ignoreDuplicates: true },
          );
        failure = upsertError;
      }
      if (!failure && del.length > 0) {
        const { error: deleteError } = await supabase
          .from("recipe_collection_items")
          .delete()
          .eq("recipe_id", recipeId)
          .in("collection_id", del);
        failure = deleteError;
      }
      if (failure) {
        logger.error("Error updating collection membership:", failure);
        applyMembershipLocal(recipeId, del, add);
        toast.error(t("recipes.collections.membershipFailed", { defaultValue: "Couldn't update collections" }));
        return false;
      }
      return true;
    },
    [applyMembershipLocal, t],
  );

  const dropRecipe = useCallback((recipeId: string) => {
    setItemsByCollection((prev) => {
      let changed = false;
      const next: Record<string, Set<string>> = {};
      for (const [id, set] of Object.entries(prev)) {
        if (set.has(recipeId)) {
          const copy = new Set(set);
          copy.delete(recipeId);
          next[id] = copy;
          changed = true;
        } else {
          next[id] = set;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const collectionIdsByRecipe = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const [collectionId, set] of Object.entries(itemsByCollection)) {
      for (const recipeId of set) (out[recipeId] ??= []).push(collectionId);
    }
    return out;
  }, [itemsByCollection]);

  const countsByCollection = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, set] of Object.entries(itemsByCollection)) out[id] = set.size;
    return out;
  }, [itemsByCollection]);

  return {
    collections,
    itemsByCollection,
    collectionIdsByRecipe,
    countsByCollection,
    loading,
    error,
    refresh: load,
    create,
    update,
    remove,
    restore,
    setMembership,
    dropRecipe,
  };
}
