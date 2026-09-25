/**
 * Response parsing for three AI features whose handlers never got model output:
 * suggest-foods, calculate-food-similarity (food chains) and
 * suggest-recipes-from-pantry. identify-food-image's parser lives here too:
 * that handler did get output, but JSON.parse'd the whole reply after
 * stripping fences, so any prose around the object failed the request.
 *
 * Each one called AIServiceV2.generateContent(prompt, { systemPrompt, taskType })
 * and treated the result as a string. generateContent takes an AIRequest
 * ({ messages, ... }) plus a taskType and resolves to an AIResponse
 * ({ content, model, usage }), so every attempt threw. The handlers now build
 * the request with buildChatRequest and hand AIResponse.content to the parsers
 * here, which return null (or an empty list, where the handler already treated
 * "no chains" as a normal answer) instead of throwing on output they cannot use.
 *
 * Pure: no Deno globals, no network, only the pure modelJson.ts import.
 * Vitest mirror: src/lib/aiSuggestionParsers.test.ts.
 */
import { extractJsonArray, extractJsonObject, isJsonRecord } from './modelJson.ts';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter((s) => s !== '');
}

// ---------------------------------------------------------------- suggest-foods

export const FOOD_SUGGESTION_CATEGORIES = ['protein', 'carb', 'fruit', 'vegetable', 'dairy', 'snack'] as const;
export type FoodSuggestionCategory = (typeof FOOD_SUGGESTION_CATEGORIES)[number];

export interface FoodSuggestion {
  name: string;
  category: FoodSuggestionCategory;
  reason: string;
}

/**
 * The prompt asks for { "suggestions": [{ name, category, reason }] }. Entries
 * without a name are dropped; a category outside the six the client renders
 * becomes "snack". Null when there is no usable suggestion, so the handler
 * serves its default list.
 */
export function parseFoodSuggestions(content: unknown): FoodSuggestion[] | null {
  const obj = extractJsonObject(content);
  // A bare array is accepted too; models sometimes drop the wrapper.
  const raw = obj && Array.isArray(obj.suggestions) ? obj.suggestions : extractJsonArray(content);
  if (!Array.isArray(raw)) return null;

  const out: FoodSuggestion[] = [];
  for (const entry of raw) {
    if (!isJsonRecord(entry)) continue;
    const name = text(entry.name);
    if (!name) continue;
    const category = text(entry.category).toLowerCase();
    out.push({
      name,
      category: (FOOD_SUGGESTION_CATEGORIES as readonly string[]).includes(category)
        ? (category as FoodSuggestionCategory)
        : 'snack',
      reason: text(entry.reason),
    });
  }
  return out.length > 0 ? out : null;
}

// ---------------------------------------------------- calculate-food-similarity

export interface FoodChain {
  chain_name: string;
  steps: string[];
  rationale: string;
}

/**
 * The prompt asks for { "chains": [{ chain_name, steps, rationale }] }. A chain
 * with no steps is dropped. Anything unusable is an empty list, which is what
 * the handler already returns when the model is unavailable.
 */
export function parseFoodChains(content: unknown): FoodChain[] {
  const obj = extractJsonObject(content);
  if (!obj || !Array.isArray(obj.chains)) return [];

  const out: FoodChain[] = [];
  for (const entry of obj.chains) {
    if (!isJsonRecord(entry)) continue;
    const steps = textList(entry.steps);
    if (steps.length === 0) continue;
    out.push({
      chain_name: text(entry.chain_name) || 'Food chain',
      steps,
      rationale: text(entry.rationale),
    });
  }
  return out;
}

// -------------------------------------------------- suggest-recipes-from-pantry

export interface PantryRecipeSuggestion {
  name: string;
  description: string;
  food_names: string[];
  reason: string;
  difficulty: string;
  prepTime: string;
  cookTime: string;
}

/**
 * The prompt asks for a bare JSON array of recipes. Entries without a name are
 * dropped and non-string food names are ignored, so the id lookup that follows
 * cannot throw on a malformed entry. Null when nothing usable came back; the
 * handler answers that with its "Failed to parse AI response" 500.
 */
export function parsePantryRecipeSuggestions(content: unknown): PantryRecipeSuggestion[] | null {
  const raw = extractJsonArray(content);
  if (!raw) return null;

  const out: PantryRecipeSuggestion[] = [];
  for (const entry of raw) {
    if (!isJsonRecord(entry)) continue;
    const name = text(entry.name);
    if (!name) continue;
    out.push({
      name,
      description: text(entry.description),
      food_names: textList(entry.food_names),
      reason: text(entry.reason),
      difficulty: text(entry.difficulty) || 'easy',
      prepTime: text(entry.prepTime),
      cookTime: text(entry.cookTime),
    });
  }
  return out.length > 0 ? out : null;
}

/** Ids of the pantry foods a suggestion names, matched case-insensitively. */
export function matchPantryFoodIds(
  foodNames: readonly string[],
  pantryFoods: readonly { id?: unknown; name?: unknown }[],
): string[] {
  const ids: string[] = [];
  for (const wanted of foodNames) {
    const key = wanted.toLowerCase();
    const food = pantryFoods.find((f) => typeof f.name === 'string' && f.name.toLowerCase() === key);
    if (food && typeof food.id === 'string') ids.push(food.id);
  }
  return ids;
}

// ------------------------------------------------------------ identify-food-image

export interface FoodIdentification {
  name: string;
  variety: string;
  varietyOptions: string[];
  category: FoodSuggestionCategory;
  confidence: number;
  description: string;
  servingSize: string;
  quantity: number;
  servingSizeOptions: string[];
}

/** A finite number from a number or a numeric string ("85", "85%"), else null. */
function numberFrom(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number.parseFloat(value.replace('%', '').trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * The prompt asks for one object: { name, variety, varietyOptions, category,
 * confidence, description, servingSize, quantity, servingSizeOptions }.
 * ImageFoodCapture renders every field and Pantry writes name, category,
 * quantity and servingSize to the foods table, so each is normalized here:
 * category outside the six becomes "snack", confidence is clamped to a whole
 * 0-100 (a 0-1 fraction is scaled up), quantity is a whole number of at least
 * 1. Null when there is no object with a name, which the handler answers with
 * its generic 500 instead of a bare JSON.parse failure.
 */
export function parseFoodIdentification(content: unknown): FoodIdentification | null {
  const obj = extractJsonObject(content);
  if (!obj) return null;
  const name = text(obj.name);
  if (!name) return null;

  const category = text(obj.category).toLowerCase();

  let confidence = numberFrom(obj.confidence) ?? 0;
  if (confidence > 0 && confidence < 1) confidence *= 100;
  confidence = Math.round(Math.min(100, Math.max(0, confidence)));

  const quantity = Math.max(1, Math.round(numberFrom(obj.quantity) ?? 1));

  return {
    name,
    variety: text(obj.variety),
    varietyOptions: textList(obj.varietyOptions),
    category: (FOOD_SUGGESTION_CATEGORIES as readonly string[]).includes(category)
      ? (category as FoodSuggestionCategory)
      : 'snack',
    confidence,
    description: text(obj.description),
    servingSize: text(obj.servingSize),
    quantity,
    servingSizeOptions: textList(obj.servingSizeOptions),
  };
}
