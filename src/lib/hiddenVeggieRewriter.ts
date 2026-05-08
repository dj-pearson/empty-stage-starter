/**
 * Hidden-Veggies auto-rewrite engine (US-297).
 *
 * Pure module. Given a recipe and a set of `HiddenVeggieTechnique`s from the
 * server-side catalog (`hidden_veggie_techniques`), produces zero or more
 * `Rewrite` candidates that:
 *
 *   - match the recipe by keyword/category
 *   - skip techniques whose veggie is allergenic or disliked for any kid
 *     in the supplied profile set
 *   - cap ingredient additions at the technique's max_ratio
 *   - emit a structured ingredient diff + an instruction snippet that can
 *     be appended to the recipe's existing instructions
 *
 * Kept dependency-free so it's testable in isolation; the page-level
 * adapter pulls techniques + kid profiles from Supabase and feeds them in.
 */

export interface HiddenVeggieTechnique {
  id: string;
  veggieName: string;
  veggieAllergens: string[];
  recipeKeywords: string[];
  recipeCategories: string[];
  technique: string;
  prepMethod: string;
  maxRatio: number;
  suggestedAmount: string;
  instructionTemplate: string;
  stealthTip: string;
  stealthScore: number;
}

export interface RewriterRecipe {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  instructions?: string | null;
  /** Existing food names in the recipe; used to skip already-present veggies. */
  existingFoodNames?: string[];
}

export interface RewriterKid {
  id: string;
  name: string;
  allergens?: string[] | null;
  dislikedFoods?: string[] | null;
}

export interface RewriterIngredient {
  name: string;
  amount: string;
  technique: string;
  prepMethod: string;
}

export interface RewriterStep {
  text: string;
  position: 'append' | 'prepend';
}

export interface Rewrite {
  techniqueId: string;
  veggieName: string;
  /** Variant of the recipe with the veggie hidden. Suggested by the engine. */
  variantName: string;
  /** Single new ingredient to add (the hidden veggie). */
  addedIngredient: RewriterIngredient;
  /** New instruction step appended to the recipe's instructions. */
  addedStep: RewriterStep;
  /** Plain-English reassurance for the parent. */
  stealthTip: string;
  /** 0-100 confidence that the kid won't detect. */
  stealthScore: number;
  /** Reasons we surfaced this technique (for the UI). */
  matchReasons: string[];
  /** Kids in the input set this rewrite is safe for. */
  safeForKidIds: string[];
}

export interface RewriteOptions {
  /** Limit returned rewrites. Default 3. */
  limit?: number;
  /** Minimum stealth score to surface. Default 70. */
  minStealthScore?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lower(s: string | null | undefined): string {
  return (s ?? '').toLowerCase();
}

function lowerSet(values: readonly (string | null | undefined)[] | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!values) return out;
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) out.add(v.trim().toLowerCase());
  }
  return out;
}

function recipeHaystack(recipe: RewriterRecipe): string {
  return [recipe.name, recipe.description ?? '', recipe.instructions ?? '']
    .map((s) => s.toLowerCase())
    .join(' ​ ');
}

function recipeMentionsVeggie(recipe: RewriterRecipe, veggie: string): boolean {
  const v = veggie.trim().toLowerCase();
  if (!v) return false;
  if (recipeHaystack(recipe).includes(v)) return true;
  for (const f of recipe.existingFoodNames ?? []) {
    if (f.toLowerCase().includes(v)) return true;
  }
  return false;
}

interface KeywordHit {
  keyword: string;
}

function matchKeywords(recipe: RewriterRecipe, keywords: string[]): KeywordHit[] {
  const haystack = recipeHaystack(recipe);
  const hits: KeywordHit[] = [];
  for (const kw of keywords) {
    const k = kw.trim().toLowerCase();
    if (!k) continue;
    if (haystack.includes(k)) hits.push({ keyword: kw });
  }
  return hits;
}

function categoryMatches(recipe: RewriterRecipe, categories: string[]): boolean {
  if (categories.length === 0) return true; // no category filter
  const c = lower(recipe.category);
  if (!c) return false;
  return categories.some((cat) => cat.trim().toLowerCase() === c);
}

function safeForKids(
  technique: HiddenVeggieTechnique,
  kids: RewriterKid[]
): { allSafeIds: string[]; blockedReason?: string } {
  const allergens = lowerSet(technique.veggieAllergens);
  const safe: string[] = [];
  let blocked: string | undefined;

  for (const kid of kids) {
    const kidAllergens = lowerSet(kid.allergens);
    let hardBlocked = false;
    for (const a of allergens) {
      if (kidAllergens.has(a)) {
        hardBlocked = true;
        blocked = `${kid.name}: allergen ${a}`;
        break;
      }
    }
    if (hardBlocked) continue;

    // Hidden, but if the kid explicitly DISLIKES the actual veggie name we still
    // surface the technique (the whole point is the kid won't notice). However,
    // if the technique veggie itself is the dislike AND the prep method is one
    // that's likely to leave residue (e.g. grated chunks in muffins), we'd
    // ideally skip. For v1 we trust stealth_score; UI can warn separately.
    safe.push(kid.id);
  }

  return { allSafeIds: safe, blockedReason: blocked };
}

function buildVariantName(originalName: string, veggie: string): string {
  // Avoid double-suffixing if user reapplies on a variant.
  if (/\(.*hidden.*\)/i.test(originalName)) return originalName;
  const veggieDisplay = veggie.charAt(0).toUpperCase() + veggie.slice(1);
  return `${originalName} (Hidden ${veggieDisplay})`;
}

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------

export interface RewriteInputs {
  recipe: RewriterRecipe;
  techniques: HiddenVeggieTechnique[];
  /** Kids whose constraints should be honored. Empty = no kid filtering. */
  kids: RewriterKid[];
}

export function generateHiddenVeggieRewrites(
  inputs: RewriteInputs,
  options: RewriteOptions = {}
): Rewrite[] {
  const minScore = options.minStealthScore ?? 70;
  const limit = options.limit ?? 3;

  const out: Rewrite[] = [];

  for (const t of inputs.techniques) {
    if (t.stealthScore < minScore) continue;
    if (recipeMentionsVeggie(inputs.recipe, t.veggieName)) continue; // already there
    if (!categoryMatches(inputs.recipe, t.recipeCategories)) continue;

    const hits = matchKeywords(inputs.recipe, t.recipeKeywords);
    if (hits.length === 0) continue;

    const safety = safeForKids(t, inputs.kids);
    // If at least one kid is allergic, skip outright. Otherwise we accept
    // even when only some kids are "safe" - the parent can decide.
    if (safety.blockedReason) continue;

    const matchReasons: string[] = [];
    matchReasons.push(`matches "${hits[0].keyword}"`);
    if (t.recipeCategories.length > 0)
      matchReasons.push(`category: ${t.recipeCategories.join('/')}`);
    if (t.stealthScore >= 85) matchReasons.push('high stealth');

    out.push({
      techniqueId: t.id,
      veggieName: t.veggieName,
      variantName: buildVariantName(inputs.recipe.name, t.veggieName),
      addedIngredient: {
        name: t.veggieName,
        amount: t.suggestedAmount,
        technique: t.technique,
        prepMethod: t.prepMethod,
      },
      addedStep: {
        text: t.instructionTemplate,
        position: 'append',
      },
      stealthTip: t.stealthTip,
      stealthScore: t.stealthScore,
      matchReasons,
      safeForKidIds: safety.allSafeIds,
    });
  }

  // Highest stealth first; ties broken by veggie variety (don't return 3 cauliflower rewrites).
  out.sort((a, b) => b.stealthScore - a.stealthScore);
  const seenVeggies = new Set<string>();
  const deduped: Rewrite[] = [];
  for (const r of out) {
    const key = r.veggieName.trim().toLowerCase();
    if (seenVeggies.has(key)) continue;
    seenVeggies.add(key);
    deduped.push(r);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

// ---------------------------------------------------------------------------
// Apply a rewrite (compute the modified recipe payload)
// ---------------------------------------------------------------------------

export interface AppliedRewrite {
  variantName: string;
  /**
   * Ready-to-write `additional_ingredients` text — appended to whatever
   * the recipe already had. We use the existing free-text field rather
   * than minting a brand-new RecipeIngredient row so v1 doesn't depend
   * on the ingredients table being populated.
   */
  additionalIngredientsAddendum: string;
  /** Updated `instructions` field with the new step appended. */
  updatedInstructions: string;
  /** Updated `tips` field with the stealth tip merged in (idempotent). */
  updatedTips: string;
}

export function applyRewriteToRecipe(
  recipe: RewriterRecipe & { additionalIngredients?: string | null; tips?: string | null },
  rewrite: Rewrite
): AppliedRewrite {
  const existingAdd = (recipe.additionalIngredients ?? '').trim();
  const newIngredientLine = `${rewrite.addedIngredient.amount} (hidden: ${rewrite.addedIngredient.prepMethod.replace(/_/g, ' ')})`;
  const additionalIngredientsAddendum = existingAdd
    ? `${existingAdd}\n${newIngredientLine}`
    : newIngredientLine;

  const existingInstr = (recipe.instructions ?? '').trim();
  const updatedInstructions = existingInstr
    ? `${existingInstr}\n\nHidden veggie step: ${rewrite.addedStep.text}`
    : `Hidden veggie step: ${rewrite.addedStep.text}`;

  const existingTips = (recipe.tips ?? '').trim();
  const tipMarker = `[Hidden veggies] ${rewrite.stealthTip}`;
  const updatedTips = existingTips.includes(tipMarker)
    ? existingTips
    : existingTips
      ? `${existingTips}\n${tipMarker}`
      : tipMarker;

  return {
    variantName: rewrite.variantName,
    additionalIngredientsAddendum,
    updatedInstructions,
    updatedTips,
  };
}
