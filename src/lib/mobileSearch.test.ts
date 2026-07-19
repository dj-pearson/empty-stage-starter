import { describe, it, expect } from 'vitest';
import { normalizeText, tokenize, matchScore, searchRank } from './mobileSearch';

describe('normalizeText', () => {
  it('lowercases, strips diacritics and trims', () => {
    expect(normalizeText('  Jalapeño ')).toBe('jalapeno');
    expect(normalizeText('CAFÉ')).toBe('cafe');
  });
});

describe('tokenize', () => {
  it('splits on whitespace and drops empties', () => {
    expect(tokenize('  chicken   rice ')).toEqual(['chicken', 'rice']);
    expect(tokenize('')).toEqual([]);
  });
});

describe('matchScore', () => {
  it('returns 1 (neutral) for an empty query', () => {
    expect(matchScore('', [{ value: 'anything' }])).toBe(1);
  });

  it('is token-order independent', () => {
    const fields = [{ value: 'Rice with chicken' }];
    expect(matchScore('chicken rice', fields)).toBeGreaterThan(0);
    expect(matchScore('rice chicken', fields)).toBeGreaterThan(0);
  });

  it('fails when any token is missing', () => {
    expect(matchScore('chicken tofu', [{ value: 'Rice with chicken' }])).toBe(0);
  });

  it('is diacritic-insensitive', () => {
    expect(matchScore('jalapeno', [{ value: 'Jalapeño Poppers' }])).toBeGreaterThan(0);
  });

  it('ranks exact/prefix above buried substring', () => {
    const exact = matchScore('milk', [{ value: 'milk' }]);
    const prefix = matchScore('milk', [{ value: 'milkshake' }]);
    const buried = matchScore('milk', [{ value: 'buttermilk' }]);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(buried);
  });

  it('weights stronger fields higher', () => {
    const nameHit = matchScore('taco', [
      { value: 'Taco night', weight: 3 },
      { value: '', weight: 1 },
    ]);
    const descHit = matchScore('taco', [
      { value: 'Dinner', weight: 3 },
      { value: 'taco filling', weight: 1 },
    ]);
    expect(nameHit).toBeGreaterThan(descHit);
  });

  it('returns 0 when there are no non-empty fields', () => {
    expect(matchScore('x', [{ value: null }, { value: undefined }, { value: '' }])).toBe(0);
  });
});

describe('searchRank', () => {
  const items = [
    { id: 'a', name: 'Buttermilk pancakes' },
    { id: 'b', name: 'Milk' },
    { id: 'c', name: 'Milkshake' },
    { id: 'd', name: 'Orange juice' },
  ];
  const fields = (i: { name: string }) => [{ value: i.name }];

  it('returns the original list for an empty query', () => {
    expect(searchRank(items, '', fields)).toBe(items);
  });

  it('filters out non-matches and ranks best first', () => {
    const result = searchRank(items, 'milk', fields).map((i) => i.id);
    expect(result).toContain('b');
    expect(result).not.toContain('d');
    // exact "Milk" ranks above prefix "Milkshake" above buried "Buttermilk".
    expect(result.indexOf('b')).toBeLessThan(result.indexOf('c'));
    expect(result.indexOf('c')).toBeLessThan(result.indexOf('a'));
  });
});
