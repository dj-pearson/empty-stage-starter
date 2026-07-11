import { describe, it, expect } from 'vitest';
import { levenshtein, payloadEditDistance, MAX_DIFF_CHARS } from './editDistance';

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
