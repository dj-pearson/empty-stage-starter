/**
 * US-298: "Twist this meal" alternative picker.
 *
 * Pure module. Given a recipe the user is starting to over-rotate on
 * (fatigue score >= 0.4) and the household's full recipe library, return
 * up to N alternatives that are "similar but different" — same kind of
 * meal, but not the same recipe, and not also over-rotated.
 *
 * Why client-side first:
 * --------------------
 * The AC mentions `functions/calculate-food-similarity` as the preferred
 * similarity backend. That edge function exists for some flows but
 * makes a round-trip; the planner is a hot path where a synchronous
 * client-side fallback keeps the chip-tap → sheet-open transition
 * snappy. The signature is shaped so a future edge-fn-backed variant
 * can slot in without changing call sites.
 *
 * Scoring (composite, higher is better):
 *   +1.0 base point for being a different recipe
 *   +up to 0.8 for prep-time proximity (1.0 at ±0min, linear to 0 at ±5)
 *   +0.3 for matching category (breakfast / lunch / dinner / snack)
 *   +0.2 per shared tag (capped at +0.6)
 *   +0.2 for sharing a primary protein food
 *   +0.4 if the candidate is favorited OR has rating >= 4
 *   -∞ when candidate fatigue >= 0.2 (hard filter, never returned)
 */

import type { Food, Recipe } from '@/types';

export interface FatigueLookup {
  /** Returns 0..1 fatigue score for a recipeId, or 0 if not fatigued. */
  (recipeId: string): number;
}

export interface TwistCandidate {
  recipe: Recipe;
  /** 0..N composite score. Sort high-to-low when picking. */
  score: number;
  /** Human-readable rationale chips for the sheet ("Same prep time",
   *  "Family favorite"). Empty when nothing matched — caller can hide
   *  the row of badges. */
  reasons: string[];
  /** Estimated prep minutes derived from the recipe — surfaced so the
   *  sheet can show "20 min" without re-parsing. */
  prepMinutes: number;
}

export interface PickTwistOptions {
  /** Max candidates to return. Default 3 (matches AC). */
  limit?: number;
  /** Maximum fatigue score for a candidate. Default 0.2 per AC. */
  maxCandidateFatigue?: number;
  /** Override prep-time proximity sigma in minutes. Default 5 per AC. */
  prepTimeSigmaMinutes?: number;
}

const DEFAULTS = {
  limit: 3,
  maxCandidateFatigue: 0.2,
  prepTimeSigmaMinutes: 5,
} as const;

/** Best-effort prep-minutes extraction matching siblingMealFinder.ts. */
function parsePrepMinutes(recipe: Recipe): number {
  if (typeof recipe.total_time_minutes === 'number' && recipe.total_time_minutes > 0) {
    return recipe.total_time_minutes;
  }
  const text = recipe.prepTime ?? recipe.cookTime ?? '';
  const match = text.match(/(\d+)/);
  if (match) {
    const n = parseInt(match[1], 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 0;
}

/** Foods linked to the recipe whose category is 'protein'. Used to spot
 *  recipes built around the same protein (chicken-and-rice → chicken-stir-fry). */
function proteinIds(recipe: Recipe, foodById: Map<string, Food>): Set<string> {
  const out = new Set<string>();
  for (const fid of recipe.food_ids ?? []) {
    const f = foodById.get(fid);
    if (f?.category === 'protein') out.add(fid);
  }
  return out;
}

export interface PickTwistInputs {
  original: Recipe;
  allRecipes: Recipe[];
  foodById: Map<string, Food>;
  /** Returns the fatigue score for a given recipeId. Pass a closure
   *  over the parent's fatigueByRecipeId map. */
  fatigueScoreFor: FatigueLookup;
}

/**
 * Score + rank up to `limit` alternatives for the given recipe.
 *
 * Always returns at most `limit` items, sorted descending by score.
 * Items below score 0 (i.e. only matched the "different recipe" base
 * point with no real similarity) are dropped so the sheet doesn't
 * suggest e.g. dessert when the user is fatigued of breakfast.
 */
export function pickTwistCandidates(
  inputs: PickTwistInputs,
  opts: PickTwistOptions = {}
): TwistCandidate[] {
  const limit = opts.limit ?? DEFAULTS.limit;
  const maxFatigue = opts.maxCandidateFatigue ?? DEFAULTS.maxCandidateFatigue;
  const sigma = opts.prepTimeSigmaMinutes ?? DEFAULTS.prepTimeSigmaMinutes;

  const { original, allRecipes, foodById, fatigueScoreFor } = inputs;
  const originalPrep = parsePrepMinutes(original);
  const originalCategory = original.category;
  const originalTags = new Set((original.tags ?? []).map((t) => t.toLowerCase()));
  const originalProteinIds = proteinIds(original, foodById);

  const scored: TwistCandidate[] = [];

  for (const candidate of allRecipes) {
    if (candidate.id === original.id) continue;
    // Hard filter: never twist into another fatigued recipe.
    if (fatigueScoreFor(candidate.id) >= maxFatigue) continue;
    // Skip variants of the original (e.g. its own hidden-veggies
    // descendant) — they read as same-recipe to the user.
    if (candidate.parent_recipe_id === original.id) continue;

    let score = 1; // base point for "different recipe but exists"
    const reasons: string[] = [];

    // Prep-time proximity. 1.0 weight peak, linear to 0 at sigma.
    const candidatePrep = parsePrepMinutes(candidate);
    if (originalPrep > 0 && candidatePrep > 0) {
      const delta = Math.abs(candidatePrep - originalPrep);
      if (delta <= sigma) {
        const proximity = (sigma - delta) / sigma; // 1..0 over the window
        score += 0.8 * proximity;
        if (delta <= 2) reasons.push('Same prep time');
        else if (delta <= sigma) reasons.push('Similar prep time');
      }
    }

    // Same category (breakfast / lunch / dinner / snack)
    if (originalCategory && candidate.category === originalCategory) {
      score += 0.3;
      reasons.push(`Same ${originalCategory}`);
    }

    // Shared cuisine tags. Capped so a recipe with 10 shared tags
    // doesn't drown out other signals.
    let sharedTagCount = 0;
    for (const t of candidate.tags ?? []) {
      if (originalTags.has(t.toLowerCase())) sharedTagCount++;
    }
    if (sharedTagCount > 0) {
      score += Math.min(0.6, sharedTagCount * 0.2);
      reasons.push(
        sharedTagCount === 1 ? 'Shared cuisine' : `${sharedTagCount} shared tags`
      );
    }

    // Shared primary protein.
    if (originalProteinIds.size > 0) {
      for (const fid of candidate.food_ids ?? []) {
        if (originalProteinIds.has(fid)) {
          score += 0.2;
          reasons.push('Same protein');
          break;
        }
      }
    }

    // Favorite / well-rated bonus.
    if (candidate.is_favorite || (candidate.rating ?? 0) >= 4) {
      score += 0.4;
      reasons.push(candidate.is_favorite ? 'Family favorite' : 'Top-rated');
    }

    // Drop candidates that only earned the base point — they're not
    // meaningfully similar and would make the sheet look random.
    if (score <= 1) continue;

    scored.push({
      recipe: candidate,
      score,
      reasons,
      prepMinutes: candidatePrep,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
