/**
 * Tonight Mode ranking algorithm (US-293).
 *
 * Pure, dependency-free scoring used by both the Supabase edge function
 * (`supabase/functions/tonight-mode/index.ts`) and the web client fallback path
 * (when the edge function is slow or unreachable). Vitest covers this file
 * directly so the algorithm has a single source of truth.
 *
 * Composite score (higher is better):
 *   rankScore = pantryCoveragePct * 40
 *             - blockingAversionsPerKid.sum() * 15
 *             - varietyScore * 25
 *             - prepTimeOverBudget * 0.5
 *
 * Recipes that hit any selected kid's allergen are excluded (rank score
 * collapses to -Infinity).
 */

import { matchingAllergen } from './allergens';

export interface PantryFood {
  id: string;
  name: string;
  allergens?: string[] | null;
}

export interface KidContext {
  id: string;
  name: string;
  allergens?: string[] | null;
  dislikedFoods?: string[] | null;
}

export interface RecipeFood {
  id: string;
  name: string;
  allergens?: string[] | null;
}

export interface RecipeContext {
  id: string;
  name: string;
  imageUrl?: string | null;
  prepMinutes: number;
  foodIds: string[];
  foods: RecipeFood[];
}

export interface RecentPlanEntry {
  recipeId: string | null;
  daysAgo: number;
}

export interface ScoreOptions {
  maxMinutes: number;
  lookbackDays?: number;
}

export interface KidFit {
  kidId: string;
  kidName: string;
  score: number;
  blockingAversions: string[];
  allergenHits: string[];
}

export interface ScoredRecipe {
  recipeId: string;
  prepMinutes: number;
  pantryCoveragePct: number;
  missingFoodIds: string[];
  kidFit: KidFit[];
  varietyScore: number;
  rankScore: number;
  excluded: boolean;
  excludeReason?: 'allergen' | null;
}

const VARIETY_LOOKBACK_DEFAULT = 21;

function lowerSet(values: readonly (string | null | undefined)[] | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!values) return out;
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) {
      out.add(v.trim().toLowerCase());
    }
  }
  return out;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function recencyWeight(daysAgo: number): number {
  if (daysAgo < 0) return 0;
  if (daysAgo <= 7) return 2;
  if (daysAgo <= 14) return 1;
  return 0.5;
}

export function computeVarietyScore(
  recipeId: string,
  recentEntries: RecentPlanEntry[],
  lookbackDays = VARIETY_LOOKBACK_DEFAULT,
): number {
  let weighted = 0;
  for (const entry of recentEntries) {
    if (entry.recipeId !== recipeId) continue;
    if (entry.daysAgo > lookbackDays) continue;
    weighted += recencyWeight(entry.daysAgo);
  }
  return clamp01((weighted / Math.max(1, lookbackDays)) * 3);
}

export function evaluateKidFit(recipe: RecipeContext, kid: KidContext): KidFit {
  const dislikedIds = new Set(kid.dislikedFoods ?? []);
  const dislikedNames = lowerSet(kid.dislikedFoods);

  const allergenHits: string[] = [];
  const blockingAversions: string[] = [];

  for (const food of recipe.foods) {
    // Canonical matching, as kidFit does: a kid's "Peanuts" has to catch a
    // food's "en:peanuts", which a lowercased exact compare let through.
    if (matchingAllergen(kid.allergens, food.allergens)) {
      allergenHits.push(food.name);
      continue;
    }
    if (
      dislikedIds.has(food.id) ||
      dislikedNames.has(food.name.trim().toLowerCase())
    ) {
      blockingAversions.push(food.name);
    }
  }

  let score = 1;
  score -= 0.25 * blockingAversions.length;
  if (allergenHits.length > 0) score = 0;
  return {
    kidId: kid.id,
    kidName: kid.name,
    score: clamp01(score),
    blockingAversions,
    allergenHits,
  };
}

export interface RankInputs {
  recipes: RecipeContext[];
  pantry: PantryFood[];
  kids: KidContext[];
  recentEntries: RecentPlanEntry[];
}

export function scoreRecipes(
  inputs: RankInputs,
  opts: ScoreOptions,
): ScoredRecipe[] {
  const pantryIds = new Set(inputs.pantry.map((p) => p.id));
  const lookback = opts.lookbackDays ?? VARIETY_LOOKBACK_DEFAULT;

  const out: ScoredRecipe[] = [];

  for (const recipe of inputs.recipes) {
    const totalIngredients = Math.max(1, recipe.foodIds.length);
    const missingFoodIds = recipe.foodIds.filter((id) => !pantryIds.has(id));
    const pantryCoveragePct =
      (recipe.foodIds.length - missingFoodIds.length) / totalIngredients;

    const kidFit = inputs.kids.map((kid) => evaluateKidFit(recipe, kid));
    const anyAllergen = kidFit.some((k) => k.allergenHits.length > 0);
    const totalBlockingAversions = kidFit.reduce(
      (acc, k) => acc + k.blockingAversions.length,
      0,
    );

    const varietyScore = computeVarietyScore(
      recipe.id,
      inputs.recentEntries,
      lookback,
    );

    const prepTimeOverBudget = Math.max(0, recipe.prepMinutes - opts.maxMinutes);

    let rankScore =
      pantryCoveragePct * 40 -
      totalBlockingAversions * 15 -
      varietyScore * 25 -
      prepTimeOverBudget * 0.5;

    if (anyAllergen) {
      rankScore = Number.NEGATIVE_INFINITY;
    }

    out.push({
      recipeId: recipe.id,
      prepMinutes: recipe.prepMinutes,
      pantryCoveragePct,
      missingFoodIds,
      kidFit,
      varietyScore,
      rankScore,
      excluded: anyAllergen,
      excludeReason: anyAllergen ? 'allergen' : null,
    });
  }

  out.sort((a, b) => {
    if (a.rankScore !== b.rankScore) return b.rankScore - a.rankScore;
    const aSum = a.kidFit.reduce((acc, k) => acc + k.score, 0);
    const bSum = b.kidFit.reduce((acc, k) => acc + k.score, 0);
    return bSum - aSum;
  });

  return out;
}

export function topSuggestions(
  inputs: RankInputs,
  opts: ScoreOptions,
  limit = 3,
): ScoredRecipe[] {
  return scoreRecipes(inputs, opts)
    .filter((r) => !r.excluded)
    .slice(0, limit);
}

/**
 * The shape the planner grid holds. Structural so this module stays free of
 * app imports: PlanEntry from '@/types' satisfies it.
 */
export interface ScheduledPlanRow {
  kid_id: string;
  date: string;
  meal_slot: string;
  recipe_id?: string | null;
}

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** Whole calendar days from `from` to `to`, both 'YYYY-MM-DD'. DST-proof. */
function isoDayDiff(from: string, to: string): number | null {
  const a = ISO_DAY.exec(from);
  const b = ISO_DAY.exec(to);
  if (!a || !b) return null;
  const ua = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const ub = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((ub - ua) / 86_400_000);
}

/**
 * Plan rows -> the RecentPlanEntry list computeVarietyScore expects, counting
 * each time a recipe was SERVED rather than each row it expanded into.
 *
 * Scheduling a recipe writes one plan_entries row per ingredient, so a single
 * 5-ingredient dinner used to count as "made 5x" and trip the fatigue chip on
 * first use. Rows are deduped on recipe|date|slot, scoped to one kid (a
 * sibling's plan is not this child's repetition), and dates after `today` are
 * dropped: a meal that has not happened yet is not something anyone is tired of.
 */
export function recentRecipeServings(
  rows: readonly ScheduledPlanRow[],
  kidId: string,
  today: string,
  lookbackDays = VARIETY_LOOKBACK_DEFAULT,
): RecentPlanEntry[] {
  const seen = new Set<string>();
  const out: RecentPlanEntry[] = [];
  for (const row of rows) {
    if (!row.recipe_id || row.kid_id !== kidId) continue;
    const daysAgo = isoDayDiff(row.date, today);
    if (daysAgo === null || daysAgo < 0 || daysAgo > lookbackDays) continue;
    const key = `${row.recipe_id}|${row.date}|${row.meal_slot}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ recipeId: row.recipe_id, daysAgo });
  }
  return out;
}

export interface RecipeFatigue {
  score: number;
  count: number;
}

/** Per-recipe fatigue for one kid, from recentRecipeServings. */
export function fatigueByRecipe(
  rows: readonly ScheduledPlanRow[],
  kidId: string,
  today: string,
  lookbackDays = VARIETY_LOOKBACK_DEFAULT,
): Map<string, RecipeFatigue> {
  const recent = recentRecipeServings(rows, kidId, today, lookbackDays);
  const counts = new Map<string, number>();
  for (const r of recent) {
    if (r.recipeId) counts.set(r.recipeId, (counts.get(r.recipeId) ?? 0) + 1);
  }
  const out = new Map<string, RecipeFatigue>();
  for (const [recipeId, count] of counts) {
    out.set(recipeId, { score: computeVarietyScore(recipeId, recent, lookbackDays), count });
  }
  return out;
}
