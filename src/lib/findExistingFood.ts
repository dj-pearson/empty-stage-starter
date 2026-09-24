/**
 * The food a new capture (quick add, barcode, receipt, photo) should stack
 * onto, instead of inserting a second "Milk".
 *
 * Match order, strongest first:
 *   1. barcode: the same physical product.
 *   2. canonical_id: the same catalog product (US-795).
 *   3. name: trimmed, lowercased, whitespace collapsed, last word singular
 *      ("Apples " matches "apple").
 *
 * Two different barcodes are two different products, whatever they are
 * called: a food carrying another barcode is never matched by id or name.
 *
 * Pure.
 */
import type { Food } from '@/types';
import { normalizeProductName } from '@/lib/depletionForecastWiring';
import { singularize } from '@/lib/itemNormalize';

export interface FindExistingFoodQuery {
  name: string;
  barcode?: string | null;
  canonicalId?: string | null;
}

const clean = (value: string | null | undefined): string => (value ?? '').trim();

/** Name key: normalizeProductName plus a singular last word. */
export function foodNameKey(name: string | null | undefined): string {
  const base = normalizeProductName(name ?? '');
  if (!base) return '';
  const words = base.split(' ');
  words[words.length - 1] = singularize(words[words.length - 1]);
  return words.join(' ');
}

export function findExistingFood(
  foods: readonly Food[],
  query: FindExistingFoodQuery,
): Food | undefined {
  const barcode = clean(query.barcode);
  const canonicalId = clean(query.canonicalId);
  const nameKey = foodNameKey(query.name);
  const valid = foods.filter((f): f is Food => Boolean(f && f.id));

  if (barcode) {
    const hit = valid.find((f) => clean(f.barcode) === barcode);
    if (hit) return hit;
  }

  // A food with a different barcode is a different product.
  const compatible = barcode
    ? valid.filter((f) => {
        const own = clean(f.barcode);
        return !own || own === barcode;
      })
    : valid;

  if (canonicalId) {
    const hit = compatible.find((f) => clean(f.canonical_id) === canonicalId);
    if (hit) return hit;
  }

  if (nameKey) {
    return compatible.find((f) => foodNameKey(f.name) === nameKey);
  }
  return undefined;
}
