import { describe, it, expect } from 'vitest';
import { buildSeed, normalizeName, displayName } from '../../scripts/seed/build-food-seed.mjs';

const CATEGORY_AISLE = { '9': { category: 'fruit', aisle: 'Produce' } };
const EXCLUDED = new Set(['26']);

/** Minimal shapes matching the USDA CSV columns we read. */
const foods = [
  { fdc_id: '1', data_type: 'sr_legacy_food', description: 'Lemons, raw, without peel', food_category_id: '9' },
  { fdc_id: '2', data_type: 'sr_legacy_food', description: 'Beef, chuck, arm pot roast, separable lean only, raw', food_category_id: '13' },
  { fdc_id: '3', data_type: 'sr_legacy_food', description: 'Cheerios', food_category_id: '26' },
  { fdc_id: '4', data_type: 'sub_sample_food', description: 'Apples, raw', food_category_id: '9' },
  { fdc_id: '5', data_type: 'sr_legacy_food', description: 'Lemons, raw', food_category_id: '9' },
];
const nutrients = [
  { fdc_id: '1', nutrient_id: '1008', amount: '29' },
  { fdc_id: '1', nutrient_id: '1003', amount: '1.1' },
  { fdc_id: '5', nutrient_id: '1008', amount: '29' },
];

describe('normalizeName', () => {
  it('lowercases and collapses to a stable key', () => {
    expect(normalizeName('Lemons, raw, without peel')).toBe(normalizeName('LEMONS, RAW, WITHOUT PEEL'));
  });
  it('strips characters a SQL literal should never carry', () => {
    expect(normalizeName('Creme fraiche')).toMatch(/^[a-z0-9 -]+$/);
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
});

describe('buildSeed', () => {
  const { rows, dropped } = buildSeed({ foods, nutrients, categoryAisle: CATEGORY_AISLE, excluded: EXCLUDED });

  it('keeps only real food rows', () => {
    // fdc 4 is sub_sample_food, which is sampling metadata and not a food.
    expect(dropped.find(d => d.fdc_id === '4')?.reason).toMatch(/data_type/);
  });
  it('drops an excluded category', () => {
    expect(dropped.find(d => d.fdc_id === '3')?.reason).toMatch(/category/);
  });
  it('drops a lab-speak description', () => {
    expect(dropped.find(d => d.fdc_id === '2')?.reason).toMatch(/lab|separable/i);
  });
  it('drops a row with no calories rather than seeding a hole', () => {
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
});
