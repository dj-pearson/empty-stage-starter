import { z } from 'zod';
import type { Food, FoodCategory, Kid } from '@/types';
import type { GroceryAddInput } from '@/lib/groceryMerge';
import { ingredientMatchKey } from '@/lib/groceryMerge';
import { findAllergenConflicts, type AllergenConflict } from '@/lib/kidFit';

/**
 * The boundary between an edge function (or a paste) and the grocery list.
 *
 * parse-grocery-image and parse-recipe-grocery are model output. A row can
 * arrive with a number for a name, "two" for a quantity or "beverage" for a
 * category, and the code this replaces trusted all of it (`item.quantity || 1`
 * on an `any`). One schema, shared by the import tab and the recipe import, so
 * both drop and repair rows the same way.
 */

export const GROCERY_CATEGORIES = [
  'protein',
  'carb',
  'dairy',
  'fruit',
  'vegetable',
  'snack',
] as const satisfies readonly FoodCategory[];

/**
 * One parsed row. `name` is the only field that can reject a row: an item with
 * no name cannot go on a list. Everything else is repaired with `.catch`, so a
 * garbled quantity becomes 1 rather than costing the parent the whole item.
 */
export const parsedGroceryItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.coerce.number().finite().positive().catch(1),
  unit: z.string().trim().max(24).catch(''),
  category: z.enum(GROCERY_CATEGORIES).catch('snack'),
});

export type ParsedGroceryRow = z.infer<typeof parsedGroceryItemSchema>;

/** A recipe ingredient: a grocery row plus the note the parser may attach. */
export const parsedIngredientSchema = parsedGroceryItemSchema.extend({
  notes: z.string().trim().max(500).optional().catch(undefined),
});

export type ParsedIngredientRow = z.infer<typeof parsedIngredientSchema>;

export interface SafeRows<T> {
  items: T[];
  /** Rows the schema refused, so the UI can say "2 lines could not be read". */
  dropped: number;
}

/** Validate each row on its own, keeping the good ones and counting the rest. */
export function safeParseRows<S extends z.ZodTypeAny>(schema: S, raw: unknown): SafeRows<z.output<S>> {
  if (!Array.isArray(raw)) return { items: [], dropped: 0 };
  const items: z.output<S>[] = [];
  let dropped = 0;
  for (const row of raw) {
    const parsed = schema.safeParse(row);
    if (parsed.success) items.push(parsed.data);
    else dropped++;
  }
  return { items, dropped };
}

/** parse-grocery-image: `{ items: [...] }`. */
export function parseGroceryImagePayload(data: unknown): SafeRows<ParsedGroceryRow> {
  const shape = z.object({ items: z.array(z.unknown()) }).safeParse(data);
  if (!shape.success) return { items: [], dropped: 0 };
  return safeParseRows(parsedGroceryItemSchema, shape.data.items);
}

export interface ParsedRecipePayload {
  title: string;
  servings?: number;
  ingredients: ParsedIngredientRow[];
  dropped: number;
}

const recipeEnvelopeSchema = z.object({
  error: z.string().optional(),
  recipe: z
    .object({
      title: z.string().trim().min(1).max(200).catch(''),
      servings: z.coerce.number().finite().positive().optional().catch(undefined),
      ingredients: z.array(z.unknown()).catch([]),
    })
    .optional(),
});

/**
 * parse-recipe-grocery: `{ recipe: { title, servings, ingredients } }` or
 * `{ error }`. Returns the error string when the function reported one, null
 * when the payload holds no recipe at all.
 */
export function parseRecipePayload(data: unknown): { recipe: ParsedRecipePayload | null; error: string | null } {
  const envelope = recipeEnvelopeSchema.safeParse(data);
  if (!envelope.success) return { recipe: null, error: null };
  if (envelope.data.error) return { recipe: null, error: envelope.data.error };
  const recipe = envelope.data.recipe;
  if (!recipe) return { recipe: null, error: null };
  const { items, dropped } = safeParseRows(parsedIngredientSchema, recipe.ingredients);
  return {
    recipe: { title: recipe.title, servings: recipe.servings, ingredients: items, dropped },
    error: null,
  };
}

/** A parsed row as a grocery add, tagged with where it came from. */
export function toGroceryAddInput(
  row: Pick<ParsedGroceryRow, 'name' | 'quantity' | 'unit' | 'category'> & { notes?: string },
  extra: Partial<GroceryAddInput> = {},
): GroceryAddInput {
  return {
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    category: row.category,
    ...(row.notes ? { notes: row.notes } : {}),
    ...extra,
  };
}

/**
 * The pantry food a typed or parsed name stands for, or undefined.
 *
 * Matches on ingredientMatchKey (lowercased, singular, qualifiers and units
 * stripped) so "2 lbs Peanuts" and "peanut" meet, and nothing looser: a
 * substring match would flag eggplant for an egg allergy.
 */
export function matchPantryFood(name: string, foods: readonly Food[]): Food | undefined {
  const key = ingredientMatchKey(name);
  if (!key) return undefined;
  return foods.find((food) => ingredientMatchKey(food.name) === key);
}

/**
 * Allergen conflicts for each name, by index. A name that resolves to no
 * pantry food has no entry: its allergens are unknown, which is not a hit.
 */
export function allergenConflictsForNames<K extends Pick<Kid, 'id' | 'allergens'>>(
  names: readonly string[],
  foods: readonly Food[],
  kids: readonly K[],
): Map<number, AllergenConflict<K>[]> {
  const out = new Map<number, AllergenConflict<K>[]>();
  if (kids.length === 0 || foods.length === 0) return out;
  const foodById = new Map(foods.map((food) => [food.id, food]));
  names.forEach((name, index) => {
    const food = matchPantryFood(name, foods);
    if (!food) return;
    const conflicts = findAllergenConflicts(kids, [food.id], foodById);
    if (conflicts.length > 0) out.set(index, conflicts);
  });
  return out;
}

/** "Ava: peanut, Sam: milk" for a warning line. */
export function describeConflicts(
  conflicts: ReadonlyArray<{ kid: { name?: string }; allergen: string }>,
): string {
  return conflicts.map((c) => (c.kid.name ? `${c.kid.name}: ${c.allergen}` : c.allergen)).join(', ');
}
