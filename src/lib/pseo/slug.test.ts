import { describe, it, expect } from 'vitest';
import { slugFromPathname, pathnameForSlug } from './slug';
import { buildSlug } from './generator';

describe('slugFromPathname', () => {
  it('strips the /guides mount point', () => {
    expect(slugFromPathname('/guides/food-chaining/chicken-nuggets')).toBe(
      'food-chaining/chicken-nuggets'
    );
  });

  it('handles the deeper 3-segment page types', () => {
    // These previously had NO matching route at all: /food-chaining/:a/:b was the only
    // multi-segment pSEO route, so challenges/* and age/* combos were unreachable.
    expect(slugFromPathname('/guides/challenges/arfid/dinner')).toBe('challenges/arfid/dinner');
    expect(slugFromPathname('/guides/age/toddler/breakfast')).toBe('age/toddler/breakfast');
  });

  it('handles single-segment landing pages', () => {
    expect(slugFromPathname('/guides/meals/breakfast')).toBe('meals/breakfast');
  });

  it('tolerates a trailing slash', () => {
    expect(slugFromPathname('/guides/food-chaining/pasta/')).toBe('food-chaining/pasta');
  });

  it('returns null for the bare mount point', () => {
    expect(slugFromPathname('/guides')).toBeNull();
    expect(slugFromPathname('/guides/')).toBeNull();
  });

  it('round-trips with pathnameForSlug', () => {
    const slug = 'food-chaining/mac-and-cheese';
    expect(slugFromPathname(pathnameForSlug(slug))).toBe(slug);
  });
});

describe('generator slug format matches the route contract', () => {
  // The bug this pins: buildSlug already emits a multi-segment path with its own
  // prefix, and generator.ts writes canonical_url as `/guides/${slug}`. The router must
  // therefore serve /guides/<multi-segment>, not a fixed-arity /:safeFood route.
  it('buildSlug produces a multi-segment path that resolves under /guides', () => {
    const slug = buildSlug('FOOD_CHAINING_GUIDE', { safeFood: 'Chicken Nuggets' });
    expect(slug).toBe('food-chaining/chicken-nuggets');
    expect(pathnameForSlug(slug)).toBe('/guides/food-chaining/chicken-nuggets');
    expect(slugFromPathname(pathnameForSlug(slug))).toBe(slug);
  });

  it('3-dimension page types round-trip too', () => {
    const slug = buildSlug('CHALLENGE_MEAL_OCCASION', {
      challenge: 'ARFID',
      mealOccasion: 'Dinner',
    });
    expect(slug).toBe('challenges/arfid/dinner');
    expect(slugFromPathname(pathnameForSlug(slug))).toBe(slug);
  });
});
