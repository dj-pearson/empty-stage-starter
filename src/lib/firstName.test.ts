import { describe, it, expect } from 'vitest';
import { firstName } from './firstName';

describe('firstName', () => {
  it('keeps only the first word', () => {
    expect(firstName('Ava Marie Smith')).toBe('Ava');
  });

  it('trims surrounding whitespace', () => {
    expect(firstName('  Leo ')).toBe('Leo');
  });

  it('returns an empty string for empty input', () => {
    expect(firstName('')).toBe('');
    expect(firstName('   ')).toBe('');
    expect(firstName(null)).toBe('');
  });

  it('splits on tabs and newlines too', () => {
    expect(firstName('Mia\tRose')).toBe('Mia');
  });
});
