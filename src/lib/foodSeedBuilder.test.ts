import { describe, it, expect } from 'vitest';
import { buildSeed, normalizeName, displayName } from '../../scripts/seed/build-food-seed.mjs';

const CATEGORY_AISLE = {
  '9': { category: 'fruit', aisle: 'produce' },
  // Deliberately ALSO present in EXCLUDED below, so "drops an excluded
  // category" (fix 6) actually discriminates: if the excluded-category
  // check were deleted, a food in category 11 would still find a mapping
  // here and be admitted, rather than accidentally landing on
  // "unmapped category" for an unrelated reason.
  '11': { category: 'vegetable', aisle: 'produce' },
  // `as const` so the literals stay literals: buildSeed's categoryAisle is
  // Record<string, AisleMapping>, whose category and aisle are unions, and a
  // widened `string` is not assignable to either. It also means a typo in a
  // fixture aisle is a compile error rather than a silently unmatched row.
} as const;
const EXCLUDED = new Set(['11']);

/** Minimal shapes matching the USDA CSV columns we read. */
const foods = [
  { fdc_id: '1', data_type: 'sr_legacy_food', description: 'Lemons, raw, without peel', food_category_id: '9' },
  { fdc_id: '2', data_type: 'sr_legacy_food', description: 'Beef, chuck, arm pot roast, separable lean only, raw', food_category_id: '13' },
  { fdc_id: '3', data_type: 'sr_legacy_food', description: 'Cheerios', food_category_id: '11' },
  { fdc_id: '4', data_type: 'sub_sample_food', description: 'Apples, raw', food_category_id: '9' },
  { fdc_id: '5', data_type: 'sr_legacy_food', description: 'Lemons, raw', food_category_id: '9' },
  // fix 6: no fixture food previously lacked a calorie nutrient, so the
  // missing-calories guard could be deleted and every existing test would
  // still pass. This one has a valid category and description but no
  // nutrient_id 1008 entry below.
  { fdc_id: '6', data_type: 'sr_legacy_food', description: 'Guavas, common, raw', food_category_id: '9' },
];
const nutrients = [
  { fdc_id: '1', nutrient_id: '1008', amount: '29' },
  { fdc_id: '1', nutrient_id: '1003', amount: '1.1' },
  { fdc_id: '5', nutrient_id: '1008', amount: '29' },
  // fdc 6 gets no 1008 entry at all -- see the food fixture above.
];

describe('normalizeName', () => {
  it('produces the actual expected key, not just a case-insensitive match', () => {
    // A function that always returns "" would also pass a bare
    // toBe(normalizeName(other)) comparison -- assert the real value.
    expect(normalizeName('Lemons, raw, without peel')).toBe('lemons raw without peel');
    expect(normalizeName('LEMONS, RAW, WITHOUT PEEL')).toBe('lemons raw without peel');
  });
  it('strips diacritics, using a description that actually carries one', () => {
    // The original fixture ("Creme fraiche") was plain ASCII, so the
    // NFD-normalize-and-strip-combining-marks path was never exercised.
    expect(normalizeName('Crème fraîche')).toBe('creme fraiche');
  });
  it('strips characters a SQL literal should never carry', () => {
    expect(normalizeName('Creme fraiche')).toMatch(/^[a-z0-9 -]+$/);
  });
  it('deletes an apostrophe rather than treating it as a word break (fix 7)', () => {
    // "mother's" -> "mothers", not "mother s" -- see the comment on
    // normalizeName for why a household typing without an apostrophe
    // needs to land on the same key.
    expect(normalizeName("Mother's loaf, pork")).toBe('mothers loaf pork');
  });
});

describe('displayName', () => {
  it('drops the trailing preparation clause', () => {
    expect(displayName('Lemons, raw, without peel')).toBe('Lemons');
  });
  it('keeps a clause that distinguishes the food', () => {
    expect(displayName('Beef, ground, 80% lean')).toBe('Beef, ground, 80% lean');
  });
  it('title-cases a shouted description', () => {
    expect(displayName('HUMMUS, CLASSIC')).toBe('Hummus, Classic');
  });
  it('strips a trailing USDA distribution-program note', () => {
    // "frozen" is NOT a droppable trailing clause after fix 1 (it changes
    // the product), so this reduces to "Carrots, frozen", not "Carrots" --
    // "unprepared" (droppable) and the program note both still go.
    expect(displayName('Carrots, frozen, unprepared (Includes foods for USDA\'s Food Distribution Program)')).toBe('Carrots, frozen');
    // "bartlett" is the trailing clause here, not "raw", so it isn't
    // droppable, so nothing but the note itself is stripped.
    expect(displayName('Pears, raw, bartlett (Includes foods for USDA\'s Food Distribution Program)')).toBe('Pears, raw, bartlett');
  });
  it('does not strip a parenthetical that is part of the food name', () => {
    expect(displayName('Bread, salvadoran sweet cheese (quesadilla salvadorena)')).toBe(
      'Bread, salvadoran sweet cheese (quesadilla salvadorena)'
    );
    expect(displayName('Alcoholic beverage, rice (sake)')).toBe('Alcoholic beverage, rice (sake)');
  });

  // Fix 1 (CRITICAL): these five words change what the food IS, not how
  // it was prepared, and must stay in the displayed name rather than being
  // silently dropped the way "raw" or "cooked" are.
  it('keeps "dried" -- it is a different product, not a preparation state', () => {
    expect(displayName('Egg, whole, dried')).toBe('Egg, whole, dried');
    expect(displayName('Milk, buttermilk, dried')).toBe('Milk, buttermilk, dried');
  });
  it('keeps "canned", "frozen", "drained" and "unsalted" for the same reason', () => {
    expect(displayName('Fish, tuna, light, canned')).toBe('Fish, tuna, light, canned');
    expect(displayName('Peas, green, frozen')).toBe('Peas, green, frozen');
    expect(displayName('Beans, kidney, drained')).toBe('Beans, kidney, drained');
    expect(displayName('Butter, unsalted')).toBe('Butter, unsalted');
  });
  it('still drops genuine preparation-state words, including the new "with skin"/"without <anything>" cases', () => {
    expect(displayName('Chicken, breast, with skin')).toBe('Chicken, breast');
    expect(displayName('Beans, green, without added salt')).toBe('Beans, green');
  });
  it('trims a trailing sentence period (fix 7)', () => {
    expect(displayName('Yogurt, vanilla, low fat.')).toBe('Yogurt, vanilla, low fat');
  });
  it('can return an empty string for a punctuation-only description, which buildSeed is responsible for dropping', () => {
    expect(displayName('...')).toBe('');
  });
});

describe('buildSeed', () => {
  const { rows, dropped } = buildSeed({ foods, nutrients, categoryAisle: CATEGORY_AISLE, excluded: EXCLUDED });

  it('keeps only real food rows', () => {
    // fdc 4 is sub_sample_food, which is sampling metadata and not a food.
    expect(dropped.find(d => d.fdc_id === '4')?.reason).toMatch(/data_type/);
  });
  it('drops an excluded category with the exact excluded-category reason, not just anything matching /category/', () => {
    // fix 6: category 11 is BOTH excluded and (deliberately, see
    // CATEGORY_AISLE above) otherwise mapped, so this fails if the
    // excluded-category check is ever deleted -- the row would be
    // admitted instead of landing on some other "category" reason.
    expect(dropped.find(d => d.fdc_id === '3')?.reason).toBe('excluded category (food_category_id=11)');
  });
  it('drops a lab-speak description', () => {
    expect(dropped.find(d => d.fdc_id === '2')?.reason).toMatch(/lab|separable/i);
  });
  it('drops a row with no calories rather than seeding a hole', () => {
    // fix 6: fdc 6 has no nutrient_id 1008 entry (see the fixture above),
    // so this fails if the missing-calories guard is ever deleted.
    expect(dropped.find(d => d.fdc_id === '6')?.reason).toMatch(/calories/i);
    expect(rows.every(r => typeof r.calories_kcal_100 === 'number')).toBe(true);
  });
  it('resolves a name_normalized collision instead of emitting both', () => {
    const keys = rows.map(r => r.name_normalized);
    expect(new Set(keys).size).toBe(keys.length);
    expect(dropped.find(d => d.fdc_id === '5')?.reason).toMatch(/collision|duplicate/i);
  });
  it('stamps provenance on every row', () => {
    for (const r of rows) {
      expect(r.kind).toBe('generic');
      expect(r.source).toBe('usda');
      expect(r.verification).toBe('verified');
      expect(r.source_ref).toBeTruthy();
    }
  });
  it('drops a row whose nutrition is outside the CHECK bounds rather than clamping it', () => {
    const out = buildSeed({
      foods: [{ fdc_id: '9', data_type: 'sr_legacy_food', description: 'Impossible food', food_category_id: '9' }],
      nutrients: [{ fdc_id: '9', nutrient_id: '1008', amount: '1200' }],
      categoryAisle: CATEGORY_AISLE, excluded: EXCLUDED,
    });
    expect(out.rows).toHaveLength(0);
    expect(out.dropped[0].reason).toMatch(/bounds|range/i);
  });
  it('strips the USDA program note before resolving collisions, and reports the resulting collision', () => {
    const out = buildSeed({
      foods: [
        { fdc_id: '10', data_type: 'sr_legacy_food', description: 'Pears, raw, bartlett', food_category_id: '9' },
        { fdc_id: '11', data_type: 'sr_legacy_food', description: "Pears, raw, bartlett (Includes foods for USDA's Food Distribution Program)", food_category_id: '9' },
      ],
      nutrients: [
        { fdc_id: '10', nutrient_id: '1008', amount: '57' },
        { fdc_id: '11', nutrient_id: '1008', amount: '57' },
      ],
      categoryAisle: CATEGORY_AISLE, excluded: EXCLUDED,
    });
    // "bartlett" is the trailing clause, not "raw", so it isn't dropped by
    // fix 1's clause rules either way -- the program note is the ONLY
    // textual difference between the two, so stripping it makes both
    // reduce to the identical displayName "Pears, raw, bartlett", and
    // exactly one survives the resulting collision.
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].name_normalized).toBe('pears raw bartlett');
    expect(out.dropped.some(d => /collision|duplicate/i.test(d.reason))).toBe(true);
  });
  it('drops an alcoholic beverage by USDA description prefix, regardless of category, and keeps cocktail/wine-named groceries', () => {
    const out = buildSeed({
      foods: [
        // category '14' is deliberately NOT in this test's CATEGORY_AISLE
        // (only '9' and '11' are), so if the prefix check didn't fire
        // before the category-mapping check, this would be dropped as
        // "unmapped category" instead of "alcoholic-beverage" -- the
        // reason assertion below pins the right one.
        { fdc_id: '14', data_type: 'sr_legacy_food', description: 'Alcoholic beverage, wine, light', food_category_id: '14' },
        { fdc_id: '15', data_type: 'sr_legacy_food', description: 'Cranberry juice cocktail, bottled', food_category_id: '9' },
        { fdc_id: '16', data_type: 'sr_legacy_food', description: 'Beverages, carbonated, root beer', food_category_id: '9' },
      ],
      nutrients: [
        { fdc_id: '14', nutrient_id: '1008', amount: '85' },
        { fdc_id: '15', nutrient_id: '1008', amount: '58' },
        { fdc_id: '16', nutrient_id: '1008', amount: '41' },
      ],
      categoryAisle: CATEGORY_AISLE, excluded: EXCLUDED,
    });
    expect(out.dropped.find(d => d.fdc_id === '14')?.reason).toMatch(/alcoholic-beverage/);
    expect(out.rows.some(r => r.source_ref === '15')).toBe(true);
    expect(out.rows.some(r => r.source_ref === '16')).toBe(true);
  });
  it('drops a Title-Case (not ALLCAPS) curated brand name as generic', () => {
    const out = buildSeed({
      foods: [{ fdc_id: '12', data_type: 'sr_legacy_food', description: 'Pillsbury, Cinnamon Rolls with Icing, refrigerated dough', food_category_id: '9' }],
      nutrients: [{ fdc_id: '12', nutrient_id: '1008', amount: '350' }],
      categoryAisle: CATEGORY_AISLE, excluded: EXCLUDED,
    });
    expect(out.rows).toHaveLength(0);
    expect(out.dropped[0].reason).toMatch(/brand/i);
  });
  it('does not drop a legitimate two-word Title-Case food name as a brand', () => {
    const out = buildSeed({
      foods: [{ fdc_id: '13', data_type: 'sr_legacy_food', description: 'Turkey Pot Pie, frozen entree', food_category_id: '9' }],
      nutrients: [{ fdc_id: '13', nutrient_id: '1008', amount: '210' }],
      categoryAisle: CATEGORY_AISLE, excluded: EXCLUDED,
    });
    expect(out.rows).toHaveLength(1);
    expect(out.dropped).toHaveLength(0);
  });

  // Fix 2 (CRITICAL): the qualifier-clause cap counts displayName's
  // OUTPUT, not the raw description's commas.
  it('keeps a food whose raw description is over the clause cap but reduces under it once preparation clauses are stripped', () => {
    const out = buildSeed({
      foods: [{
        fdc_id: '20',
        data_type: 'sr_legacy_food',
        // 5 raw clauses (over MAX_QUALIFIER_CLAUSES=3), but every clause
        // after "Widget" is a droppable preparation word, so displayName
        // reduces it to the single clause "Widget" -- comfortably under
        // the cap. Counting the raw description's commas would have
        // deleted this row outright. (Not "cooked" -- that would also
        // trip the unrelated unprepared-with-a-cooked-sibling lab-speak
        // check against itself, since this is the only food in the batch.)
        description: 'Widget, raw, boiled, unheated, fresh',
        food_category_id: '9',
      }],
      nutrients: [{ fdc_id: '20', nutrient_id: '1008', amount: '50' }],
      categoryAisle: CATEGORY_AISLE, excluded: EXCLUDED,
    });
    expect(out.dropped.find(d => d.fdc_id === '20')).toBeUndefined();
    expect(out.rows.find(r => r.source_ref === '20')?.name).toBe('Widget');
  });

  // Fix 3 (CRITICAL): the headline bug, and the reason fixes 1-3 are one
  // bug in three places. With fix 1 alone, "Egg, whole, raw, fresh" and
  // "Egg, whole, dried" reduce to DIFFERENT displayName output ("Egg,
  // whole" vs "Egg, whole, dried") precisely because fix 1 stops "dried"
  // from being stripped -- so they no longer collide at all, and both
  // survive as separate, honestly-named rows. That is the actual, correct
  // outcome once fix 1 is applied properly: the brief's "assert the
  // surviving egg whole row is around 143 kcal, not 592" is satisfied by
  // checking the row named exactly "Egg, whole" (the real one), not by a
  // collision resolving in its favor.
  it('gives "Egg, whole" (the real, ~143 kcal row) and "Egg, whole, dried" (the ~592 kcal powder) separate, honestly-named rows once fix 1 stops them colliding', () => {
    const out = buildSeed({
      foods: [
        { fdc_id: '30', data_type: 'sr_legacy_food', description: 'Egg, whole, raw, fresh', food_category_id: '9' },
        { fdc_id: '31', data_type: 'sr_legacy_food', description: 'Egg, whole, dried', food_category_id: '9' },
      ],
      nutrients: [
        { fdc_id: '30', nutrient_id: '1008', amount: '143' },
        { fdc_id: '31', nutrient_id: '1008', amount: '592' },
      ],
      categoryAisle: CATEGORY_AISLE, excluded: EXCLUDED,
    });
    const realEgg = out.rows.find((r) => r.name === 'Egg, whole');
    const driedEgg = out.rows.find((r) => r.name === 'Egg, whole, dried');
    expect(realEgg).toBeDefined();
    expect(driedEgg).toBeDefined();
    expect(realEgg?.calories_kcal_100).toBeGreaterThan(100);
    expect(realEgg?.calories_kcal_100).toBeLessThan(200);
    expect(driedEgg?.calories_kcal_100).toBe(592);
  });

  // Fix 3's rank-2 tie-break (processed-state beats richness-tied,
  // non-processed loses to processed) still needs its own direct test:
  // proven above, a real collision between a processed and non-processed
  // description can't actually happen once fix 1 keeps a processed word in
  // every name it appears in -- if two rows' FINAL names are identical
  // (the definition of a collision), any processed word in one row's name
  // is, by construction, present in the other's too. This test exercises
  // the comparator directly through the one honest loophole: the USDA
  // program-note parenthetical is stripped from the description BEFORE
  // hasProcessedStateWord would ever see it via the final name, but
  // hasProcessedStateWord itself reads the RAW description (before that
  // strip) -- so a processed word placed inside the note is seen by the
  // tie-break but never reaches the displayed name. Contrived, but it is
  // genuinely how the code behaves, and it is the only way to make two
  // candidates disagree on processed-state while still colliding.
  it('rank 2 of the collision tie-break: a description with a processed-state word loses to one without it, at equal richness', () => {
    const out = buildSeed({
      foods: [
        { fdc_id: '32', data_type: 'sr_legacy_food', description: "Widget, raw (Includes foods for USDA's Food Distribution Program dried)", food_category_id: '9' },
        { fdc_id: '33', data_type: 'sr_legacy_food', description: 'Widget, raw', food_category_id: '9' },
      ],
      nutrients: [
        { fdc_id: '32', nutrient_id: '1008', amount: '50' },
        { fdc_id: '33', nutrient_id: '1008', amount: '50' },
      ],
      categoryAisle: CATEGORY_AISLE, excluded: EXCLUDED,
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].source_ref).toBe('33');
    expect(out.dropped.find((d) => d.fdc_id === '32')?.reason).toMatch(/collision|duplicate/i);
  });

  // Fix 7: displayName can return "" for a punctuation-only description;
  // buildSeed must drop it with a reason rather than seed a blank name.
  it('drops a row whose display name comes back empty rather than seeding a blank name', () => {
    const out = buildSeed({
      foods: [{ fdc_id: '40', data_type: 'sr_legacy_food', description: '...', food_category_id: '9' }],
      nutrients: [{ fdc_id: '40', nutrient_id: '1008', amount: '10' }],
      categoryAisle: CATEGORY_AISLE, excluded: EXCLUDED,
    });
    expect(out.rows).toHaveLength(0);
    expect(out.dropped[0].reason).toMatch(/empty/i);
  });

  // Fix 4: an aisle override refines the category default for a food
  // whose description matches it, without touching `category`.
  it('applies an aisleOverrides entry over the category default, leaving `category` unchanged', () => {
    const out = buildSeed({
      foods: [{ fdc_id: '50', data_type: 'sr_legacy_food', description: 'Egg, whole, raw, fresh', food_category_id: '9' }],
      nutrients: [{ fdc_id: '50', nutrient_id: '1008', amount: '143' }],
      categoryAisle: CATEGORY_AISLE,
      excluded: EXCLUDED,
      aisleOverrides: [{ categoryId: '9', test: (d) => /^Egg\b/i.test(d), aisle: 'eggs' }],
    });
    const row = out.rows.find(r => r.source_ref === '50');
    expect(row?.default_aisle_section).toBe('eggs');
    expect(row?.default_category).toBe('fruit'); // unchanged -- category 9's default in this fixture
  });
  it('falls back to the category default aisle when no override matches', () => {
    const out = buildSeed({
      foods: [{ fdc_id: '51', data_type: 'sr_legacy_food', description: 'Lemons, raw', food_category_id: '9' }],
      nutrients: [{ fdc_id: '51', nutrient_id: '1008', amount: '29' }],
      categoryAisle: CATEGORY_AISLE,
      excluded: EXCLUDED,
      aisleOverrides: [{ categoryId: '9', test: (d) => /^Egg\b/i.test(d), aisle: 'eggs' }],
    });
    const row = out.rows.find(r => r.source_ref === '51');
    expect(row?.default_aisle_section).toBe('produce');
  });

  // Fix round 4: STAPLE_PATTERNS bypasses the qualifier-clause cap for a
  // hand-curated list of real foods USDA happens to write with several
  // genuinely-distinguishing clauses (white rice's "regular, raw,
  // enriched"; french fries' cut/salt/heat-state clauses) -- none of them
  // lab-speak, none of them a NON_COUNTING_QUALIFIER_PATTERNS packaging
  // idiom, so without this bypass they're dropped as "too narrow" the
  // same way canned tuna used to be.
  it('a staple pattern bypasses the qualifier-clause cap', () => {
    const out = buildSeed({
      foods: [{
        fdc_id: '60',
        data_type: 'sr_legacy_food',
        // Matches STAPLE_PATTERNS' white-rice entry by prefix; the extra
        // trailing clauses prove the cap itself is bypassed, not just
        // raised high enough for this one description.
        description: 'Rice, white, long-grain, regular, raw, enriched, extra, clauses, here',
        food_category_id: '9',
      }],
      nutrients: [{ fdc_id: '60', nutrient_id: '1008', amount: '365' }],
      categoryAisle: CATEGORY_AISLE, excluded: EXCLUDED,
    });
    expect(out.dropped.find(d => d.fdc_id === '60')).toBeUndefined();
    expect(out.rows.find(r => r.source_ref === '60')).toBeDefined();
  });

  // Fix round 4: a staple's categoryOverride (pizza only) bypasses BOTH
  // the clause cap and category exclusion -- USDA files generic frozen
  // supermarket pizza under category 21 (Fast Foods) alongside actual
  // restaurant/branded rows, which is rightly excluded for those, but not
  // for this specific, hand-picked description shape.
  it('a staple with categoryOverride bypasses both the clause cap and category exclusion', () => {
    const out = buildSeed({
      foods: [{
        fdc_id: '61',
        data_type: 'sr_legacy_food',
        description: 'Pizza, cheese topping, regular crust, frozen, cooked',
        food_category_id: '21',
      }],
      nutrients: [{ fdc_id: '61', nutrient_id: '1008', amount: '260' }],
      categoryAisle: CATEGORY_AISLE,
      excluded: new Set(['21']), // proves this would normally be excluded
    });
    const row = out.rows.find(r => r.source_ref === '61');
    expect(row).toBeDefined();
    expect(row?.default_category).toBe('snack');
    expect(row?.default_aisle_section).toBe('frozen_meals');
  });
});
