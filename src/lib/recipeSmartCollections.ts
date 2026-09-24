/**
 * Smart collections for the recipe library (item 11): computed from kidFit,
 * times and collection membership on every render, never stored.
 *
 *   safe:<kidId>  every ingredient is a safe or go-to food for that kid, no
 *                 dislike, and the allergen check came back "safe" (an
 *                 unknown never counts as safe).
 *   everyone      every kid either eats or is trying every checked food, no
 *                 kid has an allergen hit or a dislike, and nothing is unknown.
 *   quick         30 minutes or less in total.
 *   unfiled       in no user collection.
 *
 * Pure: no React, no Supabase.
 */
import type { Food, Kid, PlanEntry, Recipe } from "@/types";
import { buildRecipeFits, countUncheckedIngredients, getKidRecipeFit, summarizeKidFits, buildResultIndex } from "@/lib/kidFit";
import { totalMinutes } from "@/hooks/useRecipeFilters";

export const QUICK_SMART_MAX_MINUTES = 30;

export type SmartCollectionKind = "safe" | "everyone" | "quick" | "unfiled";

export interface SmartCollection {
  /** "smart:safe:<kidId>", "smart:everyone", "smart:quick" or "smart:unfiled". */
  id: string;
  kind: SmartCollectionKind;
  /** Set for kind "safe". */
  kid?: Pick<Kid, "id" | "name">;
  recipeIds: ReadonlySet<string>;
  count: number;
}

const PREFIX = "smart:";

/** Is this selection a smart collection rather than a user collection id? */
export function isSmartCollectionId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(PREFIX);
}

export const smartSafeId = (kidId: string) => `${PREFIX}safe:${kidId}`;
export const SMART_EVERYONE_ID = `${PREFIX}everyone`;
export const SMART_QUICK_ID = `${PREFIX}quick`;
export const SMART_UNFILED_ID = `${PREFIX}unfiled`;

export interface BuildSmartCollectionsInput {
  recipes: readonly Recipe[];
  kids: readonly Kid[];
  foodById: ReadonlyMap<string, Food>;
  planEntries: readonly PlanEntry[];
  /** recipe id -> the user collections it is in. */
  collectionIdsByRecipe: Readonly<Record<string, readonly string[]>>;
  /** False while collections are loading or failed: "unfiled" would be a guess. */
  includeUnfiled: boolean;
  /** YYYY-MM-DD; history counts up to (not including) this day. */
  todayKey?: string;
}

function make(id: string, kind: SmartCollectionKind, ids: Set<string>, kid?: Pick<Kid, "id" | "name">): SmartCollection {
  return { id, kind, kid, recipeIds: ids, count: ids.size };
}

/** Is this recipe something every kid eats or is working on, with no allergen risk? */
export function isEveryoneCanEat(
  recipe: Recipe,
  kids: readonly Kid[],
  foodById: ReadonlyMap<string, Food>,
  indexes: ReadonlyMap<string, ReturnType<typeof buildResultIndex>>,
): boolean {
  if (kids.length === 0) return false;
  const perKid = kids.map((kid) => ({
    kid,
    fit: getKidRecipeFit(kid, recipe, foodById, indexes.get(kid.id) ?? new Map()),
  }));
  const summary = summarizeKidFits(perKid, { unchecked: countUncheckedIngredients(recipe, foodById) });
  if (summary.allergenStatus !== "safe") return false;
  return perKid.every(
    ({ fit }) => !fit.allergen && !fit.disliked && (fit.safe || fit.alwaysEats || fit.tryBite),
  );
}

/**
 * Every smart collection, in display order: one "Safe for" per kid, then
 * "Everyone can eat" (with kids), "Quick", and "Unfiled".
 */
export function buildSmartCollections(input: BuildSmartCollectionsInput): SmartCollection[] {
  const { recipes, kids, foodById, planEntries, collectionIdsByRecipe, includeUnfiled, todayKey } = input;
  const out: SmartCollection[] = [];

  for (const kid of kids) {
    const fits = buildRecipeFits(recipes, [kid], foodById, planEntries, todayKey);
    const ids = new Set<string>();
    for (const recipe of recipes) if (fits.get(recipe.id)?.safeForAll) ids.add(recipe.id);
    out.push(make(smartSafeId(kid.id), "safe", ids, { id: kid.id, name: kid.name }));
  }

  if (kids.length > 0) {
    const indexes = new Map(kids.map((k) => [k.id, buildResultIndex(planEntries, k.id, todayKey)] as const));
    const ids = new Set<string>();
    for (const recipe of recipes) if (isEveryoneCanEat(recipe, kids, foodById, indexes)) ids.add(recipe.id);
    out.push(make(SMART_EVERYONE_ID, "everyone", ids));
  }

  const quick = new Set<string>();
  for (const recipe of recipes) {
    const minutes = totalMinutes(recipe);
    if (minutes != null && minutes <= QUICK_SMART_MAX_MINUTES) quick.add(recipe.id);
  }
  out.push(make(SMART_QUICK_ID, "quick", quick));

  if (includeUnfiled) {
    const unfiled = new Set<string>();
    for (const recipe of recipes) {
      if ((collectionIdsByRecipe[recipe.id]?.length ?? 0) === 0) unfiled.add(recipe.id);
    }
    out.push(make(SMART_UNFILED_ID, "unfiled", unfiled));
  }

  return out;
}
