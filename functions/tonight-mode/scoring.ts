/**
 * Tonight Mode ranking algorithm — Deno-side mirror.
 *
 * Identical scoring to `src/lib/tonightModeRanking.ts`. The two files exist
 * separately because Supabase edge functions are deployed in isolation
 * (they only see `/app/functions/`); we can't reach into the React app's
 * `src/` from here. Any change here MUST be mirrored in the web copy and
 * vice-versa, and the web copy has the Vitest coverage that gates the
 * algorithm.
 *
 * Composite score (higher is better):
 *   rankScore = pantryCoveragePct * 40
 *             - blockingAversionsPerKid.sum() * 15
 *             - varietyScore * 25
 *             - prepTimeOverBudget * 0.5
 *
 * Recipes that hit any selected kid's allergen are excluded.
 */

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
  const kidAllergens = lowerSet(kid.allergens);
  const dislikedIds = new Set(kid.dislikedFoods ?? []);
  const dislikedNames = lowerSet(kid.dislikedFoods);

  const allergenHits: string[] = [];
  const blockingAversions: string[] = [];

  for (const food of recipe.foods) {
    let allergic = false;
    for (const a of food.allergens ?? []) {
      if (kidAllergens.has(String(a).trim().toLowerCase())) {
        allergic = true;
        break;
      }
    }
    if (allergic) {
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
