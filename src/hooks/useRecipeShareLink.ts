/**
 * A recipe's public share link (item 10): read the live one, make one, revoke
 * it. One live link per recipe (the database enforces it), so a second
 * "create" from either parent lands on the same URL.
 *
 * The token is minted by the database; this never sends one.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

/** The page a share token opens. */
export function buildRecipeShareUrl(token: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/r/${encodeURIComponent(token)}`;
}

export interface RecipeShareLink {
  id: string;
  token: string;
  url: string;
  created_at: string;
}

type Status = "idle" | "loading" | "ready" | "error";

const UNIQUE_VIOLATION = "23505";

async function readLive(recipeId: string): Promise<RecipeShareLink | null> {
  const { data, error } = await supabase
    .from("recipe_shares")
    .select("id, token, created_at")
    .eq("recipe_id", recipeId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, token: data.token, created_at: data.created_at, url: buildRecipeShareUrl(data.token) } : null;
}

export function useRecipeShareLink(recipeId: string | null, householdId: string | null | undefined, enabled = true) {
  const [link, setLink] = useState<RecipeShareLink | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled || !recipeId) return;
    let cancelled = false;
    setStatus("loading");
    readLive(recipeId)
      .then((live) => {
        if (cancelled) return;
        setLink(live);
        setStatus("ready");
      })
      .catch((error) => {
        if (cancelled) return;
        logger.error("Could not load the recipe share link:", error);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [recipeId, enabled]);

  /** The live link, creating it when there is none. Null when that failed. */
  const ensure = useCallback(async (): Promise<RecipeShareLink | null> => {
    if (!recipeId || !householdId) return null;
    if (link) return link;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("recipe_shares")
        .insert({ recipe_id: recipeId, household_id: householdId })
        .select("id, token, created_at")
        .single();
      let next: RecipeShareLink | null = null;
      if (error) {
        // The other parent made one a moment ago: use theirs.
        if ((error as { code?: string }).code !== UNIQUE_VIOLATION) throw error;
        next = await readLive(recipeId);
      } else if (data) {
        next = { id: data.id, token: data.token, created_at: data.created_at, url: buildRecipeShareUrl(data.token) };
      }
      setLink(next);
      setStatus("ready");
      return next;
    } catch (error) {
      logger.error("Could not create a recipe share link:", error);
      return null;
    } finally {
      setBusy(false);
    }
  }, [recipeId, householdId, link]);

  /** Turn the live link off. Returns false when the write failed. */
  const revoke = useCallback(async (): Promise<boolean> => {
    if (!link) return true;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("recipe_shares")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", link.id);
      if (error) throw error;
      setLink(null);
      return true;
    } catch (error) {
      logger.error("Could not revoke a recipe share link:", error);
      return false;
    } finally {
      setBusy(false);
    }
  }, [link]);

  return { link, status, busy, ensure, revoke };
}
