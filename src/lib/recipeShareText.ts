/**
 * A recipe as plain text, for a share sheet, the clipboard, SMS or print.
 *
 * There is no public recipe page to link to (the old /recipes/:id link was a
 * 404), so the text carries the recipe itself.
 */

import { formatQuantity } from "@/lib/groceryMerge";
import { sanitizeUrl } from "@/lib/sanitize";
import type { Food, Recipe } from "@/types";

function instructionLines(instructions: string | undefined): string[] {
  if (!instructions) return [];
  try {
    const parsed: unknown = JSON.parse(instructions);
    if (Array.isArray(parsed)) {
      return parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim());
    }
  } catch {
    // plain text
  }
  return instructions
    .split(/\r?\n/)
    .map((line) => line.replace(/^\d+[.)]\s*/, "").trim())
    .filter((line) => line.length > 0);
}

/** One line per ingredient: structured rows with amounts, else the linked foods by name. */
export function recipeIngredientLines(recipe: Recipe, foods: Food[]): string[] {
  const rows = (recipe.recipe_ingredients ?? [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  if (rows.length > 0) {
    return rows.map((r) => {
      const qty = typeof r.quantity === "number" && r.quantity > 0 ? formatQuantity(r.quantity) : "";
      return [qty, r.unit ?? "", r.name].filter(Boolean).join(" ");
    });
  }
  const byId = new Map(foods.map((f) => [f.id, f]));
  return (recipe.food_ids ?? [])
    .map((id) => byId.get(id)?.name)
    .filter((n): n is string => Boolean(n));
}

/**
 * A recipe source as a safe http(s) href, or null. Imports store whatever
 * the page gave them ("allrecipes.com/x", "javascript:..."), so this never
 * throws and never returns a non-http link.
 */
export function safeSourceHref(raw: string | undefined): string | null {
  const clean = sanitizeUrl(raw ?? "");
  if (!clean) return null;
  try {
    const url = new URL(clean);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Name, servings, ingredients, steps, tip and an http(s) source, one per line. */
export function buildRecipeShareText(recipe: Recipe, foods: Food[] = []): string {
  const lines: string[] = [recipe.name];
  if (recipe.description) lines.push(recipe.description);
  if (recipe.servings) lines.push(`Serves: ${recipe.servings}`);

  const ingredients = recipeIngredientLines(recipe, foods);
  if (ingredients.length > 0 || recipe.additionalIngredients) {
    lines.push("", "Ingredients:");
    for (const ing of ingredients) lines.push(`- ${ing}`);
    if (recipe.additionalIngredients) lines.push(`- ${recipe.additionalIngredients}`);
  }

  const steps = instructionLines(recipe.instructions);
  if (steps.length > 0) {
    lines.push("", "Steps:");
    steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  }

  if (recipe.tips) lines.push("", `Tip: ${recipe.tips}`);
  const source = safeSourceHref(recipe.source_url);
  if (source) lines.push("", `Source: ${source}`);
  return lines.join("\n");
}

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

/**
 * Native share sheet when there is one, the clipboard otherwise (or when the
 * share sheet fails for a reason other than the user closing it).
 */
export async function shareRecipe(recipe: Recipe, foods: Food[] = []): Promise<ShareOutcome> {
  const text = buildRecipeShareText(recipe, foods);
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: recipe.name, text });
      return "shared";
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled";
      // fall through to the clipboard
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
