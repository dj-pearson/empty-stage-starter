/**
 * Link a free-text ingredient name ("2 large eggs, beaten" after parsing, or
 * just "eggs") to one of the household's foods.
 *
 * The import dialog used to link with substring containment both ways, so
 * "egg" linked Eggplant, "ham" linked Graham crackers, and "cheese" linked
 * every cheese in the pantry. This matches whole words only and returns at
 * most one food:
 *
 *   1. an exact match on the normalized name;
 *   2. otherwise, a food whose every word appears as a word in the ingredient
 *      (or the ingredient's every word appears in the food), with the longest
 *      food name winning, so "cheddar cheese" beats "cheese".
 *
 * A trailing plural "s"/"es" is folded so "eggs" matches "Egg". Empty or
 * missing names never match. Pure: no React, no Supabase.
 */

import type { Food } from "@/types";

export function normalizeIngredientName(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && /(ches|shes|xes|oes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 2 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokens(value: string | null | undefined): string[] {
  const n = normalizeIngredientName(value);
  return n ? n.split(" ").map(singular) : [];
}

const containsAll = (haystack: ReadonlySet<string>, needles: readonly string[]): boolean =>
  needles.length > 0 && needles.every((w) => haystack.has(w));

export function matchIngredientToFood<F extends Pick<Food, "id" | "name">>(
  name: string | null | undefined,
  foods: readonly F[],
): F | null {
  const target = tokens(name);
  if (target.length === 0) return null;
  const targetKey = target.join(" ");
  const targetSet = new Set(target);

  let best: F | null = null;
  let bestLen = -1;
  for (const food of foods) {
    const words = tokens(food.name);
    if (words.length === 0) continue;
    if (words.join(" ") === targetKey) return food;
    if (containsAll(targetSet, words) || containsAll(new Set(words), target)) {
      const len = normalizeIngredientName(food.name).length;
      if (len > bestLen) {
        best = food;
        bestLen = len;
      }
    }
  }
  return best;
}
