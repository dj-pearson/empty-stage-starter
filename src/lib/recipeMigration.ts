import type { Recipe } from "@/types";

/** Canonical UUID (v1–v5) shape — the form of a server-assigned recipe id. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True if `id` is a canonical UUID (i.e. a server-generated recipe id). */
export function isUuid(id: string): boolean {
  return typeof id === "string" && UUID_RE.test(id);
}

/**
 * Recipes that exist only in the local cache and must be migrated to the server
 * on first authenticated load (US-527 / US-549).
 *
 * History: the original `!id.includes('-')` heuristic never matched, and a
 * later `!isUuid(id)` heuristic worked only while local ids were non-UUIDs.
 * Now that `generateId()` returns a real UUID (US-549), id SHAPE can no longer
 * distinguish local from server ids, so detection is purely by server presence:
 * a recipe is local-only when its id is absent from the COMPLETE set of server
 * recipe ids. The caller MUST pass the full server-id set (not a paginated
 * page) so a server recipe beyond the fetch limit isn't mistaken for local.
 */
export function selectLocalOnlyRecipes(
  localRecipes: Recipe[],
  serverRecipeIds: Set<string>,
): Recipe[] {
  return localRecipes.filter((lr) => !serverRecipeIds.has(lr.id));
}
