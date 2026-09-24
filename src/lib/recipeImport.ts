/**
 * The boundary between an imported recipe (pasted JSON, or what the parse
 * edge functions return) and a Recipe we are willing to save.
 *
 * Nothing past this point trusts the input's shape: every field is coerced or
 * dropped here, so a model that answers `difficulty: "Moderate"` or
 * `tags: "dinner, quick"` or a JSON file with `source_url: "javascript:..."`
 * cannot put a value in the database that the CHECK constraints reject or
 * that renders as a live script link.
 *
 * Pure: no React, no Supabase.
 */
import { z } from "zod";
import type { Food, Recipe } from "@/types";
import { parseDurationMinutes } from "./recipeFilters";
import { matchIngredientToFood } from "./ingredientMatch";
import {
  buildAdditionalIngredientsDisplay,
  toIngredientPayloads,
  type IngredientDraft,
} from "./recipeIngredients";
import { toSafeHttpUrl } from "./recipeUrl";

/** Which import path produced the recipe. It decides source_type, not the input. */
export type ImportPath = "url" | "photo" | "text" | "json";

const SOURCE_TYPE: Record<ImportPath, NonNullable<Recipe["source_type"]>> = {
  url: "website",
  photo: "photo",
  text: "imported",
  json: "imported",
};

const optString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .optional()
  .nullable()
  .catch(undefined);

const tagsSchema = z
  .unknown()
  .transform((v): string[] => {
    const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
    const out: string[] = [];
    for (const item of list) {
      if (typeof item !== "string" && typeof item !== "number") continue;
      const tag = String(item).trim();
      if (tag && !out.includes(tag)) out.push(tag);
    }
    return out;
  });

const optNumber = z.coerce.number().finite().nonnegative().optional().catch(undefined);

const nutritionSchema = z
  .object({
    calories: optNumber,
    protein_g: optNumber,
    carbs_g: optNumber,
    fat_g: optNumber,
    fiber_g: optNumber,
    calcium_mg: optNumber,
    iron_mg: optNumber,
  })
  .optional()
  .catch(undefined);

const ingredientObject = z.object({
  name: z.string(),
  quantity: optString,
  unit: optString,
  notes: optString,
});

export const importedRecipeSchema = z.object({
  name: optString,
  title: optString,
  description: optString,
  ingredients: z.array(z.unknown()).catch([]).default([]),
  instructions: z
    .union([z.string(), z.array(z.union([z.string(), z.number()]))])
    .optional()
    .catch(undefined),
  prepTime: optString,
  prep_time: optString,
  cookTime: optString,
  cook_time: optString,
  total_time: optString,
  totalTime: optString,
  total_time_minutes: optString,
  servings: optString,
  difficulty_level: optString,
  difficulty: optString,
  tags: tagsSchema.optional(),
  image_url: optString,
  imageUrl: optString,
  image: optString,
  source_url: optString,
  sourceUrl: optString,
  tips: optString,
  additionalIngredients: optString,
  nutrition_info: nutritionSchema,
  nutrition: nutritionSchema,
});

export type ImportedRecipeInput = z.infer<typeof importedRecipeSchema>;

const DIFFICULTY_ALIASES: Record<string, NonNullable<Recipe["difficulty_level"]>> = {
  easy: "easy",
  simple: "easy",
  beginner: "easy",
  medium: "medium",
  moderate: "medium",
  intermediate: "medium",
  hard: "hard",
  difficult: "hard",
  advanced: "hard",
};

export function coerceDifficulty(value: unknown): Recipe["difficulty_level"] | undefined {
  if (typeof value !== "string") return undefined;
  return DIFFICULTY_ALIASES[value.trim().toLowerCase()];
}

function toSteps(instructions: ImportedRecipeInput["instructions"]): string {
  if (instructions == null) return "";
  const lines = Array.isArray(instructions) ? instructions.map(String) : instructions.split(/\n/);
  const steps = lines.map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim()).filter((s) => s.length > 0);
  return steps.length > 0 ? JSON.stringify(steps) : "";
}

/** "2 cups flour" -> { quantity: "2", unit: "cups", name: "flour" }. Anything else stays the name. */
const LEADING_QTY = /^\s*(\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+)\s*([a-zA-Z]+\.?)?\s+(.+)$/;
const UNIT_WORDS = new Set([
  "cup", "cups", "c", "tbsp", "tbs", "tablespoon", "tablespoons", "tsp", "teaspoon", "teaspoons",
  "oz", "ounce", "ounces", "lb", "lbs", "pound", "pounds", "g", "gram", "grams", "kg", "ml", "l",
  "liter", "liters", "litre", "litres", "clove", "cloves", "can", "cans", "slice", "slices",
  "pinch", "dash", "stick", "sticks", "package", "packages", "pkg", "bunch", "handful",
]);

function draftFromString(line: string, index: number): IngredientDraft {
  const text = line.trim();
  const m = text.match(LEADING_QTY);
  let quantity = "";
  let unit = "";
  let name = text;
  if (m) {
    quantity = m[1].trim();
    const maybeUnit = (m[2] ?? "").replace(/\.$/, "");
    if (maybeUnit && UNIT_WORDS.has(maybeUnit.toLowerCase())) {
      unit = maybeUnit;
      name = m[3].trim();
    } else {
      name = `${m[2] ? `${m[2]} ` : ""}${m[3]}`.trim();
    }
  }
  return { id: `import-${index}`, name, quantity, unit, prepNotes: "", isOptional: false };
}

/** Build the ingredient drafts, linking each to at most one known food. */
export function importedIngredientDrafts(
  ingredients: readonly unknown[],
  foods: ReadonlyArray<Pick<Food, "id" | "name">>,
): IngredientDraft[] {
  const drafts: IngredientDraft[] = [];
  ingredients.forEach((raw, index) => {
    let draft: IngredientDraft | null = null;
    if (typeof raw === "string") {
      if (raw.trim()) draft = draftFromString(raw, index);
    } else {
      const parsed = ingredientObject.safeParse(raw);
      if (parsed.success && parsed.data.name.trim()) {
        draft = {
          id: `import-${index}`,
          name: parsed.data.name.trim(),
          quantity: parsed.data.quantity ?? "",
          unit: parsed.data.unit ?? "",
          prepNotes: parsed.data.notes ?? "",
          isOptional: false,
        };
      }
    }
    if (!draft) return;
    const match = matchIngredientToFood(draft.name, foods);
    draft.food_id = match?.id ?? null;
    drafts.push(draft);
  });
  return drafts;
}

export class RecipeImportError extends Error {}

/**
 * Validate and map one imported recipe. Throws RecipeImportError with a
 * readable message when the input is not a recipe at all (not an object, or
 * no name).
 */
export function normalizeImportedRecipe(
  input: unknown,
  path: ImportPath,
  foods: ReadonlyArray<Pick<Food, "id" | "name">>,
  sourceUrl?: string,
): Omit<Recipe, "id"> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new RecipeImportError("That doesn't look like a recipe.");
  }
  const parsed = importedRecipeSchema.safeParse(input);
  if (!parsed.success) throw new RecipeImportError("That doesn't look like a recipe.");
  const r = parsed.data;

  const name = r.name || r.title || "";
  if (!name) throw new RecipeImportError("Recipe must have a name.");

  const drafts = importedIngredientDrafts(r.ingredients, foods);
  const foodIds = [...new Set(drafts.map((d) => d.food_id).filter((id): id is string => Boolean(id)))];
  const unmatchedDisplay = buildAdditionalIngredientsDisplay(drafts);

  const prepTime = r.prepTime || r.prep_time || "";
  const cookTime = r.cookTime || r.cook_time || "";
  const explicitTotal = parseDurationMinutes(r.total_time_minutes || r.total_time || r.totalTime || null);
  const prep = parseDurationMinutes(prepTime);
  const cook = parseDurationMinutes(cookTime);
  const summed = prep == null && cook == null ? null : (prep ?? 0) + (cook ?? 0);
  const total = explicitTotal && explicitTotal > 0 ? explicitTotal : summed && summed > 0 ? summed : undefined;

  const source = toSafeHttpUrl(sourceUrl || r.source_url || r.sourceUrl) || undefined;
  const image = toSafeHttpUrl(r.image_url || r.imageUrl || r.image) || undefined;
  const tags = r.tags && r.tags.length > 0 ? r.tags : undefined;
  const nutrition = r.nutrition_info ?? r.nutrition;

  const recipe: Omit<Recipe, "id"> = {
    name,
    description: r.description || undefined,
    food_ids: foodIds,
    instructions: toSteps(r.instructions),
    prepTime,
    cookTime,
    servings: r.servings || "",
    additionalIngredients: unmatchedDisplay || r.additionalIngredients || "",
    tips: r.tips || "",
    total_time_minutes: total !== undefined ? Math.round(total) : undefined,
    source_url: source,
    source_type: SOURCE_TYPE[path],
    image_url: image,
    difficulty_level: coerceDifficulty(r.difficulty_level ?? r.difficulty),
    tags,
    nutrition_info: nutrition && Object.values(nutrition).some((v) => v !== undefined) ? nutrition : undefined,
  };
  const rows = toIngredientPayloads(drafts);
  if (rows.length > 0) recipe.recipe_ingredient_rows = rows;
  return recipe;
}
