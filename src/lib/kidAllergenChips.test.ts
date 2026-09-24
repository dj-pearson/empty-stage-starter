import { describe, expect, it } from 'vitest';
import { kidAllergenChips, kidAllergyState } from './kidAllergenChips';

describe('kidAllergenChips', () => {
  it('matches severity across spellings of the same allergen', () => {
    expect(kidAllergenChips({ allergens: ['Peanuts'], allergen_severity: { peanuts: 'severe' } })).toEqual([
      { key: 'peanut', label: 'Peanuts', severity: 'severe' },
    ]);
  });

  it('matches severity through a synonym', () => {
    const [chip] = kidAllergenChips({ allergens: ['dairy'], allergen_severity: { milk: 'moderate' } });
    expect(chip).toEqual({ key: 'milk', label: 'Dairy', severity: 'moderate' });
  });

  it('dedupes by canonical name, keeping the first spelling', () => {
    const chips = kidAllergenChips({ allergens: ['Peanut', 'peanuts'] });
    expect(chips).toHaveLength(1);
    expect(chips[0].label).toBe('Peanut');
  });

  it('sorts severe, moderate, mild, then unknown', () => {
    const chips = kidAllergenChips({
      allergens: ['egg', 'soy', 'tree_nuts', 'sesame'],
      allergen_severity: { egg: 'mild', 'tree nuts': 'severe', sesame: 'moderate' },
    });
    expect(chips.map((c) => [c.label, c.severity])).toEqual([
      ['Tree Nuts', 'severe'],
      ['Sesame', 'moderate'],
      ['Egg', 'mild'],
      ['Soy', null],
    ]);
  });

  it('ignores severity values outside the three levels', () => {
    const [chip] = kidAllergenChips({ allergens: ['egg'], allergen_severity: { egg: 'deadly' } });
    expect(chip.severity).toBeNull();
  });

  it('returns nothing for unknown or empty allergies', () => {
    expect(kidAllergenChips({ allergens: undefined })).toEqual([]);
    expect(kidAllergenChips({ allergens: [] })).toEqual([]);
  });
});

describe('kidAllergyState', () => {
  it('separates never recorded from none', () => {
    expect(kidAllergyState({ allergens: undefined })).toBe('unknown');
    expect(kidAllergyState({ allergens: [] })).toBe('none');
    expect(kidAllergyState({ allergens: ['egg'] })).toBe('listed');
  });
});
