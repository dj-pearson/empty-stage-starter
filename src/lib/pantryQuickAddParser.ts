import type { FoodCategory } from '@/types';
import { parseGroceryText, type ParsedGroceryItem } from './parse-grocery-text';
import { inferFoodNameDefault } from './foodNameDefaults';

/**
 * US-288: pantry quick-add line parser.
 *
 * Builds on `parseGroceryText` (which already handles the LEADING qty+unit
 * pattern — "2 lb chicken breast", "½ gallon milk") and extends it with:
 *
 *   - **Trailing** qty+unit:  "chicken 2 lb", "eggs 12 ct", "milk gal"
 *   - **Bare name** inference: "milk" → { qty: 1, unit: 'gal' } via the
 *     iOS-mirrored UnitInference catalog (see `foodNameDefaults`).
 *
 * `confidence` is a coarse signal:
 *   - 1.0  the input matched a leading-qty pattern (parseGroceryText hit)
 *   - 0.85 trailing qty+unit pattern (custom regex below)
 *   - 0.7  bare name + UnitInference catalog hit
 *   - 0.5  bare name with no catalog hit (fallback to qty=1, unit='')
 *
 * Used both by the inline single-line input and the bulk-paste textarea.
 */

export interface PantryQuickAddParse {
  name: string;
  quantity: number;
  unit: string;
  category: FoodCategory;
  /** Coarse signal for the live-preview chip + telemetry. */
  confidence: number;
}

const TRAILING_QTY_UNIT = /^(.+?)\s+(\d+(?:[./]\d+)?(?:\.\d+)?)\s*([a-zA-Z]{1,12})$/;
const TRAILING_BARE_UNIT = /^(.+?)\s+([a-zA-Z]{1,12})$/;

const VALID_TRAILING_UNITS = new Set([
  // Mass
  'g', 'gram', 'grams', 'kg', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds',
  // Volume
  'ml', 'l', 'liter', 'litre', 'tsp', 'tbsp', 'cup', 'cups', 'floz', 'pt', 'pint', 'qt', 'quart', 'gal', 'gallon',
  // Count / package
  'piece', 'pieces', 'pc', 'pcs', 'each', 'ea', 'count', 'ct', 'dozen', 'doz',
  'pack', 'pkg', 'package', 'bag', 'jar', 'bottle', 'btl', 'can', 'box', 'loaf', 'bunch',
  'head', 'roll', 'sleeve', 'tube', 'tray', 'carton', 'sachet', 'stick',
]);

function inferCategory(name: string, fallback?: FoodCategory): FoodCategory {
  if (fallback) return fallback;
  // Re-use the keyword classifier already in parseGroceryText by routing a
  // synthetic line through it. Cheap and avoids duplicating the keyword set.
  const synthetic = parseGroceryText(name);
  return synthetic[0]?.category ?? 'snack';
}

/**
 * Parse a single pantry quick-add line.
 *
 * Returns `null` on whitespace-only input. For everything else returns a
 * best-effort interpretation with a confidence score.
 */
export function parsePantryQuickAddLine(input: string): PantryQuickAddParse | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Tier 1: try the existing leading-qty+unit parser (highest-fidelity path).
  const leading = parseGroceryText(trimmed);
  if (leading.length > 0) {
    const first = leading[0]!;
    // We trust it iff it actually extracted both qty AND unit, OR if it found
    // a unit-less qty greater than 1 (e.g. "3 apples"). Bare names go through
    // tier 3 below for catalog inference.
    const hadExplicitNumber = /^\s*\d/.test(trimmed) || /^\s*[¼-¾⅐-⅞]/.test(trimmed);
    if (hadExplicitNumber || first.unit !== '') {
      return {
        name: first.name,
        quantity: first.quantity,
        unit: first.unit,
        category: first.category,
        confidence: first.unit ? 1.0 : 0.85,
      };
    }
  }

  // Tier 2: trailing qty+unit ("chicken 2 lb").
  const trailingMatch = TRAILING_QTY_UNIT.exec(trimmed);
  if (trailingMatch) {
    const [, rawName, rawQty, rawUnit] = trailingMatch;
    const unit = rawUnit.toLowerCase();
    if (VALID_TRAILING_UNITS.has(unit)) {
      const name = rawName.trim();
      const qty = parseTrailingQty(rawQty);
      return {
        name,
        quantity: qty,
        unit: rawUnit.trim().toLowerCase(),
        category: inferCategory(name),
        confidence: 0.85,
      };
    }
  }

  // Tier 2b: trailing BARE unit, no qty ("milk gal", "rice bag")
  const bareUnitMatch = TRAILING_BARE_UNIT.exec(trimmed);
  if (bareUnitMatch) {
    const [, rawName, rawUnit] = bareUnitMatch;
    const unit = rawUnit.toLowerCase();
    if (VALID_TRAILING_UNITS.has(unit)) {
      const name = rawName.trim();
      return {
        name,
        quantity: 1,
        unit,
        category: inferCategory(name),
        confidence: 0.8,
      };
    }
  }

  // Tier 3: bare name → consult UnitInference catalog for a sensible default.
  const def = inferFoodNameDefault(trimmed);
  if (def) {
    return {
      name: trimmed,
      quantity: def.quantity,
      unit: def.unit,
      category: inferCategory(trimmed, def.category),
      confidence: 0.7,
    };
  }

  // Tier 4: no qty / no unit / no catalog match. Single piece.
  return {
    name: trimmed,
    quantity: 1,
    unit: '',
    category: inferCategory(trimmed),
    confidence: 0.5,
  };
}

function parseTrailingQty(raw: string): number {
  // Handle simple "3" / "1.5" / "1/2".
  if (raw.includes('/')) {
    const [num, denom] = raw.split('/').map((s) => parseInt(s, 10));
    return denom > 0 ? num / denom : 1;
  }
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Parse a multi-line bulk paste. Each non-empty line is independently parsed
 * via `parsePantryQuickAddLine`.
 */
export function parsePantryQuickAddBulk(text: string): PantryQuickAddParse[] {
  if (!text || !text.trim()) return [];
  return text
    .split(/\n+/)
    .map((line) => parsePantryQuickAddLine(line))
    .filter((p): p is PantryQuickAddParse => p !== null);
}
