/**
 * Every live public recipe link in the signed-in user's household, for
 * Settings > Privacy. Reads recipe_shares (household-scoped by RLS, and
 * filtered here too so the query says what it means) and turns links off
 * through the same helper the recipe's share dialog uses.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logger } from "@/lib/logger";
import { buildRecipeShareUrl, revokeRecipeShare } from "@/lib/recipeShareLinks";

export const HOUSEHOLD_SHARE_LINKS_SELECT = "id, token, created_at, created_by, recipe_id, recipes(name)";

export interface HouseholdShareLink {
  id: string;
  token: string;
  url: string;
  createdAt: string;
  /** auth user id of the parent who made it; null for links made before authorship was kept. */
  createdBy: string | null;
  recipeId: string;
  /** Null when the recipe row is not readable (deleted, or outside RLS). */
  recipeName: string | null;
}

export type HouseholdShareLinksStatus = "idle" | "loading" | "ready" | "error";

export interface RevokeAllResult {
  revoked: number;
  failed: number;
}

interface ShareRow {
  id: string;
  token: string;
  created_at: string;
  created_by: string | null;
  recipe_id: string;
  recipes: { name: string | null } | Array<{ name: string | null }> | null;
}

function recipeNameOf(embed: ShareRow["recipes"]): string | null {
  const one = Array.isArray(embed) ? embed[0] : embed;
  const name = one?.name?.trim();
  return name ? name : null;
}

export function toHouseholdShareLink(row: ShareRow, origin?: string): HouseholdShareLink {
  return {
    id: row.id,
    token: row.token,
    url: buildRecipeShareUrl(row.token, origin),
    createdAt: row.created_at,
    createdBy: row.created_by,
    recipeId: row.recipe_id,
    recipeName: recipeNameOf(row.recipes),
  };
}

export function useHouseholdShareLinks(enabled = true) {
  const { householdId } = useAuth();
  const [links, setLinks] = useState<HouseholdShareLink[]>([]);
  const [status, setStatus] = useState<HouseholdShareLinksStatus>("idle");
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const linksRef = useRef<HouseholdShareLink[]>([]);
  linksRef.current = links;

  const reload = useCallback(async () => {
    if (!householdId) {
      setLinks([]);
      setStatus("ready");
      return;
    }
    setStatus("loading");
    const { data, error } = await supabase
      .from("recipe_shares")
      .select(HOUSEHOLD_SHARE_LINKS_SELECT)
      .eq("household_id", householdId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) {
      logger.error("Could not load the household's share links:", error);
      setStatus("error");
      return;
    }
    const rows = (data ?? []) as unknown as ShareRow[];
    setLinks(rows.map((row) => toHouseholdShareLink(row)));
    setStatus("ready");
  }, [householdId]);

  useEffect(() => {
    if (!enabled) return;
    void reload().catch((error: unknown) => {
      logger.error("Could not load the household's share links:", error);
      setStatus("error");
    });
  }, [enabled, reload]);

  const markBusy = (ids: readonly string[], on: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  /** Turn one link off. False when the write failed; the row stays listed. */
  const revoke = useCallback(async (id: string): Promise<boolean> => {
    markBusy([id], true);
    try {
      await revokeRecipeShare(id);
      setLinks((prev) => prev.filter((l) => l.id !== id));
      return true;
    } catch (error) {
      logger.error("Could not revoke a recipe share link:", error);
      return false;
    } finally {
      markBusy([id], false);
    }
  }, []);

  /**
   * Turn every listed link off, one write per link through the same helper.
   * The ones that failed stay listed so the parent can see what is still public.
   */
  const revokeAll = useCallback(async (): Promise<RevokeAllResult> => {
    const ids = linksRef.current.map((l) => l.id);
    if (ids.length === 0) return { revoked: 0, failed: 0 };
    markBusy(ids, true);
    const results = await Promise.allSettled(ids.map((id) => revokeRecipeShare(id)));
    const done = new Set(ids.filter((_, i) => results[i].status === "fulfilled"));
    for (const r of results) {
      if (r.status === "rejected") logger.error("Could not revoke a recipe share link:", r.reason);
    }
    setLinks((prev) => prev.filter((l) => !done.has(l.id)));
    markBusy(ids, false);
    return { revoked: done.size, failed: ids.length - done.size };
  }, []);

  return { links, status, busyIds, revoke, revokeAll, reload, householdId };
}
