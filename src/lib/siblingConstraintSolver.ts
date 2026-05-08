/**
 * Sibling Constraint Solver (US-295).
 *
 * Pure, dependency-free recipe scorer that finds dinners which satisfy a set
 * of siblings simultaneously. Differs from Tonight Mode (US-293) by:
 *
 *   - Modeling hard vs soft constraints explicitly (allergens + dietary
 *     restrictions exclude; dislikes penalize; favorites/always-eats reward).
 *   - Returning solutions in three tiers: full_match, with_swaps, split_plate.
 *   - Suggesting per-kid food swaps from pantry when a single recipe almost
 *     works but a soft-blocking food can be substituted.
 *   - Surfacing a fairness adjustment so the same kid's preferences don't
 *     consistently dominate the family's meals.
 *
 * The solver is intentionally string-set heuristic (not a full SAT solver) -
 * the constraint surface is small (typical: 2-4 kids x ~5 prefs each x ~50
 * recipes) and we want decisions to be explainable to a parent in plain text.
 */

export type DietaryRestriction =
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'gluten-free'
  | 'dairy-free'
  | 'nut-free'
  | 'egg-free'
  | 'soy-free'
  | 'shellfish-free';

export interface SolverFood {
  id: string;
  name: string;
  category?: string;
  allergens?: string[] | null;
}

export interface SolverKid {
  id: string;
  name: string;
  allergens?: string[] | null;
  dietaryRestrictions?: string[] | null;
  dislikedFoods?: string[] | null;
  favoriteFoods?: string[] | null;
  alwaysEatsFoods?: string[] | null;
}

export interface SolverRecipe {
  id: string;
  name: string;
  imageUrl?: string | null;
  prepMinutes?: number;
  foodIds: string[];
  foods: SolverFood[];
}

export interface SolverHistoryEntry {
  kidId: string;
  /** 0..1 satisfaction score for that kid on that meal */
  score: number;
  daysAgo: number;
}

export interface SolverOptions {
  maxMinutes?: number;
  /** Used to apply a fairness boost to recipes that strongly satisfy
   *  kids whose recent average satisfaction is below the group average. */
  fairnessLookbackDays?: number;
  /** Cap on number of split-plate modifications before a recipe is dropped. */
  maxSplitPlateModifications?: number;
  limit?: number;
}

export type ResolutionType = 'full_match' | 'with_swaps' | 'split_plate';

export interface ConstraintViolation {
  /** food.id of the offending food in the recipe */
  foodId: string;
  foodName: string;
  /** Why this food violates a constraint, in plain English. */
  reason: string;
  /** 'hard' = excludes the kid (allergen / dietary). 'soft' = penalizes. */
  severity: 'hard' | 'soft';
}

export interface KidSatisfaction {
  kidId: string;
  kidName: string;
  /** 0..1 — pre-fairness, pre-swap raw score. */
  score: number;
  hardViolations: ConstraintViolation[];
  softViolations: ConstraintViolation[];
  favoriteHits: string[];
}

export interface SwapSuggestion {
  kidId: string;
  kidName: string;
  swapOutFoodId: string;
  swapOutFoodName: string;
  swapInFoodId: string;
  swapInFoodName: string;
  reason: string;
}

export interface SplitPlateModification {
  kidId: string;
  kidName: string;
  /** One-line plate description for the parent: "Same dish, hold the cheese". */
  plateDescription: string;
  modifications: string[];
}

export interface SolverResult {
  recipeId: string;
  recipeName: string;
  imageUrl: string | null;
  prepMinutes: number;
  resolutionType: ResolutionType;
  /** 0..100 aggregate after swaps/split-plate accounting + fairness. */
  satisfactionScore: number;
  perKidSatisfaction: KidSatisfaction[];
  swaps: SwapSuggestion[];
  splitPlates: SplitPlateModification[];
  /** When fairness adjustment changed the rank, a short note for the UI. */
  fairnessNote?: string;
  excluded: boolean;
  excludeReason?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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

/**
 * Maps a dietary restriction label to keyword/allergen rules. We intentionally
 * over-match on names because Food.category isn't always reliable and parents
 * import recipes from many sources.
 */
const DIETARY_RULES: Record<
  string,
  {
    excludeAllergens?: string[];
    excludeNameKeywords?: string[];
  }
> = {
  vegetarian: {
    excludeNameKeywords: [
      'beef',
      'pork',
      'chicken',
      'turkey',
      'lamb',
      'bacon',
      'ham',
      'sausage',
      'salami',
      'pepperoni',
      'fish',
      'salmon',
      'tuna',
      'shrimp',
      'prawn',
      'crab',
      'lobster',
      'veal',
      'duck',
      'anchovy',
    ],
  },
  vegan: {
    excludeAllergens: ['dairy', 'milk', 'egg', 'eggs'],
    excludeNameKeywords: [
      'beef',
      'pork',
      'chicken',
      'turkey',
      'lamb',
      'bacon',
      'ham',
      'sausage',
      'salami',
      'pepperoni',
      'fish',
      'salmon',
      'tuna',
      'shrimp',
      'prawn',
      'crab',
      'lobster',
      'veal',
      'duck',
      'anchovy',
      'cheese',
      'butter',
      'yogurt',
      'cream',
      'milk',
      'honey',
    ],
  },
  pescatarian: {
    excludeNameKeywords: [
      'beef',
      'pork',
      'chicken',
      'turkey',
      'lamb',
      'bacon',
      'ham',
      'sausage',
      'salami',
      'pepperoni',
      'veal',
      'duck',
    ],
  },
  'gluten-free': {
    excludeAllergens: ['gluten', 'wheat'],
    excludeNameKeywords: ['bread', 'pasta', 'noodle', 'cracker', 'tortilla', 'bun'],
  },
  'dairy-free': {
    excludeAllergens: ['dairy', 'milk'],
    excludeNameKeywords: ['cheese', 'butter', 'yogurt', 'cream', 'milk'],
  },
  'nut-free': {
    excludeAllergens: ['peanut', 'tree nut', 'nut', 'almond', 'cashew', 'walnut', 'pecan'],
    excludeNameKeywords: ['peanut', 'almond', 'cashew', 'walnut', 'pecan', 'pistachio'],
  },
  'egg-free': {
    excludeAllergens: ['egg', 'eggs'],
    excludeNameKeywords: ['egg'],
  },
  'soy-free': {
    excludeAllergens: ['soy', 'soya'],
    excludeNameKeywords: ['soy', 'tofu', 'edamame', 'tempeh'],
  },
  'shellfish-free': {
    excludeAllergens: ['shellfish', 'crustacean'],
    excludeNameKeywords: ['shrimp', 'prawn', 'crab', 'lobster', 'oyster', 'scallop', 'clam'],
  },
};

function violatesDietaryRestriction(
  food: SolverFood,
  restriction: string
): { violates: boolean; reason: string } {
  const rule = DIETARY_RULES[restriction.trim().toLowerCase()];
  if (!rule) return { violates: false, reason: '' };

  const allergens = lowerSet(food.allergens);
  for (const a of rule.excludeAllergens ?? []) {
    if (allergens.has(a)) {
      return { violates: true, reason: `${restriction} (contains ${a})` };
    }
  }
  const nameLower = food.name.toLowerCase();
  for (const kw of rule.excludeNameKeywords ?? []) {
    if (nameLower.includes(kw)) {
      return { violates: true, reason: `${restriction} (contains ${kw})` };
    }
  }
  return { violates: false, reason: '' };
}

// ---------------------------------------------------------------------------
// Per-kid evaluation
// ---------------------------------------------------------------------------

export function evaluateKidConstraint(recipe: SolverRecipe, kid: SolverKid): KidSatisfaction {
  const kidAllergens = lowerSet(kid.allergens);
  const dislikedIds = new Set(kid.dislikedFoods ?? []);
  const dislikedNames = lowerSet(kid.dislikedFoods);
  const favoriteIds = new Set(kid.favoriteFoods ?? []);
  const favoriteNames = lowerSet(kid.favoriteFoods);
  const alwaysEatsIds = new Set(kid.alwaysEatsFoods ?? []);
  const alwaysEatsNames = lowerSet(kid.alwaysEatsFoods);
  const restrictions = (kid.dietaryRestrictions ?? []).map((r) => r.trim()).filter((r) => r);

  const hardViolations: ConstraintViolation[] = [];
  const softViolations: ConstraintViolation[] = [];
  const favoriteHits: string[] = [];

  for (const food of recipe.foods) {
    // Hard: allergen
    let allergenHit: string | null = null;
    for (const a of food.allergens ?? []) {
      if (kidAllergens.has(String(a).trim().toLowerCase())) {
        allergenHit = String(a);
        break;
      }
    }
    if (allergenHit) {
      hardViolations.push({
        foodId: food.id,
        foodName: food.name,
        reason: `allergen (${allergenHit})`,
        severity: 'hard',
      });
      continue; // no need to also flag as dislike etc.
    }

    // Hard: dietary restriction
    let dietaryReason: string | null = null;
    for (const r of restrictions) {
      const { violates, reason } = violatesDietaryRestriction(food, r);
      if (violates) {
        dietaryReason = reason;
        break;
      }
    }
    if (dietaryReason) {
      hardViolations.push({
        foodId: food.id,
        foodName: food.name,
        reason: dietaryReason,
        severity: 'hard',
      });
      continue;
    }

    // Soft: dislike
    if (dislikedIds.has(food.id) || dislikedNames.has(food.name.trim().toLowerCase())) {
      softViolations.push({
        foodId: food.id,
        foodName: food.name,
        reason: 'disliked',
        severity: 'soft',
      });
      continue;
    }

    // Bonus: favorite / always eats
    if (
      favoriteIds.has(food.id) ||
      favoriteNames.has(food.name.trim().toLowerCase()) ||
      alwaysEatsIds.has(food.id) ||
      alwaysEatsNames.has(food.name.trim().toLowerCase())
    ) {
      favoriteHits.push(food.name);
    }
  }

  // Score: 1.0 base, hard zeros it, each soft -0.25, each favorite +0.1 (capped at 1).
  let score = 1;
  if (hardViolations.length > 0) {
    score = 0;
  } else {
    score -= 0.25 * softViolations.length;
    score += 0.1 * favoriteHits.length;
  }

  return {
    kidId: kid.id,
    kidName: kid.name,
    score: clamp01(score),
    hardViolations,
    softViolations,
    favoriteHits,
  };
}

// ---------------------------------------------------------------------------
// Swap & split-plate planning
// ---------------------------------------------------------------------------

/**
 * For a single kid's soft violation in a recipe, look for a pantry food that:
 *   - shares the offending food's category (so it can stand in)
 *   - is NOT disliked by the kid
 *   - is NOT an allergen for ANY kid in the group
 *   - does NOT violate any group member's dietary restrictions
 *
 * Returns the first viable swap, or null. We deliberately don't return
 * multiple options to keep the UI simple; the parent can edit if needed.
 */
function findSwap(
  violation: ConstraintViolation,
  recipe: SolverRecipe,
  kid: SolverKid,
  allKids: SolverKid[],
  pantry: SolverFood[]
): SolverFood | null {
  const offendingFood = recipe.foods.find((f) => f.id === violation.foodId);
  if (!offendingFood) return null;
  const offendingCategory = (offendingFood.category ?? '').toLowerCase();
  if (!offendingCategory) return null;

  const recipeFoodIds = new Set(recipe.foodIds);

  for (const candidate of pantry) {
    if (recipeFoodIds.has(candidate.id)) continue;
    if ((candidate.category ?? '').toLowerCase() !== offendingCategory) continue;

    // Asking kid must not dislike it
    const kidDislikes = lowerSet(kid.dislikedFoods);
    const kidDislikeIds = new Set(kid.dislikedFoods ?? []);
    if (kidDislikes.has(candidate.name.trim().toLowerCase()) || kidDislikeIds.has(candidate.id)) {
      continue;
    }

    // Must not violate any group member's hard constraints
    let viable = true;
    for (const other of allKids) {
      const allergens = lowerSet(other.allergens);
      const candAllergens = lowerSet(candidate.allergens);
      let hit = false;
      for (const a of candAllergens) {
        if (allergens.has(a)) {
          hit = true;
          break;
        }
      }
      if (hit) {
        viable = false;
        break;
      }
      for (const r of other.dietaryRestrictions ?? []) {
        if (violatesDietaryRestriction(candidate, r).violates) {
          viable = false;
          break;
        }
      }
      if (!viable) break;
    }
    if (!viable) continue;

    return candidate;
  }
  return null;
}

interface PlanResult {
  resolutionType: ResolutionType;
  swaps: SwapSuggestion[];
  splitPlates: SplitPlateModification[];
  /** Adjusted per-kid satisfaction after applying swaps/splits. */
  adjustedSatisfaction: KidSatisfaction[];
}

function planResolution(
  recipe: SolverRecipe,
  perKid: KidSatisfaction[],
  kids: SolverKid[],
  pantry: SolverFood[],
  options: SolverOptions
): PlanResult | null {
  // 1. Full match: nobody has any violation.
  const noOne = (sel: (k: KidSatisfaction) => unknown[]) =>
    perKid.every((k) => sel(k).length === 0);
  if (noOne((k) => k.hardViolations) && noOne((k) => k.softViolations)) {
    return {
      resolutionType: 'full_match',
      swaps: [],
      splitPlates: [],
      adjustedSatisfaction: perKid,
    };
  }

  // 2. With swaps: try to resolve every soft violation via pantry swap;
  //    succeeds only if ALL soft violations have viable swaps AND no hard violations remain.
  if (noOne((k) => k.hardViolations)) {
    const swaps: SwapSuggestion[] = [];
    let allResolved = true;
    const adjusted = perKid.map((k) => ({ ...k, softViolations: [...k.softViolations] }));

    for (const ks of adjusted) {
      const kid = kids.find((kk) => kk.id === ks.kidId)!;
      const remaining: ConstraintViolation[] = [];
      for (const v of ks.softViolations) {
        const swap = findSwap(v, recipe, kid, kids, pantry);
        if (swap) {
          swaps.push({
            kidId: kid.id,
            kidName: kid.name,
            swapOutFoodId: v.foodId,
            swapOutFoodName: v.foodName,
            swapInFoodId: swap.id,
            swapInFoodName: swap.name,
            reason: `${kid.name} dislikes ${v.foodName} - swap for ${swap.name}`,
          });
        } else {
          remaining.push(v);
          allResolved = false;
        }
      }
      ks.softViolations = remaining;
      // Recompute score: each remaining soft -0.25, +0.1 per favorite, cap at 1.
      const s = 1 - 0.25 * remaining.length + 0.1 * ks.favoriteHits.length;
      ks.score = clamp01(s);
    }

    if (allResolved) {
      return {
        resolutionType: 'with_swaps',
        swaps,
        splitPlates: [],
        adjustedSatisfaction: adjusted,
      };
    }
  }

  // 3. Split plate: model per-kid plate modifications. We accept at most
  //    `maxSplitPlateModifications` mods (default 2) per kid before declaring
  //    the recipe unsuitable. Hard violations -> "hold the X / serve plain".
  //    Soft violations without swaps -> "skip the X for this plate".
  const maxMods = options.maxSplitPlateModifications ?? 2;
  const splitPlates: SplitPlateModification[] = [];
  const adjusted = perKid.map((k) => ({
    ...k,
    hardViolations: [...k.hardViolations],
    softViolations: [...k.softViolations],
  }));

  for (const ks of adjusted) {
    const totalMods = ks.hardViolations.length + ks.softViolations.length;
    if (totalMods === 0) continue;
    if (totalMods > maxMods) {
      return null; // recipe is too far from working for this kid
    }
    const kid = kids.find((kk) => kk.id === ks.kidId)!;
    const mods: string[] = [];
    for (const v of ks.hardViolations) {
      mods.push(`Hold the ${v.foodName} (${v.reason})`);
    }
    for (const v of ks.softViolations) {
      mods.push(`Skip the ${v.foodName} for ${kid.name}`);
    }
    splitPlates.push({
      kidId: kid.id,
      kidName: kid.name,
      plateDescription: `Same dish for ${kid.name} - ${mods.length === 1 ? mods[0].toLowerCase() : `${mods.length} small changes`}`,
      modifications: mods,
    });
    // After modification: hard violations become 0 cost, soft kept as small penalty
    // (parent still has to remember to skip something). Each mod -0.1.
    const s = 1 - 0.1 * totalMods + 0.1 * ks.favoriteHits.length;
    ks.score = clamp01(s);
    ks.hardViolations = [];
    ks.softViolations = [];
  }

  return {
    resolutionType: 'split_plate',
    swaps: [],
    splitPlates,
    adjustedSatisfaction: adjusted,
  };
}

// ---------------------------------------------------------------------------
// Fairness
// ---------------------------------------------------------------------------

/**
 * For each kid, compute a recency-weighted average of their past satisfaction.
 * Kids with below-group-average scores get a small boost on this run so they
 * don't lose every dinner pick. Returns 0..0.15 boost per kid.
 */
export function computeFairnessBoosts(
  kidIds: string[],
  history: SolverHistoryEntry[],
  lookbackDays = 21
): Record<string, number> {
  const filtered = history.filter((h) => h.daysAgo <= lookbackDays && kidIds.includes(h.kidId));
  if (filtered.length === 0) return Object.fromEntries(kidIds.map((id) => [id, 0]));

  // weight: 7d ago = 2, 14d = 1, older = 0.5
  const weight = (d: number) => (d <= 7 ? 2 : d <= 14 ? 1 : 0.5);
  const sums: Record<string, { score: number; weight: number }> = {};
  for (const id of kidIds) sums[id] = { score: 0, weight: 0 };
  for (const h of filtered) {
    const w = weight(h.daysAgo);
    if (!sums[h.kidId]) sums[h.kidId] = { score: 0, weight: 0 };
    sums[h.kidId].score += h.score * w;
    sums[h.kidId].weight += w;
  }
  const avgs: Record<string, number> = {};
  for (const id of kidIds) {
    avgs[id] = sums[id].weight > 0 ? sums[id].score / sums[id].weight : 1;
  }
  const groupAvg = Object.values(avgs).reduce((a, b) => a + b, 0) / kidIds.length;

  const boosts: Record<string, number> = {};
  for (const id of kidIds) {
    const gap = groupAvg - avgs[id];
    // gap of 0.5 → +0.15 boost; gap <=0 → 0 boost.
    boosts[id] = gap <= 0 ? 0 : Math.min(0.15, gap * 0.3);
  }
  return boosts;
}

// ---------------------------------------------------------------------------
// Top-level solver
// ---------------------------------------------------------------------------

export interface SolverInputs {
  recipes: SolverRecipe[];
  pantry: SolverFood[];
  kids: SolverKid[];
  history?: SolverHistoryEntry[];
}

export function solveSiblingMeals(
  inputs: SolverInputs,
  options: SolverOptions = {}
): SolverResult[] {
  const { recipes, pantry, kids, history = [] } = inputs;
  if (kids.length === 0) return [];

  const fairnessBoosts = computeFairnessBoosts(
    kids.map((k) => k.id),
    history,
    options.fairnessLookbackDays ?? 21
  );
  const boostedKidId = Object.entries(fairnessBoosts).sort((a, b) => b[1] - a[1])[0];

  const out: SolverResult[] = [];

  for (const recipe of recipes) {
    const perKid = kids.map((k) => evaluateKidConstraint(recipe, k));
    const plan = planResolution(recipe, perKid, kids, pantry, options);

    const prepMinutes = recipe.prepMinutes ?? 0;
    const overBudget =
      options.maxMinutes != null && prepMinutes > options.maxMinutes
        ? prepMinutes - options.maxMinutes
        : 0;

    if (!plan) {
      out.push({
        recipeId: recipe.id,
        recipeName: recipe.name,
        imageUrl: recipe.imageUrl ?? null,
        prepMinutes,
        resolutionType: 'split_plate',
        satisfactionScore: 0,
        perKidSatisfaction: perKid,
        swaps: [],
        splitPlates: [],
        excluded: true,
        excludeReason: 'Too many constraint conflicts to resolve',
      });
      continue;
    }

    // Apply fairness boost to the targeted kid's satisfaction (for ranking only).
    const fairnessAdjusted = plan.adjustedSatisfaction.map((ks) => ({
      ...ks,
      score: clamp01(ks.score + (fairnessBoosts[ks.kidId] ?? 0)),
    }));

    // Aggregate score: weighted average of per-kid scores, scaled to 100,
    // minus a small prep-time penalty.
    const sum = fairnessAdjusted.reduce((acc, k) => acc + k.score, 0);
    const avg = sum / fairnessAdjusted.length;
    let satisfactionScore = avg * 100 - overBudget * 0.5;

    // Penalize tiers so full_match > with_swaps > split_plate even at equal raw scores.
    if (plan.resolutionType === 'with_swaps') satisfactionScore -= 5;
    if (plan.resolutionType === 'split_plate') satisfactionScore -= 12;

    let fairnessNote: string | undefined;
    if (boostedKidId && boostedKidId[1] > 0.05) {
      const boosted = kids.find((k) => k.id === boostedKidId[0]);
      const fitForBoosted = fairnessAdjusted.find((ks) => ks.kidId === boostedKidId[0]);
      if (boosted && fitForBoosted && fitForBoosted.score >= 0.85) {
        fairnessNote = `Good match for ${boosted.name} - their preferences have been losing lately.`;
      }
    }

    out.push({
      recipeId: recipe.id,
      recipeName: recipe.name,
      imageUrl: recipe.imageUrl ?? null,
      prepMinutes,
      resolutionType: plan.resolutionType,
      satisfactionScore: Math.max(0, Math.round(satisfactionScore * 100) / 100),
      perKidSatisfaction: fairnessAdjusted,
      swaps: plan.swaps,
      splitPlates: plan.splitPlates,
      fairnessNote,
      excluded: false,
    });
  }

  out.sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    return b.satisfactionScore - a.satisfactionScore;
  });

  const limit = options.limit ?? 10;
  return out.slice(0, limit);
}

export function topSiblingSolutions(
  inputs: SolverInputs,
  options: SolverOptions = {},
  limit = 5
): SolverResult[] {
  return solveSiblingMeals(inputs, { ...options, limit }).filter((r) => !r.excluded);
}
