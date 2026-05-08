import { describe, it, expect } from 'vitest';
import { bucketPickiness, normalizeChainFoodName, deterministicUuid } from './chainNetwork';

describe('bucketPickiness', () => {
  it('returns unknown for null/empty', () => {
    expect(bucketPickiness(null)).toBe('unknown');
    expect(bucketPickiness('')).toBe('unknown');
    expect(bucketPickiness(undefined)).toBe('unknown');
  });

  it('matches direct labels case-insensitively', () => {
    expect(bucketPickiness('LOW')).toBe('low');
    expect(bucketPickiness('Medium')).toBe('medium');
    expect(bucketPickiness('high')).toBe('high');
  });

  it('recognizes friendly synonyms', () => {
    expect(bucketPickiness('not picky')).toBe('low');
    expect(bucketPickiness('Adventurous eater')).toBe('low');
    expect(bucketPickiness('very picky')).toBe('high');
    expect(bucketPickiness('severe ARFID')).toBe('high');
    expect(bucketPickiness('somewhat selective')).toBe('medium');
  });

  it('buckets numeric levels', () => {
    expect(bucketPickiness('2/10')).toBe('low');
    expect(bucketPickiness('5')).toBe('medium');
    expect(bucketPickiness('9 of 10')).toBe('high');
  });

  it('falls back to unknown when nothing matches', () => {
    expect(bucketPickiness('undefined garbage')).toBe('unknown');
  });
});

describe('normalizeChainFoodName', () => {
  it('returns empty for null/undefined', () => {
    expect(normalizeChainFoodName(null)).toBe('');
    expect(normalizeChainFoodName(undefined)).toBe('');
  });

  it('lowercases and trims', () => {
    expect(normalizeChainFoodName('  Mac & Cheese  ')).toBe('mac & cheese');
  });

  it("strips a leading 'the '", () => {
    expect(normalizeChainFoodName('The Best Mac')).toBe('best mac');
  });

  it('removes trivial punctuation', () => {
    expect(normalizeChainFoodName("Annie's Macaroni & Cheese!")).toBe('annies macaroni & cheese');
  });

  it('collapses internal whitespace', () => {
    expect(normalizeChainFoodName('apple    sauce')).toBe('apple sauce');
  });

  it("matches the server's normalization for common variants", () => {
    // These are the cases the server-side normalize_chain_food_name handles;
    // the client mirror exists to predict aggregation grouping for UI.
    expect(normalizeChainFoodName('Cheez-Its')).toBe('cheez-its');
    expect(normalizeChainFoodName("'Cheese cubes'")).toBe('cheese cubes');
  });
});

describe('deterministicUuid', () => {
  it('returns the same UUID for the same input', () => {
    const a = deterministicUuid('attempt-123:source-a');
    const b = deterministicUuid('attempt-123:source-a');
    expect(a).toBe(b);
  });

  it('returns different UUIDs for different inputs', () => {
    const a = deterministicUuid('attempt-123:source-a');
    const b = deterministicUuid('attempt-123:source-b');
    expect(a).not.toBe(b);
  });

  it('matches the canonical UUID shape (8-4-4-4-12)', () => {
    const u = deterministicUuid('test');
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
