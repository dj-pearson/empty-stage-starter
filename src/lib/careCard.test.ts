import { describe, expect, it } from 'vitest';
import { buildCareCardText, type CareCardKid, type CareCardT } from './careCard';

/** Renders the English default with {{placeholders}} filled, like i18next would. */
const t: CareCardT = (_key, { defaultValue, ...values }) =>
  defaultValue.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? ''));

const maya: CareCardKid = {
  name: 'Maya',
  age: 4,
  allergens: ['peanuts', 'egg'],
  allergen_severity: { peanuts: 'severe' },
  cross_contamination_sensitive: true,
  always_eats_foods: ['toast', 'rice'],
  disliked_foods: ['broccoli'],
  texture_dislikes: ['slimy'],
  helpful_strategies: ['food_chaining'],
};

describe('buildCareCardText', () => {
  it('lists allergies with severity, then the cross-contact line', () => {
    const text = buildCareCardText(maya, t);
    expect(text).toContain('Maya, 4 years old');
    expect(text).toContain('Allergies: Peanuts (severe), Egg');
    expect(text).toMatch(/Cross-contact sensitive/);
    expect(text).toContain('Always eats: toast, rice');
    expect(text).toContain("Doesn't like right now: broccoli");
    expect(text).toContain('Texture dislikes: slimy');
    expect(text).toContain('What helps: food chaining');
  });

  it('says allergies are not recorded when unknown', () => {
    const text = buildCareCardText({ name: 'Leo', allergens: undefined }, t);
    expect(text).toContain('Allergies: not recorded');
    expect(text).not.toContain('No known allergies');
  });

  it('says no known allergies for an empty list', () => {
    const text = buildCareCardText({ name: 'Leo', allergens: [] }, t);
    expect(text).toContain('No known allergies');
    expect(text).not.toContain('not recorded');
  });
});
