/**
 * Sibling Meal Finder adapter (US-295).
 *
 * Bridges the app's domain types (Food, Kid, Recipe) to the pure
 * `siblingConstraintSolver` module so the solver stays dependency-free
 * and unit-testable on its own, and turns the solver's answer into what the
 * Finder can honestly claim about a dish.
 *
 * The solver's tier is a ceiling, not a verdict. A dish is only "works for
 * everyone" when every ingredient could be checked, every selected child has
 * an allergy list on file, and no child's plate is blocked or empty
 * (reconcileRow). Everything here is pure: no React, no Supabase.
 */

import type { Food, Kid, MealSlot, Recipe } from '@/types';
import {
  solveSiblingMeals,
  topSiblingSolutions,
  type ConstraintViolation,
  type SolverFood,
  type SolverHistoryEntry,
  type SolverKid,
  type SolverOptions,
  type SolverRecipe,
  type SolverResult,
} from '@/lib/siblingConstraintSolver';
import { worstFoodAllergen } from '@/lib/allergens';
import { isAllergyUnknown } from '@/lib/kidFit';
import { allergenCopyKind, type AllergenCopyKind } from '@/lib/planAllergenGuard';
import type { KidPlate } from '@/lib/platePlanner';
import { RECIPE_PLAN_SLOTS } from '@/lib/planSlotLabels';

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

export function foodToSolverFood(f: Food): SolverFood {
  return {
    id: f.id,
    name: f.name,
    category: f.category,
    allergens: f.allergens ?? [],
  };
}

export function kidToSolverKid(k: Kid): SolverKid {
  return {
    id: k.id,
    name: k.name,
    allergens: k.allergens ?? [],
    allergenSeverity: k.allergen_severity ?? null,
    dietaryRestrictions: k.dietary_restrictions ?? [],
    dislikedFoods: k.disliked_foods ?? [],
    favoriteFoods: k.favorite_foods ?? [],
    alwaysEatsFoods: k.always_eats_foods ?? [],
  };
}

const UNKNOWN_INGREDIENT = 'Unknown ingredient';

/**
 * Every ingredient the solver has to check, from EVERY recipe_ingredients row
 * plus every r.food_ids entry no row covers. A typed-in row (food_id null) becomes a
 * food named by its text with no allergen tags, so the matcher's name scan
 * still reads "peanut butter". An id that does not resolve keeps its id and
 * is named by its row's text when there is one.
 */
export function recipeToSolverRecipe(r: Recipe, foodById: ReadonlyMap<string, Food>): SolverRecipe {
  const foods: SolverFood[] = [];
  const covered = new Set<string>();
  const push = (food: SolverFood) => {
    if (covered.has(food.id)) return;
    covered.add(food.id);
    foods.push(food);
  };

  for (const row of r.recipe_ingredients ?? []) {
    const id = typeof row.food_id === 'string' && row.food_id.trim() ? row.food_id : null;
    if (id) {
      const f = foodById.get(id);
      push(
        f
          ? foodToSolverFood(f)
          : { id, name: row.name?.trim() || UNKNOWN_INGREDIENT, allergens: [], category: undefined },
      );
    } else {
      push({ id: `ing:${row.id}`, name: row.name ?? '', allergens: [], category: undefined });
    }
  }
  for (const id of r.food_ids ?? []) {
    if (typeof id !== 'string' || !id) continue;
    const f = foodById.get(id);
    push(f ? foodToSolverFood(f) : { id, name: UNKNOWN_INGREDIENT, allergens: [], category: undefined });
  }

  return {
    id: r.id,
    name: r.name,
    imageUrl: r.image_url ?? null,
    prepMinutes: parsePrepMinutes(r),
    foodIds: foods.map((f) => f.id),
    foods,
  };
}

/**
 * Names of the ingredients whose allergens cannot be checked: typed-in rows,
 * plus food ids that do not resolve. Same rule as
 * kidFit.countUncheckedIngredients (its tests assert the counts agree), with
 * an id that appears both as a row and in food_ids counted once.
 */
export function uncheckedIngredientNames(
  r: Pick<Recipe, 'food_ids' | 'recipe_ingredients'>,
  foodById: ReadonlyMap<string, Food>,
): string[] {
  const out: string[] = [];
  const unresolved = new Map<string, string>();
  for (const row of r.recipe_ingredients ?? []) {
    if (row.food_id == null) {
      out.push(row.name?.trim() || UNKNOWN_INGREDIENT);
    } else if (!foodById.has(row.food_id) && !unresolved.has(row.food_id)) {
      unresolved.set(row.food_id, row.name?.trim() || UNKNOWN_INGREDIENT);
    }
  }
  for (const id of r.food_ids ?? []) {
    if (!foodById.has(id) && !unresolved.has(id)) unresolved.set(id, UNKNOWN_INGREDIENT);
  }
  return [...out, ...unresolved.values()];
}

// ---------------------------------------------------------------------------
// Solver inputs
// ---------------------------------------------------------------------------

export interface SolverInputBundle {
  foodById: Map<string, Food>;
  recipes: SolverRecipe[];
  recipeById: Map<string, SolverRecipe>;
  /** Swap candidates: allergen-checked foods only, in-stock first. */
  pantry: SolverFood[];
}

/**
 * Solver recipes and the swap pantry, built once. Depends only on
 * (recipes, foods), so a page can `useMemo` it and reuse the same
 * SolverRecipe for plating that the solver scored.
 *
 * A food with no allergen list (`allergens` not an array) was never checked,
 * so it is not offered as a swap: the swap check would read "no tags" as
 * "safe for everyone". Only the input changes; the solver's rules do not.
 */
export function buildSolverInputs(recipes: readonly Recipe[], foods: readonly Food[]): SolverInputBundle {
  const foodById = new Map<string, Food>(foods.map((f) => [f.id, f]));
  const solverRecipes = recipes.map((r) => recipeToSolverRecipe(r, foodById));
  const checked = foods.filter((f) => Array.isArray(f.allergens));
  const inStock = checked.filter((f) => (f.quantity ?? 0) > 0);
  const rest = checked.filter((f) => !((f.quantity ?? 0) > 0));
  return {
    foodById,
    recipes: solverRecipes,
    recipeById: new Map(solverRecipes.map((r) => [r.id, r])),
    pantry: [...inStock, ...rest].map(foodToSolverFood),
  };
}

export interface FindArgs {
  recipes: Recipe[];
  foods: Food[];
  kids: Kid[];
  selectedKidIds: string[];
  history: SolverHistoryEntry[];
  options?: SolverOptions;
  /** buildSolverInputs(recipes, foods), when the caller already has it. */
  inputs?: SolverInputBundle;
}

function selectedKidsOf<K extends { id: string }>(kids: readonly K[], selectedKidIds: readonly string[]): K[] {
  if (selectedKidIds.length === 0) return [...kids];
  const wanted = new Set(selectedKidIds);
  return kids.filter((k) => wanted.has(k.id));
}

/**
 * Run the solver against the user's library. If `selectedKidIds` is empty,
 * the solver runs against ALL kids - a single-kid pick is effectively the
 * scalar constraint case so the solver still works.
 */
export function findSiblingMeals(args: FindArgs): SolverResult[] {
  const inputs = args.inputs ?? buildSolverInputs(args.recipes, args.foods);
  const kids: SolverKid[] = selectedKidsOf(args.kids, args.selectedKidIds).map(kidToSolverKid);
  return solveSiblingMeals(
    { recipes: inputs.recipes, pantry: inputs.pantry, kids, history: args.history },
    args.options ?? {},
  );
}

export function topSiblingMeals(args: FindArgs, limit = 5): SolverResult[] {
  const inputs = args.inputs ?? buildSolverInputs(args.recipes, args.foods);
  const kids: SolverKid[] = selectedKidsOf(args.kids, args.selectedKidIds).map(kidToSolverKid);
  return topSiblingSolutions(
    { recipes: inputs.recipes, pantry: inputs.pantry, kids, history: args.history },
    args.options ?? {},
    limit,
  );
}

export type { SolverResult, SolverHistoryEntry } from '@/lib/siblingConstraintSolver';

/** US-295: lowest per-kid satisfaction score across a result (0..1). */
export function minKidScore(result: SolverResult): number {
  if (result.perKidSatisfaction.length === 0) return 0;
  return Math.min(...result.perKidSatisfaction.map((k) => k.score));
}

// ---------------------------------------------------------------------------
// Annotation: what the solver could not check
// ---------------------------------------------------------------------------

/** A severe/unrated/mild hit found by scanning a recipe's NAME (no ingredients to scan). */
export interface NameAllergenHit {
  kidId: string;
  kidName: string;
  allergen: string;
  copyKind: AllergenCopyKind;
}

export interface FinderRow {
  result: SolverResult;
  /** Ingredients whose allergens could not be checked; the recipe name when it has none. */
  uncheckedIngredients: string[];
  /** Selected kids whose allergy list was never filled in. */
  unknownAllergyKidIds: string[];
  /** True only when nothing is unchecked and every selected kid's allergies are known. */
  verified: boolean;
  /**
   * Only for a recipe with no ingredients at all: allergen hits found in its
   * name. A severe or unrated one makes the dish excluded-equivalent.
   */
  nameAllergenHits?: NameAllergenHit[];
}

type AnnotateKid = Pick<Kid, 'id' | 'name' | 'allergens'> & Partial<Pick<Kid, 'allergen_severity'>>;

/**
 * Attach to each solver result what the solver could not see: unchecked
 * ingredients (typed-in rows, unknown food ids, or no ingredients at all) and
 * selected kids with no allergy list. A recipe with no ingredients is scanned
 * by name with the same canonical matcher the solver uses.
 */
export function annotateResults(
  results: readonly SolverResult[],
  args: {
    recipes: readonly Recipe[];
    foods: readonly Food[];
    kids: readonly AnnotateKid[];
    selectedKidIds: readonly string[];
    /** buildSolverInputs(recipes, foods), when the caller already has it. */
    inputs?: SolverInputBundle;
  },
): FinderRow[] {
  const foodById = args.inputs?.foodById ?? new Map<string, Food>(args.foods.map((f) => [f.id, f]));
  const recipeById = new Map(args.recipes.map((r) => [r.id, r]));
  const selected = selectedKidsOf(args.kids, args.selectedKidIds);
  const unknownAllergyKidIds = selected.filter((k) => isAllergyUnknown(k)).map((k) => k.id);

  return results.map((result) => {
    const recipe = recipeById.get(result.recipeId);
    if (!recipe) {
      return {
        result,
        uncheckedIngredients: [result.recipeName],
        unknownAllergyKidIds,
        verified: false,
      };
    }
    const solverRecipe =
      args.inputs?.recipeById.get(recipe.id) ?? recipeToSolverRecipe(recipe, foodById);
    if (solverRecipe.foods.length === 0) {
      const nameAllergenHits: NameAllergenHit[] = [];
      for (const kid of selected) {
        const hit = worstFoodAllergen(kid, { name: recipe.name, allergens: [] });
        if (!hit) continue;
        nameAllergenHits.push({
          kidId: kid.id,
          kidName: kid.name,
          allergen: hit.allergen,
          copyKind: allergenCopyKind({ severity: hit.severity, severityRecorded: hit.recorded }),
        });
      }
      return {
        result,
        uncheckedIngredients: [recipe.name],
        unknownAllergyKidIds,
        verified: false,
        nameAllergenHits,
      };
    }
    const uncheckedIngredients = uncheckedIngredientNames(recipe, foodById);
    return {
      result,
      uncheckedIngredients,
      unknownAllergyKidIds,
      verified: uncheckedIngredients.length === 0 && unknownAllergyKidIds.length === 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** How much change per plate the parent accepts. */
export type FinderMode = 'as_is' | 'small_swaps' | 'separate_plates';
export type PrepLimit = 'any' | 15 | 30 | 45;

const MODE_TIERS: Record<FinderMode, ReadonlySet<SolverResult['resolutionType']>> = {
  as_is: new Set(['full_match']),
  small_swaps: new Set(['full_match', 'with_swaps']),
  separate_plates: new Set(['full_match', 'with_swaps', 'split_plate']),
};

/**
 * The Finder's controls, applied to annotated rows. Excluded results never
 * pass. `mode` picks which solver tiers show. With a prep limit, a timed dish
 * over it moves to `slower` (shown on request, not dropped); an untimed dish
 * (prepMinutes 0) stays visible but sorts after the timed ones, since
 * "unknown" is not "fast".
 */
export function filterRows(
  rows: readonly FinderRow[],
  opts: { mode: FinderMode; prep: PrepLimit },
): { visible: FinderRow[]; slower: FinderRow[] } {
  const tiers = MODE_TIERS[opts.mode];
  const inMode = rows.filter((r) => !r.result.excluded && tiers.has(r.result.resolutionType));
  if (opts.prep === 'any') return { visible: inMode, slower: [] };
  const limit = opts.prep;
  const timed: FinderRow[] = [];
  const untimed: FinderRow[] = [];
  const slower: FinderRow[] = [];
  for (const row of inMode) {
    const minutes = row.result.prepMinutes;
    if (!(minutes > 0)) untimed.push(row);
    else if (minutes > limit) slower.push(row);
    else timed.push(row);
  }
  return { visible: [...timed, ...untimed], slower };
}

export interface RelaxationSettings {
  /** Max disliked (soft-violation) foods tolerated per kid. */
  allowAversionsPerKid: number;
  /** When false, only full_match results survive (no swaps/split-plate). */
  allowSwaps: boolean;
  /** When true, any result with a soft violation is dropped. */
  hideSoftBlocks: boolean;
}

/**
 * @deprecated Use filterRows. The solver clears soft violations on every
 * result it returns (full_match has none, with_swaps resolves them all,
 * split_plate folds them into plate notes), so `allowAversionsPerKid` and
 * `hideSoftBlocks` never change the output; only `allowSwaps` does. Kept for
 * one release while the page moves over.
 */
export function applyRelaxation(
  results: SolverResult[],
  settings: RelaxationSettings
): SolverResult[] {
  return results.filter((r) => {
    if (r.excluded) return false;
    if (!settings.allowSwaps && r.resolutionType !== 'full_match') return false;
    if (settings.hideSoftBlocks) {
      const anySoft = r.perKidSatisfaction.some((k) => k.softViolations.length > 0);
      if (anySoft) return false;
    }
    const worstSoftPerKid = r.perKidSatisfaction.reduce(
      (max, k) => Math.max(max, k.softViolations.length),
      0
    );
    if (worstSoftPerKid > settings.allowAversionsPerKid) return false;
    return true;
  });
}

/** Verified full matches: the solver found nothing to change and nothing was left unchecked. */
export function familyWins(rows: readonly FinderRow[]): FinderRow[] {
  return rows.filter((r) => r.verified && !r.result.excluded && r.result.resolutionType === 'full_match');
}

// ---------------------------------------------------------------------------
// Reconciling the solver with the plates
// ---------------------------------------------------------------------------

export type ReconciledTier = 'everyone' | 'with_changes' | 'some_blocked' | 'none' | 'unverified';

export interface ReconciledBlock {
  kidId: string;
  kidName: string;
  allergen?: string;
  copyKind?: AllergenCopyKind;
  cause: 'plate_blocked' | 'plate_empty' | 'allergen';
}

export interface Reconciled {
  tier: ReconciledTier;
  /** Selected kids this dish can be planned for. */
  usableKidIds: string[];
  blocked: ReconciledBlock[];
}

function isAllergenViolation(v: ConstraintViolation): boolean {
  return v.allergenSeverity != null;
}

function violationCopyKind(v: ConstraintViolation): AllergenCopyKind {
  return allergenCopyKind({ severity: v.allergenSeverity ?? null, severityRecorded: v.allergenSeverityRecorded });
}

const COPY_RANK: Record<AllergenCopyKind, number> = { severe: 0, severeUnrated: 1, plain: 2 };

/** The kid's worst allergen violation, preferring one on `foodName` when given. */
function worstAllergenViolation(
  violations: readonly ConstraintViolation[],
  foodName?: string,
): ConstraintViolation | undefined {
  const allergenHits = violations.filter(isAllergenViolation);
  const pool = foodName ? allergenHits.filter((v) => v.foodName === foodName) : [];
  const from = pool.length > 0 ? pool : allergenHits;
  return [...from].sort((a, b) => COPY_RANK[violationCopyKind(a)] - COPY_RANK[violationCopyKind(b)])[0];
}

/**
 * What the Finder may say about one row, given the plates. The solver tier is
 * the ceiling: a plate can only take a kid away, never add one.
 *
 * - A blocked or empty plate removes that kid (cause and copy named).
 * - A recipe with no ingredients whose NAME hits a severe or unrated allergy
 *   is excluded-equivalent: tier 'none', nobody usable.
 * - 'none' when no selected kid is usable; 'some_blocked' when some are;
 *   'unverified' when the row could not be verified; otherwise 'everyone' for
 *   a full match with nothing held back or separated, else 'with_changes'.
 */
export function reconcileRow(
  row: FinderRow,
  plates: readonly KidPlate[] | undefined,
  kids: readonly Pick<Kid, 'id' | 'name'>[],
): Reconciled {
  const { result } = row;
  const nameOf = new Map<string, string>(kids.map((k) => [k.id, k.name]));
  for (const ks of result.perKidSatisfaction) if (!nameOf.has(ks.kidId)) nameOf.set(ks.kidId, ks.kidName);
  const selectedIds = result.perKidSatisfaction.map((ks) => ks.kidId);
  const perKidById = new Map(result.perKidSatisfaction.map((ks) => [ks.kidId, ks]));

  const blockedById = new Map<string, ReconciledBlock>();

  // Excluded by the solver: every kid with a severe/unrated hit is named, and
  // nobody is usable (the solver never split-plates those).
  if (result.excluded) {
    for (const ks of result.perKidSatisfaction) {
      const v = worstAllergenViolation(ks.hardViolations);
      if (!v) continue;
      blockedById.set(ks.kidId, {
        kidId: ks.kidId,
        kidName: nameOf.get(ks.kidId) ?? ks.kidName,
        ...(v.allergen ? { allergen: v.allergen } : {}),
        copyKind: violationCopyKind(v),
        cause: 'allergen',
      });
    }
    return { tier: 'none', usableKidIds: [], blocked: [...blockedById.values()] };
  }

  const severeNameHits = (row.nameAllergenHits ?? []).filter((h) => h.copyKind !== 'plain');
  if (severeNameHits.length > 0) {
    for (const h of severeNameHits) {
      if (blockedById.has(h.kidId)) continue;
      blockedById.set(h.kidId, {
        kidId: h.kidId,
        kidName: nameOf.get(h.kidId) ?? h.kidName,
        allergen: h.allergen,
        copyKind: h.copyKind,
        cause: 'allergen',
      });
    }
    return { tier: 'none', usableKidIds: [], blocked: [...blockedById.values()] };
  }

  const selectedSet = new Set(selectedIds);
  const relevantPlates = (plates ?? []).filter((p) => selectedSet.has(p.kidId));
  for (const plate of relevantPlates) {
    if (blockedById.has(plate.kidId)) continue;
    if (!plate.blocked && !plate.isEmpty) continue;
    const kidName = nameOf.get(plate.kidId) ?? plate.kidName;
    const ks = perKidById.get(plate.kidId);
    const by = plate.blockedBy;
    const v = ks
      ? worstAllergenViolation(ks.hardViolations, by?.kind === 'severe_allergen' ? by.foodName : undefined)
      : undefined;
    if (plate.blocked) {
      const copyKind: AllergenCopyKind | undefined = v
        ? violationCopyKind(v)
        : by?.kind === 'severe_allergen'
          ? by.copyKind
          : undefined;
      blockedById.set(plate.kidId, {
        kidId: plate.kidId,
        kidName,
        ...(v?.allergen ? { allergen: v.allergen } : {}),
        ...(copyKind ? { copyKind } : {}),
        cause: 'plate_blocked',
      });
    } else {
      blockedById.set(plate.kidId, { kidId: plate.kidId, kidName, cause: 'plate_empty' });
    }
  }

  const blocked = [...blockedById.values()];
  const usableKidIds = selectedIds.filter((id) => !blockedById.has(id));

  let tier: ReconciledTier;
  if (usableKidIds.length === 0) tier = 'none';
  else if (blocked.length > 0) tier = 'some_blocked';
  else if (!row.verified) tier = 'unverified';
  else {
    const platesChange = relevantPlates.some((p) => p.heldBack.length > 0 || p.separated.length > 0);
    tier = result.resolutionType === 'full_match' && !platesChange ? 'everyone' : 'with_changes';
  }
  return { tier, usableKidIds, blocked };
}

const TIER_RANK: Record<Exclude<ReconciledTier, 'none'>, number> = {
  everyone: 0,
  with_changes: 1,
  unverified: 2,
  some_blocked: 3,
};

/**
 * Order rows by what the Finder can claim: 'everyone', 'with_changes',
 * 'unverified', then 'some_blocked'; 'none' is dropped. Stable, so the
 * solver's own ranking holds within a tier.
 */
export function rankReconciled<T extends { reconciled: Reconciled }>(rows: readonly T[]): T[] {
  return rows
    .filter((r) => r.reconciled.tier !== 'none')
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        TIER_RANK[a.r.reconciled.tier as Exclude<ReconciledTier, 'none'>] -
          TIER_RANK[b.r.reconciled.tier as Exclude<ReconciledTier, 'none'>] || a.i - b.i,
    )
    .map(({ r }) => r);
}

// ---------------------------------------------------------------------------
// Excluded dishes, explained
// ---------------------------------------------------------------------------

export type ExclusionCopyKind = AllergenCopyKind | 'dietary';

export interface ExclusionKidReason {
  kidId: string;
  kidName: string;
  foodName: string;
  allergen?: string;
  copyKind: ExclusionCopyKind;
}

export interface ExclusionReason {
  recipeId: string;
  recipeName: string;
  kids: ExclusionKidReason[];
}

const EXCLUSION_RANK: Record<ExclusionCopyKind, number> = {
  severe: 0,
  severeUnrated: 1,
  plain: 2,
  dietary: 3,
};

/**
 * Why each excluded dish is out, one line per child: the child's worst hard
 * violation (recorded severe, then unrated, then mild/moderate, then
 * dietary). A dish excluded only for too many small changes has no hard
 * violation to name and is left out.
 */
export function describeExclusions(results: readonly SolverResult[]): ExclusionReason[] {
  const out: ExclusionReason[] = [];
  for (const result of results) {
    if (!result.excluded) continue;
    const kids: ExclusionKidReason[] = [];
    for (const ks of result.perKidSatisfaction) {
      const reasons = ks.hardViolations.map((v): ExclusionKidReason => {
        const copyKind: ExclusionCopyKind = isAllergenViolation(v) ? violationCopyKind(v) : 'dietary';
        return {
          kidId: ks.kidId,
          kidName: ks.kidName,
          foodName: v.foodName,
          ...(v.allergen ? { allergen: v.allergen } : {}),
          copyKind,
        };
      });
      if (reasons.length === 0) continue;
      reasons.sort((a, b) => EXCLUSION_RANK[a.copyKind] - EXCLUSION_RANK[b.copyKind]);
      kids.push(reasons[0]);
    }
    if (kids.length > 0) out.push({ recipeId: result.recipeId, recipeName: result.recipeName, kids });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Kid selection and deep links
// ---------------------------------------------------------------------------

export interface StoredKidSelection {
  kidIds: string[];
  /** Every kid id that existed when the selection was saved. */
  knownKidIds: string[];
}

/**
 * A saved kid selection brought up to date with the household: a child added
 * since is selected by default, a deleted child is pruned, and an explicit
 * empty selection stays empty (it is not "everyone"). Nothing saved means
 * everyone.
 */
export function reconcileKidSelection(
  stored: StoredKidSelection | null | undefined,
  kids: readonly Pick<Kid, 'id'>[],
): StoredKidSelection {
  const currentIds = kids.map((k) => k.id);
  if (!stored || !Array.isArray(stored.kidIds) || !Array.isArray(stored.knownKidIds)) {
    return { kidIds: currentIds, knownKidIds: currentIds };
  }
  const selected = new Set(stored.kidIds);
  const known = new Set(stored.knownKidIds);
  const kidIds = currentIds.filter((id) => selected.has(id) || !known.has(id));
  return { kidIds, knownKidIds: currentIds };
}

export interface FinderParams {
  date?: string;
  slot?: MealSlot;
  kidIds?: string[];
  from?: string;
}

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  // Round-trip through the calendar so 2026-02-30 is rejected, not rolled over.
  const at = new Date(Date.UTC(y, m - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === m - 1 && at.getUTCDate() === d;
}

/**
 * ?date=&slot=&kids=&from= from a deep link (Tonight's empty state, Recipes,
 * Kids). Anything malformed is dropped rather than trusted: a date must be a
 * real YYYY-MM-DD, a slot one of the planner's slots, kid ids ones this
 * household has, and `from` a short snake_case tag.
 */
export function parseFinderParams(
  searchParams: Pick<URLSearchParams, 'get'>,
  kids: readonly Pick<Kid, 'id'>[],
): FinderParams {
  const out: FinderParams = {};
  const date = searchParams.get('date');
  if (date && isRealIsoDate(date)) out.date = date;

  const slot = searchParams.get('slot');
  if (slot && (RECIPE_PLAN_SLOTS as readonly string[]).includes(slot)) out.slot = slot as MealSlot;

  const rawKids = searchParams.get('kids');
  if (rawKids) {
    const known = new Set(kids.map((k) => k.id));
    const ids = [...new Set(rawKids.split(',').map((s) => s.trim()))].filter((id) => known.has(id));
    if (ids.length > 0) out.kidIds = ids;
  }

  const from = searchParams.get('from');
  if (from && /^[a-z_]{1,40}$/.test(from)) out.from = from;

  return out;
}
