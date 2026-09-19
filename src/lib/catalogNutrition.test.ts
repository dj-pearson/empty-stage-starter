import { describe, it, expect } from 'vitest';
import { isTrustedForTotals, perServingFromCatalog, servingLabel } from './catalogNutrition';

/**
 * US-799 AC2. The whole risk in moving a screen off `nutrition` and onto the
 * catalog is the unit: one stores per serving, the other per 100g. Getting it
 * wrong does not throw; it shows a parent a number.
 *
 * Every row below is spread with VERIFIED because US-797 is enforced in the
 * same function: an unverified row has no per-serving figure whatever its
 * numbers say. The tests for that rule are at the bottom of this file.
 */

/** What a row the catalog has actually checked looks like. */
const VERIFIED = { verification: 'verified' } as const;
describe('perServingFromCatalog', () => {
  it('scales per-100g figures down to the serving', () => {
    // 520 kcal/100g at a 25 g serving is the 130 kcal the packet claims --
    // this is assertion 5 of the SQL suite, read back the other way.
    const perServing = perServingFromCatalog({
      ...VERIFIED,
      calories_kcal_100: 520,
      protein_g_100: 40,
      carbs_g_100: 60,
      fat_g_100: 20,
      serving_size_g: 25,
    });

    expect(perServing).not.toBeNull();
    expect(perServing!.calories).toBeCloseTo(130);
    expect(perServing!.protein_g).toBeCloseTo(10);
    expect(perServing!.carbs_g).toBeCloseTo(15);
    expect(perServing!.fat_g).toBeCloseTo(5);
    expect(perServing!.serving_size_g).toBe(25);
  });

  it('is the identity at a 100 g serving', () => {
    const perServing = perServingFromCatalog({
      ...VERIFIED,
      calories_kcal_100: 89,
      protein_g_100: 1.1,
      serving_size_g: 100,
    });
    expect(perServing!.calories).toBeCloseTo(89);
    expect(perServing!.protein_g).toBeCloseTo(1.1);
  });

  it('reads numerics that arrive as strings', () => {
    // PostgREST sends numeric columns as strings; the code this replaces used
    // parseFloat on every one of them for that reason.
    const perServing = perServingFromCatalog({
      ...VERIFIED,
      calories_kcal_100: '520',
      protein_g_100: '40',
      serving_size_g: '25',
    });
    expect(perServing!.calories).toBeCloseTo(130);
    expect(perServing!.protein_g).toBeCloseTo(10);
  });

  it('treats a missing macro as zero once the row has any figure at all', () => {
    const perServing = perServingFromCatalog({
      ...VERIFIED,
      calories_kcal_100: 200,
      protein_g_100: null,
      serving_size_g: 50,
    });
    expect(perServing!.calories).toBeCloseTo(100);
    expect(perServing!.protein_g).toBe(0);
  });
});

/**
 * The refusals. Each of these is a row the catalog legitimately holds, and
 * for each of them there is no honest per-serving figure.
 */
describe('perServingFromCatalog refuses rather than guesses', () => {
  it('returns null when the serving mass is unknown', () => {
    // parse_serving_grams returns NULL for "2 cookies" and "1 cup (240 ml)".
    // The per-100g figures are real; the serving is not known, so no
    // per-serving number exists to show.
    expect(
      perServingFromCatalog({
      ...VERIFIED, calories_kcal_100: 400, serving_size_g: null }),
    ).toBeNull();
  });

  it('returns null for a zero or negative serving mass', () => {
    expect(perServingFromCatalog({
      ...VERIFIED, calories_kcal_100: 400, serving_size_g: 0 })).toBeNull();
    expect(perServingFromCatalog({
      ...VERIFIED, calories_kcal_100: 400, serving_size_g: -5 })).toBeNull();
  });

  it('returns null for a row with a serving but no figures', () => {
    // A row carried across with its name and serving text and no nutrition is
    // a row with no nutrition, not a row of zeroes. A caller that summed it
    // would report "0 calories, 1 item tracked".
    expect(
      perServingFromCatalog({
      ...VERIFIED,
        calories_kcal_100: null,
        protein_g_100: null,
        carbs_g_100: null,
        fat_g_100: null,
        serving_size_g: 40,
      }),
    ).toBeNull();
  });

  it('returns null for nothing at all', () => {
    expect(perServingFromCatalog(null)).toBeNull();
    expect(perServingFromCatalog(undefined)).toBeNull();
    expect(perServingFromCatalog({})).toBeNull();
  });

  it('returns null rather than NaN for an unparseable value', () => {
    expect(perServingFromCatalog({
      ...VERIFIED, calories_kcal_100: 400, serving_size_g: 'about a cup' })).toBeNull();
  });
});

describe('servingLabel', () => {
  it('prefers the text the provider stated, because that is what is on the packet', () => {
    expect(servingLabel({ serving_size_text: '2 cookies (25g)', serving_size_g: 25 }))
      .toBe('2 cookies (25g)');
  });

  it('falls back to the parsed mass when there is no text', () => {
    expect(servingLabel({ serving_size_text: null, serving_size_g: 40 })).toBe('40 g');
  });

  it('says nothing rather than "null g" when there is neither', () => {
    expect(servingLabel({ serving_size_text: null, serving_size_g: null })).toBeNull();
    expect(servingLabel({ serving_size_text: '   ', serving_size_g: 0 })).toBeNull();
    expect(servingLabel(null)).toBeNull();
  });
});

/**
 * US-797: an unverified row does not enter a total.
 *
 * A barcode scan promotes itself into the shared catalog as
 * `verification = 'unverified'` -- one household's photo of one label. The
 * product is fine to show; its numbers are not fine to add up, and the rule
 * lives in perServingFromCatalog so a caller cannot forget it.
 */
describe('verification gates the figures, not the product', () => {
  const FIGURES = {
    calories_kcal_100: 520,
    protein_g_100: 40,
    serving_size_g: 25,
  };

  it('counts a verified row', () => {
    expect(perServingFromCatalog({ ...FIGURES, verification: 'verified' })).not.toBeNull();
  });

  it.each(['unverified', 'rejected'])('refuses a %s row with perfectly good figures', (state) => {
    // The figures are the same ones the first test in this file scales to 130
    // kcal. What changed is who checked them.
    expect(perServingFromCatalog({ ...FIGURES, verification: state })).toBeNull();
  });

  it('refuses a row that does not say', () => {
    // A caller whose select() left the column out gets the safe answer rather
    // than the convenient one.
    expect(perServingFromCatalog(FIGURES)).toBeNull();
    expect(perServingFromCatalog({ ...FIGURES, verification: null })).toBeNull();
  });

  it('isTrustedForTotals is the same test, for callers that need it alone', () => {
    expect(isTrustedForTotals({ verification: 'verified' })).toBe(true);
    expect(isTrustedForTotals({ verification: 'unverified' })).toBe(false);
    expect(isTrustedForTotals({})).toBe(false);
    expect(isTrustedForTotals(null)).toBe(false);
  });
});
