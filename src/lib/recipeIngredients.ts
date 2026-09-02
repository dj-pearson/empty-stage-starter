import type { Food, IngredientRowPayload, Recipe, RecipeIngredient } from '@/types';
import { parseGroceryText } from './parse-grocery-text';

/**
 * Structured recipe ingredients (US-721).
 *
 * The web builder collected a quantity and a unit for every ingredient and then
 * threw both away: linked ingredients were reduced to a `food_ids` uuid array,
 * and unlinked ones were flattened into one comma-joined
 * `additional_ingredients` string. recipe_ingredients (US-265) has had columns
 * for all of it since April and the web client never wrote a row, so scaling,
 * shortfall and recipe-aware grocery generation had nothing to work from.
 *
 * These are the pure transforms. Everything here is total: a draft with a blank
 * name is dropped rather than written as an empty row.
 */

/** One row as the builder holds it, before it becomes a database row. */
export interface IngredientDraft {
  /** Client-side row key. Stable across a single editing session. */
  id: string;
  /** recipe_ingredients.id when this draft came from a saved row. */
  rowId?: string | null;
  food_id?: string | null;
  name: string;
  quantity: string;
  unit: string;
  prepNotes: string;
  isOptional: boolean;
  section?: string;
}

/** Re-exported for callers that already import from this module. */
export type { IngredientRowPayload };

export interface IngredientDiff {
  inserts: IngredientRowPayload[];
  updates: IngredientRowPayload[];
  deleteIds: string[];
}

/**
 * "1 1/2", "1.5", "½" and "2" all mean a number. Anything that is not a
 * quantity at all ("a pinch") becomes null rather than NaN, which would be
 * written to a numeric column as an error.
 */
export function parseIngredientQuantity(value: string | null | undefined): number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;

  const VULGAR: Record<string, number> = {
    '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3,
    '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
  };

  let total = 0;
  let matched = false;

  const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/);
  if (mixed) {
    const denom = Number(mixed[3]);
    if (denom !== 0) {
      total = Number(mixed[1]) + Number(mixed[2]) / denom;
      matched = true;
    }
  }

  if (!matched) {
    const fraction = text.match(/^(\d+)\s*\/\s*(\d+)/);
    if (fraction) {
      const denom = Number(fraction[2]);
      if (denom !== 0) {
        total = Number(fraction[1]) / denom;
        matched = true;
      }
    }
  }

  if (!matched) {
    const whole = text.match(/^(\d+(?:\.\d+)?)/);
    if (whole) {
      total = Number(whole[1]);
      matched = true;
    }
  }

  // A leading or trailing vulgar fraction, with or without a whole part.
  for (const [glyph, value_] of Object.entries(VULGAR)) {
    if (text.includes(glyph)) {
      total += value_;
      matched = true;
      break;
    }
  }

  if (!matched || !Number.isFinite(total)) return null;
  return total;
}

const clean = (value: string | null | undefined): string | null => {
  const text = (value ?? '').trim();
  return text ? text : null;
};

/**
 * Turn the builder's rows into database payloads.
 *
 * Optionality has no column of its own, so it is folded into optional_notes --
 * the one free-text field the table has - rather than silently dropped.
 */
export function toIngredientPayloads(drafts: IngredientDraft[]): IngredientRowPayload[] {
  const payloads: IngredientRowPayload[] = [];

  drafts.forEach((draft) => {
    const name = (draft.name ?? '').trim();
    if (!name) return; // a blank row is not an ingredient

    const notes = clean(draft.prepNotes);
    const optional_notes = draft.isOptional
      ? notes
        ? `${notes} (optional)`
        : 'optional'
      : notes;

    payloads.push({
      ...(draft.rowId ? { id: draft.rowId } : {}),
      food_id: draft.food_id ?? null,
      sort_order: payloads.length,
      name,
      quantity: parseIngredientQuantity(draft.quantity),
      unit: clean(draft.unit),
      group_label: clean(draft.section),
      optional_notes,
    });
  });

  return payloads;
}

/**
 * What changed between the saved rows and the edited ones.
 *
 * Diffing by id rather than delete-all-and-reinsert keeps recipe_ingredients.id
 * stable, which matters because recipe_components (US-612) and the plating work
 * point at those ids: a delete-all would orphan every reference on each save.
 */
export function diffIngredientRows(
  existing: Array<Pick<RecipeIngredient, 'id'>>,
  next: IngredientRowPayload[],
): IngredientDiff {
  const nextIds = new Set(next.map((row) => row.id).filter(Boolean) as string[]);

  return {
    inserts: next.filter((row) => !row.id),
    updates: next.filter((row) => Boolean(row.id)),
    deleteIds: existing.map((row) => row.id).filter((id) => !nextIds.has(id)),
  };
}

/**
 * The display string for recipes.additional_ingredients.
 *
 * DERIVED, never the source of truth (AC 3). It is still written because
 * shipped iOS builds read it, and it is rebuilt from the rows on every save so
 * the two cannot drift.
 */
export function buildAdditionalIngredientsDisplay(drafts: IngredientDraft[]): string {
  return drafts
    .filter((draft) => (draft.name ?? '').trim() && !draft.food_id)
    .map((draft) => {
      const quantity = (draft.quantity ?? '').trim();
      const unit = (draft.unit ?? '').trim();
      let text = [quantity, unit, draft.name.trim()].filter(Boolean).join(' ');
      const notes = (draft.prepNotes ?? '').trim();
      if (notes) text += ` (${notes})`;
      if (draft.isOptional) text += ' [optional]';
      return text;
    })
    .join(', ');
}

let draftCounter = 0;
const draftKey = () => `draft-${++draftCounter}`;

/**
 * Seed the builder's rows for an existing recipe, in preference order:
 *
 *   1. recipe_ingredients   -- the real rows, with quantity and unit
 *   2. food_ids             -- a legacy recipe saved before US-721
 *   3. additional_ingredients -- parsed through parseGroceryText, so a recipe
 *      that only ever had the free-text blob becomes structured on first edit
 *
 * Falling back to food_ids when rows EXIST would silently drop every quantity,
 * so the order matters and is asserted by a test.
 */
export function draftsFromRecipe(
  recipe: Pick<Recipe, 'food_ids' | 'recipe_ingredients' | 'additionalIngredients'> | null | undefined,
  foods: Array<Pick<Food, 'id' | 'name'>>,
): IngredientDraft[] {
  if (!recipe) return [];

  const rows = recipe.recipe_ingredients ?? [];
  if (rows.length > 0) {
    return [...rows]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((row) => {
        const notes = row.optional_notes ?? '';
        const isOptional = /\boptional\b/i.test(notes);
        const prepNotes = notes
          .replace(/\s*\(optional\)\s*$/i, '')
          .replace(/^optional$/i, '')
          .trim();
        return {
          id: draftKey(),
          rowId: row.id,
          food_id: row.food_id ?? null,
          name: row.name,
          quantity: row.quantity != null ? String(row.quantity) : '',
          unit: row.unit ?? '',
          prepNotes,
          isOptional,
          section: row.group_label ?? undefined,
        };
      });
  }

  if (recipe.food_ids && recipe.food_ids.length > 0) {
    return recipe.food_ids.map((foodId) => ({
      id: draftKey(),
      rowId: null,
      food_id: foodId,
      name: foods.find((f) => f.id === foodId)?.name ?? 'Unknown',
      quantity: '',
      unit: '',
      prepNotes: '',
      isOptional: false,
    }));
  }

  const blob = (recipe.additionalIngredients ?? '').trim();
  if (blob) {
    // The old builder joined these with ", ", and parseGroceryText splits on
    // newlines and bullets only -- deliberately, so "beef, ground" survives as
    // one grocery item. Splitting here is the cost of reading that format back:
    // a name containing a comma becomes two rows. That is recoverable in the
    // editor the user is already looking at, and strictly better than one
    // 200-character pseudo-ingredient.
    return blob
      .split(/\s*,\s*/)
      .map((piece) => piece.trim())
      .filter(Boolean)
      .flatMap((piece) => parseGroceryText(piece))
      .map((item) => ({
        id: draftKey(),
        rowId: null,
        food_id: null,
        name: item.name,
        quantity: item.quantity != null ? String(item.quantity) : '',
        unit: item.unit ?? '',
        prepNotes: '',
        isOptional: false,
      }));
  }

  return [];
}
