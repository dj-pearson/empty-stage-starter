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
 * on first authenticated load (US-527).
 *
 * The previous heuristic `!id.includes('-')` never matched: `generateId()`
 * returns `${Date.now()}-${rand}`, which always contains a '-', so no recipe
 * was ever detected as local-only and offline-created recipes were silently
 * discarded by the wholesale `setRecipes(dbRecipes)`. A recipe is local-only
 * when its id is NOT a UUID (locally-generated ids are not UUIDs) and it isn't
 * already present on the server by id.
 */
export function selectLocalOnlyRecipes(
  localRecipes: Recipe[],
  dbRecipes: Recipe[],
): Recipe[] {
  const dbIds = new Set(dbRecipes.map((r) => r.id));
  return localRecipes.filter((lr) => !isUuid(lr.id) && !dbIds.has(lr.id));
}
