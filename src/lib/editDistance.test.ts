import { describe, it, expect } from 'vitest';
import { levenshtein, osaDistance, payloadEditDistance, MAX_DIFF_CHARS } from './editDistance';

describe('levenshtein', () => {
  it('is zero for identical strings', () => {
    expect(levenshtein('', '')).toBe(0);
    expect(levenshtein('abc', 'abc')).toBe(0);
  });

  it('equals the other length when one side is empty', () => {
    expect(levenshtein('', 'hello')).toBe(5);
    expect(levenshtein('world', '')).toBe(5);
  });

  it('counts single-character edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('flaw', 'lawn')).toBe(2);
    expect(levenshtein('abc', 'abd')).toBe(1);
  });

  it('is symmetric', () => {
    expect(levenshtein('sunday', 'saturday')).toBe(levenshtein('saturday', 'sunday'));
  });

  it('bounds each side to MAX_DIFF_CHARS', () => {
    const a = 'x'.repeat(MAX_DIFF_CHARS + 500);
    const b = 'y'.repeat(MAX_DIFF_CHARS + 500);
    // Both truncated to MAX_DIFF_CHARS, all substitutions -> exactly MAX_DIFF_CHARS.
    expect(levenshtein(a, b)).toBe(MAX_DIFF_CHARS);
  });
});

describe('payloadEditDistance', () => {
  it('is zero for equal payloads', () => {
    expect(payloadEditDistance({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(0);
  });

  it('reflects the size of the edit', () => {
    const d = payloadEditDistance({ subject: 'Hi there' }, { subject: 'Hello there' });
    expect(d).toBeGreaterThan(0);
  });

  it('tolerates null/undefined payloads', () => {
    expect(payloadEditDistance(null, null)).toBe(0);
    expect(payloadEditDistance(undefined, {})).toBe(0);
  });
});

/**
 * US-692: optimal string alignment. The property that matters is the one
 * classic Levenshtein gets wrong for human input — an adjacent swap is one
 * mistake, not two — because the item resolver divides distance by string
 * length and therefore inherited a dependence on how long a word happened
 * to be.
 */
describe('osaDistance', () => {
  it('agrees with levenshtein when there is no transposition', () => {
    for (const [a, b] of [
      ['', ''],
      ['a', ''],
      ['', 'abc'],
      ['kitten', 'sitting'],
      ['chicken', 'chiken'],
      ['flour', 'flower'],
      ['same', 'same'],
    ] as const) {
      expect(osaDistance(a, b)).toBe(levenshtein(a, b));
    }
  });

  it('charges one edit for an adjacent transposition where levenshtein charges two', () => {
    expect(osaDistance('milk', 'mikl')).toBe(1);
    expect(levenshtein('milk', 'mikl')).toBe(2);
    expect(osaDistance('breast', 'braest')).toBe(1);
    expect(levenshtein('breast', 'braest')).toBe(2);
  });

  it('is symmetric', () => {
    for (const [a, b] of [
      ['milk whole', 'mikl whole'],
      ['kitten', 'sitting'],
      ['abcd', 'badc'],
    ] as const) {
      expect(osaDistance(a, b)).toBe(osaDistance(b, a));
    }
  });

  it('is zero only for identical strings', () => {
    expect(osaDistance('chicken breast', 'chicken breast')).toBe(0);
    expect(osaDistance('chicken breast', 'chicken breasts')).toBeGreaterThan(0);
  });

  it('counts two separate transpositions separately', () => {
    // "badc" is "abcd" with two independent adjacent swaps.
    expect(osaDistance('abcd', 'badc')).toBe(2);
  });

  it('never exceeds the length of the longer string', () => {
    for (const [a, b] of [
      ['chicken', 'xyz'],
      ['a', 'bbbbbbbb'],
      ['', 'abcdef'],
    ] as const) {
      expect(osaDistance(a, b)).toBeLessThanOrEqual(Math.max(a.length, b.length));
    }
  });

  it('bounds huge inputs the same way levenshtein does', () => {
    const long = 'a'.repeat(MAX_DIFF_CHARS + 500);
    expect(() => osaDistance(long, long + 'b')).not.toThrow();
    expect(osaDistance(long, long)).toBe(0);
  });

  it('leaves levenshtein untouched for its US-514 payload callers', () => {
    // The approval-feedback scoring is calibrated against the classic metric
    // and a JSON payload diff has no notion of a typo.
    expect(levenshtein('milk', 'mikl')).toBe(2);
  });
});
