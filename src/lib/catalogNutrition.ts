/**
 * Reading nutrition off the canonical catalog (US-799 AC2).
 *
 * The `nutrition` table stores figures PER SERVING and
 * `grocery_product_catalog` stores them PER 100g. Every screen that moves from
 * one to the other has to convert, and the conversion needs the serving mass:
 *
 *     per_serving = per_100 * serving_size_g / 100
 *
 * THE SERVING MASS IS OFTEN NOT THERE, AND THAT IS ON PURPOSE.
 * `parse_serving_grams` (20260918000003) returns NULL rather than guess for
 * "2 cookies", "1 cup (240 ml)" or a blank, because reading the 2 would divide
 * every nutrient by twelve and a half and store the result as a fact. So a
 * catalog row can carry real per-100g figures and no serving mass, and there
 * is then no honest per-serving number to show.
 *
 * This returns null for those rows. A caller must treat null the way it treats
 * a food it has no nutrition for at all -- count it as missing, not as zero.
 * Summing zeros is how a day of five unmeasured foods reads as "0 calories,
 * 5 items tracked", which is worse than an empty panel because it looks like
 * an answer.
 *
 * UNVERIFIED ROWS ARE ALSO NULL (US-797). A barcode scan promotes itself into
 * the shared catalog with `verification = 'unverified'`: one household's photo
 * of one label, checked by nobody. US-797 keeps those out of nutrition totals
 * and out of the ladder, and the cheapest place to hold that is here, at the
 * one function every screen goes through, rather than in each caller's query.
 * A caller that filters in SQL as well is doing no harm; a caller that forgets
 * still cannot total an unverified row.
 */

/** The catalog columns this needs. Rows elsewhere are wider. */
export interface CatalogNutritionRow {
  /** 'verified' | 'unverified' | 'rejected' (gpc_verification_check). */
  verification?: string | null;
  calories_kcal_100?: number | string | null;
  protein_g_100?: number | string | null;
  carbs_g_100?: number | string | null;
  fat_g_100?: number | string | null;
  serving_size_g?: number | string | null;
}

/** What a screen used to read off a `nutrition` row. */
export interface PerServingNutrition {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** The mass the figures are for, so a caller can say "per 40 g". */
  serving_size_g: number;
}

/**
 * numeric columns arrive from PostgREST as strings, and the old code read the
 * `nutrition` table's numerics with parseFloat for exactly that reason.
 */
function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** The only value US-797 lets into a total. */
export const TRUSTED_VERIFICATION = 'verified';

/**
 * Whether a row's figures may be counted. Unverified and rejected rows may
 * still be shown as a product -- FoodCard names their source -- but their
 * numbers do not go into anything that adds up.
 */
export function isTrustedForTotals(
  row: { verification?: string | null } | null | undefined,
): boolean {
  return row?.verification === TRUSTED_VERIFICATION;
}

/**
 * Per-serving figures for a catalog row, or null when there is no honest
 * answer: an unverified row, no serving mass, a nonsensical one, or no
 * nutrition recorded.
 *
 * A zero serving mass returns null rather than dividing by it.
 */
export function perServingFromCatalog(
  row: CatalogNutritionRow | null | undefined,
): PerServingNutrition | null {
  if (!row) return null;
  if (!isTrustedForTotals(row)) return null;

  const grams = num(row.serving_size_g);
  if (grams === null || grams <= 0) return null;

  const calories = num(row.calories_kcal_100);
  const protein = num(row.protein_g_100);
  const carbs = num(row.carbs_g_100);
  const fat = num(row.fat_g_100);

  // A row with a serving mass and no figures at all is a row with no
  // nutrition, not a row of zeroes.
  if (calories === null && protein === null && carbs === null && fat === null) {
    return null;
  }

  const scale = grams / 100;
  return {
    calories: (calories ?? 0) * scale,
    protein_g: (protein ?? 0) * scale,
    carbs_g: (carbs ?? 0) * scale,
    fat_g: (fat ?? 0) * scale,
    serving_size_g: grams,
  };
}

/**
 * The serving as a person would read it.
 *
 * Prefers the text the provider stated ("2 cookies (25g)"), because that is
 * what is on the packet; falls back to the parsed mass.
 */
export function servingLabel(row: {
  serving_size_text?: string | null;
  serving_size_g?: number | string | null;
} | null | undefined): string | null {
  if (!row) return null;
  const text = row.serving_size_text?.trim();
  if (text) return text;
  const grams = num(row.serving_size_g);
  return grams !== null && grams > 0 ? `${grams} g` : null;
}
