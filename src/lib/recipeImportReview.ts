/**
 * The review step between parsing an import and saving it (item 12).
 *
 * The import dialog no longer saves: the parsed draft opens in the builder so
 * the parent can fix a name, a quantity or an unmatched ingredient first. Two
 * helpers live here so they can be tested without React:
 *
 *   * findLikelyDuplicate: the same page imported twice (same source_url), or
 *     a recipe that already goes by the same name once case, punctuation and
 *     spacing are ignored.
 *   * draftsFromImportRows: the builder's ingredient rows from the draft's
 *     recipe_ingredient_rows, which carry no database id yet.
 *
 * Pure: no React, no Supabase.
 */
import type { IngredientRowPayload, Recipe } from "@/types";
import type { IngredientDraft } from "@/lib/recipeIngredients";

/** "Mac & Cheese!" and "mac  and cheese" compare equal. */
export function normalizeRecipeName(name: string | null | undefined): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|ref)$/i;

/**
 * A source URL reduced to what identifies the page: host without "www.",
 * path without a trailing slash, query without tracking parameters, no hash,
 * and http and https treated alike. Null for anything that is not a URL.
 */
export function normalizeSourceUrl(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname.replace(/\/+$/, "");
  const params = [...parsed.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAM.test(key))
    .sort(([a], [b]) => a.localeCompare(b));
  const query = params.length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  return `${host}${path}${query}`;
}

export interface LikelyDuplicate {
  recipe: Recipe;
  reason: "source" | "name";
}

/** The existing recipe this import most likely repeats, or null. A source match wins over a name match. */
export function findLikelyDuplicate(
  draft: Pick<Recipe, "name" | "source_url">,
  recipes: readonly Recipe[],
): LikelyDuplicate | null {
  const source = normalizeSourceUrl(draft.source_url);
  if (source) {
    const hit = recipes.find((r) => normalizeSourceUrl(r.source_url) === source);
    if (hit) return { recipe: hit, reason: "source" };
  }
  const name = normalizeRecipeName(draft.name);
  if (name) {
    const hit = recipes.find((r) => normalizeRecipeName(r.name) === name);
    if (hit) return { recipe: hit, reason: "name" };
  }
  return null;
}

/**
 * Builder rows for a draft's parsed ingredients. rowId stays unset: none of
 * them exists in recipe_ingredients yet, so the save inserts every one.
 */
export function draftsFromImportRows(rows: readonly IngredientRowPayload[] | undefined): IngredientDraft[] {
  return [...(rows ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row, i) => {
      const notes = row.optional_notes ?? "";
      const isOptional = /\boptional\b/i.test(notes);
      const prepNotes = notes
        .replace(/\s*\(optional\)\s*$/i, "")
        .replace(/^optional$/i, "")
        .trim();
      return {
        id: `import-review-${i}`,
        rowId: null,
        food_id: row.food_id ?? null,
        name: row.name,
        quantity: row.quantity != null ? String(row.quantity) : "",
        unit: row.unit ?? "",
        prepNotes,
        isOptional,
        section: row.group_label ?? undefined,
      };
    });
}

/**
 * What a reviewed import saves: the builder's fields over the parsed draft,
 * so values the builder has no input for (source_type, nutrition, an explicit
 * total time) survive the review. A total the builder computed from prep and
 * cook wins over the draft's.
 */
export function mergeReviewedImport(
  draft: Omit<Recipe, "id">,
  reviewed: Partial<Recipe>,
): Omit<Recipe, "id"> {
  const merged: Omit<Recipe, "id"> = { ...draft, ...reviewed, name: reviewed.name ?? draft.name };
  if (reviewed.total_time_minutes == null) {
    // The draft's total survives only when it was an explicit total with no
    // prep/cook behind it (the builder has no field for that). A total parsed
    // alongside prep and cook times the parent then cleared goes with them.
    const explicitTotal = draft.prepTime == null && draft.cookTime == null;
    merged.total_time_minutes = explicitTotal ? draft.total_time_minutes : undefined;
  }
  return merged;
}
