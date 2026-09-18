/**
 * What a barcode provider has to have actually said before we believe it
 * (US-805).
 *
 * All three providers answer 200 for things that are not a product. Open Food
 * Facts returns `{status: 0}` for an unknown barcode, USDA returns a search
 * envelope that can carry zero or non-array `foods`, and FoodRepo -- whose
 * endpoint carries a "may need adjustment based on actual API" note and has
 * never been exercised against live data -- was read optimistically off
 * `response.ok` alone.
 *
 * The visible failure was the same in each: a name fallback of "Unknown
 * Product". A parent scanning a jar in a supermarket got a food called Unknown
 * Product with no nutrition, which looks like a successful scan, instead of the
 * add-it-yourself path they needed. A provider that answers with something we
 * do not understand has not found the product, and saying so is the whole fix.
 *
 * These are deliberately shape checks and nothing more. They do not judge
 * whether the nutrition is plausible -- toCatalogRow already bounds that for
 * the catalog -- only whether the payload is the envelope the caller thinks it
 * is parsing.
 */

/** A plain JSON object. Not null, not an array, not a scalar. */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A name we would be willing to show a parent, or null.
 *
 * Whitespace-only counts as absent: a provider padding a field is not a name,
 * and `" " || "Unknown Product"` keeps the empty string, so the old fallback
 * would not even have caught it.
 */
export function usableName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Open Food Facts: `{status: 1, product: {...}}` on a hit, `{status: 0}` on a
 * miss. `status` arrives as a number, but OFF has shipped it as a string in
 * places, so both are accepted rather than failing a real hit on a type.
 */
export function openFoodFactsProduct(body: unknown): Record<string, unknown> | null {
  if (!isJsonObject(body)) return null;
  const status = body.status;
  const found = status === 1 || status === '1';
  if (!found) return null;
  return isJsonObject(body.product) ? body.product : null;
}

/**
 * USDA FoodData Central: a search envelope, `{foods: [...]}`. An error body is
 * `{error: {...}}` with a 200, and `foods` has been seen as a non-array.
 */
export function usdaFirstFood(body: unknown): Record<string, unknown> | null {
  if (!isJsonObject(body)) return null;
  if (!Array.isArray(body.foods) || body.foods.length === 0) return null;
  const first = body.foods[0];
  return isJsonObject(first) ? first : null;
}

/**
 * FoodRepo: the product object at the top level. An error body is
 * `{error: ...}` or `{errors: [...]}` with a 200, which is precisely the case
 * that used to produce an "Unknown Product" food.
 */
export function foodRepoProduct(body: unknown): Record<string, unknown> | null {
  if (!isJsonObject(body)) return null;
  if ('error' in body || 'errors' in body) return null;
  return body;
}

/**
 * Read a response as JSON without letting a non-JSON 200 throw out of the
 * provider. A provider answering HTML or an empty body is a miss, not an
 * exception for the chain to catch.
 */
export async function readJsonBody(response: Response): Promise<unknown | null> {
  if (!response.ok) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}
