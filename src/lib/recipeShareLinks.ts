/**
 * The pieces of a recipe's public link that more than one screen needs: the
 * URL a token opens, turning a link off, and copying it. The recipe's own
 * share dialog (useRecipeShareLink) and the Settings list of every live link
 * (useHouseholdShareLinks) both go through here, so "turn off" means the same
 * write wherever a parent does it.
 */
import { supabase } from "@/integrations/supabase/client";

/** The page a share token opens. */
export function buildRecipeShareUrl(token: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/r/${encodeURIComponent(token)}`;
}

/**
 * Turn one link off by stamping revoked_at. That column is the only one the
 * UPDATE grant covers (20260927000001_recipe_shares.sql), and RLS limits it
 * to the caller's household. Throws the PostgREST error on failure.
 */
export async function revokeRecipeShare(id: string): Promise<void> {
  const { error } = await supabase
    .from("recipe_shares")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Copy `text` to the clipboard. False when the browser would not. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}
