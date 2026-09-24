/**
 * Client-side food chaining scorer (contract 4).
 *
 * The server cache behind get_food_chain_suggestions is empty for most
 * households (food_chain_suggestions has a SELECT policy and nothing that
 * fills it from the client), so the Food Chaining page scores its own
 * candidates: given one anchor the child already eats and the household
 * pantry, which foods are a small step away, and why.
 *
 * Signals, per dimension:
 *   1. food_properties rows, when both foods have the field set.
 *   2. Otherwise a small name lexicon that mirrors the seed in
 *      20251008150000_create_food_tracking_features.sql, plus a shared content
 *      word ("buttered pasta" and "pasta with sauce" share "pasta").
 *   3. Food.category equality.
 *
 * Pure and deterministic: no React, no Supabase, no DB writes. The caller runs
 * every result through the allergen guard (selectHandoffCandidates with
 * foodsById); this module does not look at allergens.
 */

import type { Food } from "@/types";

export type ReasonKey = "taste" | "texture" | "color" | "shape" | "type";

export interface FoodPropsLite {
  food_id: string;
  texture_primary?: string | null;
  texture_secondary?: string | null;
  flavor_profile?: string[] | string | null;
  color_primary?: string | null;
  color_secondary?: string | null;
  visual_complexity?: string | number | null;
  food_category?: string | null;
}

export interface ScoredChainSuggestion {
  foodId: string;
  foodName: string;
  similarityScore: number;
  reasons: ReasonKey[];
}

export type Closeness = "small" | "medium" | "big";

/** Scores at or above this are shown as a next link. */
export const CHAIN_SCORE_THRESHOLD = 30;
/** Largest pantry the scorer walks for one anchor. */
export const CHAIN_PANTRY_SCAN_CAP = 500;

/** Display order of reason chips. */
const REASON_ORDER: readonly ReasonKey[] = ["taste", "texture", "color", "shape", "type"];

/** Points per matching signal. They add up to exactly 100. */
const WEIGHTS = {
  texture: 20,
  taste: 15,
  color: 15,
  shape: 15,
  category: 10,
  sharedWord: 25,
} as const;

// ---------------------------------------------------------------------------
// Name lexicon
// ---------------------------------------------------------------------------

type Lexicon = Record<string, RegExp>;

// Word-start anchored so "pea" does not hit "peanut" and "mac" does not hit
// "stomach". Kept small on purpose: a wrong match costs a parent's trust more
// than a missing one.
const TEXTURES: Lexicon = {
  crunchy: /\b(nuggets?|chips?|crackers?|fries|fry|toast|goldfish|pretzels?|crisps?|cheerios?|granola|cereal)\b/,
  soft: /\b(pasta|noodles?|rice|mac|macaroni|spaghetti|penne|mashed|banana|pancakes?|bread)\b/,
  smooth: /\b(yogh?urt|pudding|applesauce|smoothie|puree|soup|hummus)\b/,
};

const COLORS: Lexicon = {
  orange: /\b(cheese|cheesy|cheddar|carrots?|mac|macaroni|goldfish|oranges?|sweet potato|pumpkin|mango)\b/,
  white: /\b(rice|pasta|noodles?|bread|potato(es)?|toast|spaghetti|penne|cauliflower|yogh?urt)\b/,
  green: /\b(broccoli|peas|green|beans?|spinach|cucumbers?|lettuce|kale|celery|avocados?|zucchini|kiwi)\b/,
  red: /\b(tomato(es)?|strawberr(y|ies)|apples?|red|raspberr(y|ies)|watermelon|ketchup|cherr(y|ies))\b/,
};

const SHAPES: Lexicon = {
  stick: /\b(sticks?|nuggets?|fries|fry|fingers?|tenders?|strips?)\b/,
  round: /\b(round|balls?|meatballs?|puffs?|circles?|cheerios?|grapes?|peas|blueberr(y|ies))\b/,
  noodle: /\b(noodles?|pasta|spaghetti|macaroni|mac|penne)\b/,
};

const TASTES: Lexicon = {
  sweet: /\b(sweet|honey|jam|syrup|banana|apples?|chocolate|cookies?|muffins?|strawberr(y|ies)|grapes?)\b/,
  salty: /\b(salty|salted|chips?|pretzels?|fries|crackers?|goldfish|popcorn)\b/,
  cheesy: /\b(cheese|cheesy|cheddar|mac|macaroni|goldfish|quesadillas?)\b/,
  buttery: /\b(butter|buttered|buttery)\b/,
};

// Words that describe a food rather than name it; they never count as the
// shared content word.
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "with", "without", "of", "on", "in", "to", "for",
  "little", "bit", "some", "plain", "small", "big", "mini", "fresh", "homemade",
  "sliced", "cut", "cooked", "raw", "baked", "frozen", "side", "piece", "pieces",
  "extra", "light", "buttered", "butter", "sauce", "style", "brand",
]);

const nameKey = (value: string | null | undefined): string =>
  String(value ?? "").trim().toLowerCase();

function lexiconTags(name: string, lexicon: Lexicon): Set<string> {
  const out = new Set<string>();
  for (const [tag, re] of Object.entries(lexicon)) if (re.test(name)) out.add(tag);
  return out;
}

function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("es") && /(ch|sh|x|o)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function contentWords(name: string): Set<string> {
  const out = new Set<string>();
  for (const raw of name.split(/[^a-z]+/)) {
    if (raw.length < 3 || STOP_WORDS.has(raw)) continue;
    out.add(singular(raw));
  }
  return out;
}

function intersects(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const v of a) if (b.has(v)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// food_properties
// ---------------------------------------------------------------------------

const clean = (value: string | null | undefined): string | null => {
  const k = nameKey(value);
  return k ? k : null;
};

function propSet(...values: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const v of values) {
    const k = clean(v);
    if (k) out.add(k);
  }
  return out;
}

/** flavor_profile arrives as text[] or, from some paths, as '{a,b}' / 'a, b'. */
function flavorSet(value: FoodPropsLite["flavor_profile"]): Set<string> {
  if (Array.isArray(value)) return propSet(...value);
  if (typeof value === "string") return propSet(...value.split(/[{},;]+/));
  return new Set();
}

function complexityOf(value: FoodPropsLite["visual_complexity"]): string | number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const k = clean(value ?? null);
  if (k === null) return null;
  const n = Number(k);
  return Number.isFinite(n) ? n : k;
}

function similarComplexity(a: string | number, b: string | number): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1;
  return String(a) === String(b);
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

interface Profile {
  id: string;
  name: string;
  key: string;
  category: string | null;
  words: Set<string>;
  lexTexture: Set<string>;
  lexColor: Set<string>;
  lexShape: Set<string>;
  lexTaste: Set<string>;
  props: FoodPropsLite | null;
}

function profileOf(food: Pick<Food, "id" | "name" | "category">, props?: ReadonlyMap<string, FoodPropsLite>): Profile {
  const key = nameKey(food.name);
  return {
    id: food.id,
    name: food.name,
    key,
    category: clean(food.category ?? null),
    words: contentWords(key),
    lexTexture: lexiconTags(key, TEXTURES),
    lexColor: lexiconTags(key, COLORS),
    lexShape: lexiconTags(key, SHAPES),
    lexTaste: lexiconTags(key, TASTES),
    props: props?.get(food.id) ?? null,
  };
}

/**
 * A dimension matches on the property rows when both foods have that field,
 * and on the name lexicon otherwise. Properties win when present, because a
 * parent or seed wrote them for this food; the lexicon is only a guess.
 */
function dimensionMatch(propsA: Set<string>, propsB: Set<string>, lexA: Set<string>, lexB: Set<string>): boolean {
  if (propsA.size > 0 && propsB.size > 0) return intersects(propsA, propsB);
  return intersects(lexA, lexB);
}

function scorePair(anchor: Profile, cand: Profile): { score: number; reasons: ReasonKey[] } {
  const reasons = new Set<ReasonKey>();
  let score = 0;
  const pa = anchor.props;
  const pc = cand.props;

  // Texture: only texture_primary counts from properties; a shared secondary
  // texture is too weak to call the step small.
  const texA = propSet(pa?.texture_primary);
  const texC = propSet(pc?.texture_primary);
  if (dimensionMatch(texA, texC, anchor.lexTexture, cand.lexTexture)) {
    score += WEIGHTS.texture;
    reasons.add("texture");
  }

  if (dimensionMatch(flavorSet(pa?.flavor_profile), flavorSet(pc?.flavor_profile), anchor.lexTaste, cand.lexTaste)) {
    score += WEIGHTS.taste;
    reasons.add("taste");
  }

  const colA = propSet(pa?.color_primary, pa?.color_secondary);
  const colC = propSet(pc?.color_primary, pc?.color_secondary);
  if (dimensionMatch(colA, colC, anchor.lexColor, cand.lexColor)) {
    score += WEIGHTS.color;
    reasons.add("color");
  }

  const cxA = complexityOf(pa?.visual_complexity);
  const cxC = complexityOf(pc?.visual_complexity);
  const shapeMatch =
    cxA !== null && cxC !== null
      ? similarComplexity(cxA, cxC)
      : intersects(anchor.lexShape, cand.lexShape);
  if (shapeMatch) {
    score += WEIGHTS.shape;
    reasons.add("shape");
  }

  // Type: the properties' food_category when both have one, else the
  // household Food.category.
  const catA = clean(pa?.food_category ?? null);
  const catC = clean(pc?.food_category ?? null);
  const sameCategory = catA && catC ? catA === catC : anchor.category !== null && anchor.category === cand.category;
  if (sameCategory) {
    score += WEIGHTS.category;
    reasons.add("type");
  }

  if (intersects(anchor.words, cand.words)) {
    score += WEIGHTS.sharedWord;
    reasons.add("type");
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: REASON_ORDER.filter((r) => reasons.has(r)),
  };
}

const byScoreThenId = (a: ScoredChainSuggestion, b: ScoredChainSuggestion): number =>
  b.similarityScore - a.similarityScore || (a.foodId < b.foodId ? -1 : a.foodId > b.foodId ? 1 : 0);

/**
 * Pantry foods that are a small step from `anchor`, 0-100, highest first.
 * Foods under CHAIN_SCORE_THRESHOLD are left out, as is the anchor itself (by
 * id, or a duplicate row with the same name). Ties go to the lower food id so
 * the list is the same on every render. At most CHAIN_PANTRY_SCAN_CAP pantry
 * rows are scanned.
 */
export function scoreChainCandidates(
  anchor: Food,
  pantry: readonly Food[],
  props?: ReadonlyMap<string, FoodPropsLite>,
): ScoredChainSuggestion[] {
  const a = profileOf(anchor, props);
  const out: ScoredChainSuggestion[] = [];
  const seen = new Set<string>();
  const limit = Math.min(pantry.length, CHAIN_PANTRY_SCAN_CAP);
  for (let i = 0; i < limit; i++) {
    const food = pantry[i];
    if (!food?.id || food.id === anchor.id || seen.has(food.id)) continue;
    seen.add(food.id);
    const c = profileOf(food, props);
    if (!c.key || c.key === a.key) continue;
    const { score, reasons } = scorePair(a, c);
    if (score < CHAIN_SCORE_THRESHOLD) continue;
    out.push({ foodId: food.id, foodName: food.name, similarityScore: score, reasons });
  }
  return out.sort(byScoreThenId);
}

const LEGACY_REASONS: Record<string, ReasonKey> = {
  similar_texture: "texture",
  similar_flavor: "taste",
  similar_taste: "taste",
  same_category: "type",
  similar_color: "color",
  similar_shape: "shape",
  taste: "taste",
  texture: "texture",
  color: "color",
  shape: "shape",
  type: "type",
};

/** Map a server chain_reason to a ReasonKey; anything unrecognised is null. */
export function normalizeReason(raw: string): ReasonKey | null {
  return LEGACY_REASONS[nameKey(raw)] ?? null;
}

/**
 * Union of the client scorer's output and get_food_chain_suggestions rows, by
 * food id. The higher score wins, reasons are unioned (unknown server reasons
 * are dropped), and the result is sorted like scoreChainCandidates.
 */
export function mergeRpcSuggestions(
  client: ScoredChainSuggestion[],
  rpcRows: readonly {
    food_id: string;
    food_name: string;
    similarity_score: number | null;
    reasons: string[] | null;
  }[],
): ScoredChainSuggestion[] {
  const byId = new Map<string, { foodName: string; score: number; reasons: Set<ReasonKey> }>();
  for (const s of client) {
    const prev = byId.get(s.foodId);
    if (prev) {
      prev.score = Math.max(prev.score, s.similarityScore);
      for (const r of s.reasons) prev.reasons.add(r);
    } else {
      byId.set(s.foodId, { foodName: s.foodName, score: s.similarityScore, reasons: new Set(s.reasons) });
    }
  }
  for (const row of rpcRows) {
    if (!row?.food_id) continue;
    const raw = Number(row.similarity_score ?? 0);
    const score = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;
    const reasons: ReasonKey[] = [];
    for (const r of row.reasons ?? []) {
      const k = typeof r === "string" ? normalizeReason(r) : null;
      if (k) reasons.push(k);
    }
    const prev = byId.get(row.food_id);
    if (prev) {
      prev.score = Math.max(prev.score, score);
      for (const r of reasons) prev.reasons.add(r);
      if (!prev.foodName && row.food_name) prev.foodName = row.food_name;
    } else {
      byId.set(row.food_id, { foodName: row.food_name ?? "", score, reasons: new Set(reasons) });
    }
  }
  const out: ScoredChainSuggestion[] = [];
  for (const [foodId, v] of byId) {
    out.push({
      foodId,
      foodName: v.foodName,
      similarityScore: v.score,
      reasons: REASON_ORDER.filter((r) => v.reasons.has(r)),
    });
  }
  return out.sort(byScoreThenId);
}

/** How big a step a score is, for the "small step" / "bigger step" label. */
export function closenessLevel(score: number): Closeness {
  if (score >= 70) return "small";
  if (score >= 50) return "medium";
  return "big";
}
