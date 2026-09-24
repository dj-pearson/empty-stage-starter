/**
 * US-294: pure receipt-parse normalisation helpers.
 *
 * These were inline functions in ScanReceiptDialog.tsx; extracting lets us
 * back the AC's "5 anonymized receipt JSON outputs + line-item count
 * assertions" with vitest without spinning up the dialog under jsdom.
 */
import type { Food, FoodCategory } from '@/types';
import { ACQUIRED_FOOD_IS_SAFE, ACQUIRED_FOOD_IS_TRY_BITE } from './foodSafetyDefault';

export interface ParsedLineItem {
  rawText: string;
  parsedName: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  category: string;
  confidence: number;
}

export interface ParseResponse {
  merchant: string | null;
  purchasedAt: string | null;
  currency: string;
  lineItems: ParsedLineItem[];
}

export interface ReviewRow extends ParsedLineItem {
  uid: string;
  accept: boolean;
  matchedFoodId: string | null;
  /**
   * The line and the pantry food it matched are counted in different units
   * ("2 lb" of bananas against a food kept in "count"). Adding 2 to a count
   * of 6 is a number, not a fact, so a mismatched row starts unticked and
   * the review screen says why. Optional so a row built by hand (tests, old
   * callers) reads as "no mismatch".
   */
  unitMismatch?: boolean;
}

/** Unit spellings that mean the same thing on a receipt and in the pantry. */
const UNIT_ALIASES: Record<string, string> = {
  lbs: 'lb',
  pound: 'lb',
  pounds: 'lb',
  ounce: 'oz',
  ounces: 'oz',
  gallon: 'gal',
  gallons: 'gal',
  ea: 'count',
  each: 'count',
  ct: 'count',
  pc: 'count',
  pcs: 'count',
  piece: 'count',
  pieces: 'count',
  item: 'count',
  items: 'count',
  unit: 'count',
  units: 'count',
  pk: 'pack',
  pkg: 'pack',
  package: 'pack',
  packages: 'pack',
  packs: 'pack',
  bags: 'bag',
  boxes: 'box',
  jars: 'jar',
  bottles: 'bottle',
  cans: 'can',
  loaves: 'loaf',
  dozens: 'dozen',
  doz: 'dozen',
  servings: 'serving',
};

/** Lowercased, trimmed, dot-free, with common aliases folded together. */
export function normalizeReceiptUnit(unit: string | null | undefined): string {
  const u = (unit ?? '').trim().toLowerCase().replace(/\.$/, '');
  return UNIT_ALIASES[u] ?? u;
}

/**
 * True when both units are known and differ. An empty unit on either side is
 * "not stated", which is not a disagreement.
 */
export function unitsMismatch(
  lineUnit: string | null | undefined,
  foodUnit: string | null | undefined
): boolean {
  const a = normalizeReceiptUnit(lineUnit);
  const b = normalizeReceiptUnit(foodUnit);
  return a !== '' && b !== '' && a !== b;
}

/** Normalised name used to fold two receipt lines for the same new food. */
export function receiptNameKey(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const VALID_CATEGORIES: FoodCategory[] = [
  'protein',
  'carb',
  'dairy',
  'fruit',
  'vegetable',
  'snack',
];

/**
 * Map the broader edge-function category vocabulary onto the strict 6-value
 * `FoodCategory` enum the pantry uses. Anything outside the canonical set
 * collapses to 'snack' so a row never lands without a category.
 */
export function categoryFromString(raw: string): FoodCategory {
  const lower = (raw ?? '').toLowerCase();
  if (VALID_CATEGORIES.includes(lower as FoodCategory)) return lower as FoodCategory;
  if (lower === 'beverage' || lower === 'frozen' || lower === 'pantry') return 'snack';
  return 'snack';
}

/**
 * Three-tier match: exact (lowercased), prefix, contains. Returns the first
 * hit in `foods` array order so the dialog can lock onto a deterministic
 * choice when multiple substrings exist.
 */
export function fuzzyMatchFood(name: string, foods: ReadonlyArray<Food>): Food | null {
  const target = (name ?? '').trim().toLowerCase();
  if (!target) return null;
  const exact = foods.find((f) => f.name.trim().toLowerCase() === target);
  if (exact) return exact;
  const startsWith = foods.find((f) => f.name.trim().toLowerCase().startsWith(target));
  if (startsWith) return startsWith;
  const contains = foods.find((f) => f.name.trim().toLowerCase().includes(target));
  return contains ?? null;
}

/**
 * Compute the post-confirm shape: parsed line items → review rows that
 * the user toggles + sees, with deterministic uids and an "accept by
 * default if confidence>=0.5" rule that matches the dialog.
 */
export function parseResponseToReviewRows(
  data: ParseResponse,
  foods: ReadonlyArray<Food>
): ReviewRow[] {
  const seen = new Set<string>();
  return data.lineItems.map((it, idx) => {
    let uid = `${it.parsedName}-${idx}`;
    while (seen.has(uid)) uid = `${uid}-x`;
    seen.add(uid);
    const matched = fuzzyMatchFood(it.parsedName, foods);
    const unitMismatch = matched ? unitsMismatch(it.unit, matched.unit) : false;
    return {
      ...it,
      uid,
      accept: it.confidence >= 0.5 && !unitMismatch,
      matchedFoodId: matched?.id ?? null,
      unitMismatch,
    };
  });
}

/** Stock to add to a pantry food the receipt row was matched to. */
export interface ReceiptFoodUpdate {
  foodId: string;
  quantityDelta: number;
}

export interface ReceiptPantryPlan {
  /** One entry per matched food, with the quantities of its rows summed. */
  updates: ReceiptFoodUpdate[];
  /** New pantry foods, for accepted rows that matched nothing. */
  creates: Omit<Food, 'id'>[];
}

/**
 * Final transform a confirmed reviewer's accepted rows go through before
 * landing in the pantry. Mirrors the dialog's handleConfirm so a vitest
 * fixture can lock the contract without rendering React.
 *
 * A row matched to an existing pantry food (matchedFoodId) tops that food up
 * rather than creating a second one. Before this, every weekly receipt added
 * another "Milk" to the pantry. Two rows matched to the same food (two cartons
 * rung up separately) become one update with the quantities summed.
 */
export function acceptedRowsToFoods(rows: ReadonlyArray<ReviewRow>): ReceiptPantryPlan {
  const deltas = new Map<string, number>();
  const creates: Omit<Food, 'id'>[] = [];
  // Two unmatched "Bananas" lines (rung up twice) are one new food, not two.
  // Keyed by name AND unit: 2 lb and 3 count cannot be added together, so
  // those stay separate rather than producing "5" of something.
  const createIndex = new Map<string, number>();
  for (const r of rows) {
    if (!r.accept) continue;
    const qty = Number.isFinite(r.qty) && r.qty > 0 ? r.qty : 1;
    if (r.matchedFoodId) {
      deltas.set(r.matchedFoodId, (deltas.get(r.matchedFoodId) ?? 0) + qty);
      continue;
    }
    const key = `${receiptNameKey(r.parsedName)}|${normalizeReceiptUnit(r.unit)}`;
    const existing = createIndex.get(key);
    if (existing !== undefined) {
      const prev = creates[existing];
      prev.quantity = Math.round(((prev.quantity ?? 0) + qty) * 100) / 100;
      continue;
    }
    createIndex.set(key, creates.length);
    creates.push({
      name: r.parsedName.trim(),
      category: categoryFromString(r.category),
      // US-803: a receipt says what was bought. Nothing on it says a
      // child accepted any of it.
      is_safe: ACQUIRED_FOOD_IS_SAFE,
      is_try_bite: ACQUIRED_FOOD_IS_TRY_BITE,
      quantity: qty,
      unit: r.unit || undefined,
    });
  }
  const updates = [...deltas].map(([foodId, quantityDelta]) => ({
    foodId,
    quantityDelta: Math.round(quantityDelta * 100) / 100,
  }));
  return { updates, creates };
}

/**
 * The unit each top-up was bought in, for a caller that routes updates
 * through a ledger-aware top-up (`onTopUp(foodId, delta, unit)`). The first
 * accepted row's non-empty unit wins; null when no row stated one.
 */
export function topUpUnits(rows: ReadonlyArray<ReviewRow>): Map<string, string | null> {
  const units = new Map<string, string | null>();
  for (const r of rows) {
    if (!r.accept || !r.matchedFoodId) continue;
    const unit = r.unit?.trim() || null;
    if (!units.has(r.matchedFoodId) || (units.get(r.matchedFoodId) === null && unit)) {
      units.set(r.matchedFoodId, unit);
    }
  }
  return units;
}

/**
 * Average confidence over a line-item list. Surfaces the "low confidence
 * → bail out" gate the dialog uses (`avgConfidence < 0.4`).
 */
export function averageConfidence(items: ReadonlyArray<ParsedLineItem>): number {
  if (items.length === 0) return 0;
  return items.reduce((acc, it) => acc + it.confidence, 0) / items.length;
}
