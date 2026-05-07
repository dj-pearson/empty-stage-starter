/**
 * US-120: OpenFoodFacts client used by both web and mobile barcode flows.
 *
 * Endpoint: https://world.openfoodfacts.org/api/v2/product/<barcode>.json
 *
 * Returns a normalised, frontend-shaped record. Returns `null` when the
 * barcode is not in the OFF database. Throws on network error so callers
 * can present a "try again" path.
 *
 * No auth — OpenFoodFacts is a public dataset. We use the v2 endpoint
 * and request only the fields we render so the response is small.
 */

export interface OpenFoodFactsLookup {
  barcode: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  /** kcal per serving (or per 100g if serving is missing). */
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  saltG: number | null;
  /** Lower-case, comma-stripped allergen tags (e.g. ["en:gluten", "en:milk"]). */
  allergens: string[];
  /** Lower-case ingredient tags split from `ingredients_text`. */
  ingredients: string[];
  /** Raw OFF "nutriscore" letter (a-e), null when absent. */
  nutriscore: string | null;
}

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = [
  'product_name',
  'brands',
  'image_front_small_url',
  'image_url',
  'serving_size',
  'serving_quantity',
  'nutriments',
  'allergens_tags',
  'ingredients_text',
  'nutriscore_grade',
].join(',');

function pickServingFactor(serving_quantity: unknown): number {
  const n = typeof serving_quantity === 'number' ? serving_quantity : parseFloat(String(serving_quantity ?? ''));
  if (Number.isFinite(n) && n > 0) return n / 100;
  return 1;
}

/**
 * Fetch a product by EAN-13 / UPC-A / UPC-E barcode. Returns null when the
 * product is not in OpenFoodFacts (status === 0). Throws on network error.
 */
export async function queryOpenFoodFacts(barcode: string): Promise<OpenFoodFactsLookup | null> {
  const trimmed = barcode.trim();
  if (!trimmed) return null;

  const url = `${OFF_BASE}/${encodeURIComponent(trimmed)}.json?fields=${encodeURIComponent(FIELDS)}`;
  const res = await fetch(url, {
    headers: {
      // OpenFoodFacts asks third-party clients to set a UA. Use a stable
      // identifier so they can rate-limit us if necessary.
      'User-Agent': 'EatPal/1.0 (https://tryeatpal.com)',
    },
  });

  if (!res.ok) {
    throw new Error(`OpenFoodFacts ${res.status}`);
  }

  const json = await res.json();
  if (!json || json.status === 0 || !json.product) return null;

  const p = json.product;
  const nutr = p.nutriments ?? {};
  // OFF stores per-100g by default; serving_quantity tells us the grams in
  // one serving. We surface "per serving" when serving info is present so
  // the UI can show an honest calorie count.
  const factor = pickServingFactor(p.serving_quantity);
  const num = (key: string): number | null => {
    const v = nutr[key];
    if (v == null) return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? Math.round(n * factor * 10) / 10 : null;
  };

  const allergens = Array.isArray(p.allergens_tags)
    ? (p.allergens_tags as string[]).map((s) => String(s).toLowerCase())
    : [];

  const ingredients = typeof p.ingredients_text === 'string'
    ? p.ingredients_text
        .split(/[,;]/)
        .map((s: string) => s.trim().toLowerCase())
        .filter(Boolean)
    : [];

  return {
    barcode: trimmed,
    name: (p.product_name ?? '').trim() || `Product ${trimmed}`,
    brand: (p.brands ?? '').trim() || null,
    imageUrl: p.image_front_small_url || p.image_url || null,
    calories: num('energy-kcal_100g') ?? num('energy-kcal') ?? null,
    proteinG: num('proteins_100g') ?? num('proteins') ?? null,
    carbsG: num('carbohydrates_100g') ?? num('carbohydrates') ?? null,
    fatG: num('fat_100g') ?? num('fat') ?? null,
    fiberG: num('fiber_100g') ?? num('fiber') ?? null,
    sugarG: num('sugars_100g') ?? num('sugars') ?? null,
    saltG: num('salt_100g') ?? num('salt') ?? null,
    allergens,
    ingredients,
    nutriscore: typeof p.nutriscore_grade === 'string' && p.nutriscore_grade.length > 0
      ? p.nutriscore_grade.toUpperCase()
      : null,
  };
}

/** Heuristic check for barcodes — accepts EAN-13, UPC-A (12), UPC-E (8). */
export function isPlausibleBarcode(input: string): boolean {
  const digits = input.trim().replace(/\D/g, '');
  return digits.length === 8 || digits.length === 12 || digits.length === 13;
}
