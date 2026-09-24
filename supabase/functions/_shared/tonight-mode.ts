/**
 * Pure pieces of the tonight-mode edge function (US-312), pulled out of the
 * handler so they can be tested without a database or a deployed function.
 *
 * Two things were wrong in the handler and are fixed here:
 *
 *  - Scope. Reads were `user_id = caller`, widened to `OR household_id = X`
 *    only when the request body named a household the caller belonged to. A
 *    co-parent's kids, foods and recipes were invisible unless the iOS client
 *    happened to send the id, and rows the caller had written while in some
 *    other household came along whether or not that household was still
 *    theirs. Scope is now the caller's household, resolved from the JWT user
 *    with get_user_household_id (the same function every RLS policy uses).
 *    The body's householdId is never trusted.
 *
 *  - Allergens. Kid and food allergens were compared as exact lowercase
 *    strings, so "Peanuts" vs "peanut", "en:tree-nuts" vs "tree nuts" or
 *    "dairy" vs "milk" all read as safe and the recipe could be the top pick.
 *    kidFitFor goes through matchingAllergen from ./allergens.ts, the matcher
 *    the web planner uses.
 *
 * No Deno or browser imports.
 */
import { matchingAllergen } from './allergens.ts';

export interface KidFit {
  kidId: string;
  kidName: string;
  score: number;
  blockingAversions: string[];
  allergenHits: string[];
}

export interface FoodRow {
  id: string;
  name: string;
  allergens: string[] | null;
}

export interface KidRow {
  id: string;
  name: string;
  allergens: string[] | null;
  disliked_foods: string[] | null;
}

export interface PlanEntryRow {
  recipe_id: string | null;
  date: string;
}

/**
 * Which rows a tonight-mode read may see.
 *
 * With a household: every row in it, whoever wrote it, and nothing outside
 * it. Without one (a legacy account that never got a membership): only the
 * caller's own rows that are not filed under any household, since a row
 * carrying a household_id belongs to that household's members and the caller
 * is not one of them.
 */
export type TonightScope =
  | { kind: 'household'; householdId: string }
  | { kind: 'user'; userId: string };

export function tonightScope(userId: string, householdId: string | null | undefined): TonightScope {
  return householdId ? { kind: 'household', householdId } : { kind: 'user', userId };
}

/**
 * The scope as a PostgREST `or=` filter body, for `query.or(...)`.
 *
 * A string rather than a helper that takes the query builder: any generic
 * over the untyped supabase-js builder is TS2589 "excessively deep" under
 * deno check. Both ids come from the server (the JWT user and
 * get_user_household_id), never from the request body.
 */
export function tonightScopeFilter(scope: TonightScope): string {
  return scope.kind === 'household'
    ? `household_id.eq.${scope.householdId}`
    : `and(user_id.eq.${scope.userId},household_id.is.null)`;
}

function lowerSet(arr: readonly string[] | null | undefined): Set<string> {
  return new Set((arr ?? []).map((s) => String(s).toLowerCase()));
}

/**
 * How one kid fares against one recipe's foods. A food carrying any of the
 * kid's allergens (canonical match) is an allergen hit and scores the kid 0;
 * otherwise a disliked food (by id or by name) costs 0.25.
 */
export function kidFitFor(
  kid: KidRow,
  foodIds: readonly string[],
  foodById: ReadonlyMap<string, FoodRow>,
): KidFit {
  const dislikedIds = new Set(kid.disliked_foods ?? []);
  const dislikedNames = lowerSet(kid.disliked_foods);

  const allergenHits: string[] = [];
  const blockingAversions: string[] = [];
  for (const fid of foodIds) {
    const food = foodById.get(fid);
    if (!food) continue;
    if (matchingAllergen(kid.allergens, food.allergens) !== null) {
      allergenHits.push(food.name);
      continue;
    }
    if (dislikedIds.has(fid) || dislikedNames.has(food.name.toLowerCase())) {
      blockingAversions.push(food.name);
    }
  }

  let score = 1 - 0.25 * blockingAversions.length;
  if (allergenHits.length > 0) score = 0;
  score = Math.min(1, Math.max(0, score));
  return { kidId: kid.id, kidName: kid.name, score, blockingAversions, allergenHits };
}

/** Leading numeric run out of "20 min" / "PT15M" -> 20 / 15. */
export function parseLeadingNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = raw.match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * Recency weight for variety scoring: a recipe planned in the last week
 * counts double; 8-14 days ago counts once; 15-21 days ago counts half.
 * Mirrors TonightModeService.clientFallback so server + client agree.
 */
export function recencyWeight(daysAgo: number): number {
  if (daysAgo < 0) return 0;
  if (daysAgo <= 7) return 2;
  if (daysAgo <= 14) return 1;
  return 0.5;
}

/** Recency-weighted "how recently/often planned" score, normalized 0-1. */
export function varietyScore(
  recipeId: string,
  planEntries: readonly PlanEntryRow[],
  lookbackDays: number,
  now: number,
): number {
  let weighted = 0;
  for (const entry of planEntries) {
    if (entry.recipe_id !== recipeId) continue;
    const t = Date.parse(entry.date);
    if (Number.isNaN(t)) continue;
    const days = Math.floor((now - t) / 86400000);
    if (days < 0 || days > lookbackDays) continue;
    weighted += recencyWeight(days);
  }
  return Math.min(1, Math.max(0, (weighted / Math.max(1, lookbackDays)) * 3));
}
