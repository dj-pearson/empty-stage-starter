/**
 * US-294: pure receipt-parse normalisation helpers.
 *
 * These were inline functions in ScanReceiptDialog.tsx; extracting lets us
 * back the AC's "5 anonymized receipt JSON outputs + line-item count
 * assertions" with vitest without spinning up the dialog under jsdom.
 */
import type { Food, FoodCategory } from '@/types';

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
    return {
      ...it,
      uid,
      accept: it.confidence >= 0.5,
      matchedFoodId: matched?.id ?? null,
    };
  });
}

/**
 * Final transform a confirmed reviewer's accepted rows go through before
 * landing as pantry foods. Mirrors the dialog's handleConfirm so a vitest
 * fixture can lock the contract without rendering React.
 */
export function acceptedRowsToFoods(rows: ReadonlyArray<ReviewRow>): Omit<Food, 'id'>[] {
  return rows
    .filter((r) => r.accept)
    .map((r) => ({
      name: r.parsedName,
      category: categoryFromString(r.category),
      is_safe: true,
      is_try_bite: false,
      quantity: r.qty,
      unit: r.unit || undefined,
    }));
}

/**
 * Average confidence over a line-item list. Surfaces the "low confidence
 * → bail out" gate the dialog uses (`avgConfidence < 0.4`).
 */
export function averageConfidence(items: ReadonlyArray<ParsedLineItem>): number {
  if (items.length === 0) return 0;
  return items.reduce((acc, it) => acc + it.confidence, 0) / items.length;
}
