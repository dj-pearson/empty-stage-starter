import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cn, generateId, debounce, calculateAge } from './utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', true && 'active', false && 'inactive')).toBe('base active');
  });

  it('merges tailwind classes correctly', () => {
    expect(cn('p-4', 'p-6')).toBe('p-6');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('handles empty inputs', () => {
    expect(cn()).toBe('');
    expect(cn('')).toBe('');
  });

  it('handles undefined and null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar');
  });

  it('handles array inputs', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar');
  });
});

describe('generateId', () => {
  it('returns a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('contains a hyphen separator', () => {
    expect(generateId()).toContain('-');
  });

  it('starts with timestamp-like number', () => {
    const id = generateId();
    const timestamp = parseInt(id.split('-')[0]);
    expect(timestamp).toBeGreaterThan(0);
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('delays function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('resets timer on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    debounced();
    vi.advanceTimersByTime(100);
    debounced();
    vi.advanceTimersByTime(100);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('passes arguments to debounced function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('arg1', 'arg2');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('uses last call arguments when called multiple times', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('first');
    debounced('second');
    debounced('third');

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('third');
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe('calculateAge', () => {
  it('returns null for null input', () => {
    expect(calculateAge(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(calculateAge(undefined)).toBeNull();
  });

  it('returns null for future dates', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    expect(calculateAge(futureDate.toISOString())).toBeNull();
  });

  it('returns null for dates before 1900', () => {
    expect(calculateAge('1899-01-01')).toBeNull();
  });

  it('calculates age from date string', () => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    twoYearsAgo.setMonth(0, 1); // Jan 1
    const age = calculateAge(twoYearsAgo.toISOString());
    expect(age).toBeGreaterThanOrEqual(1);
    expect(age).toBeLessThanOrEqual(3);
  });

  it('calculates age from Date object', () => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 10);
    date.setMonth(0, 1);
    const age = calculateAge(date);
    expect(age).toBeGreaterThanOrEqual(9);
    expect(age).toBeLessThanOrEqual(11);
  });

  it('handles birthday not yet occurred this year', () => {
    const today = new Date();
    const futureMonthBirthday = new Date(
      today.getFullYear() - 5,
      11, // December
      31
    );
    const age = calculateAge(futureMonthBirthday);
    // If December 31 hasn't happened yet, age should be 4
    if (today.getMonth() < 11 || (today.getMonth() === 11 && today.getDate() < 31)) {
      expect(age).toBe(4);
    } else {
      expect(age).toBe(5);
    }
  });
});
