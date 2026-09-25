import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateAge, kidAgeParts } from './utils';

describe('calculateAge in a timezone west of UTC', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Chicago';
    vi.useFakeTimers();
    // Noon on 2026-05-09 in Chicago.
    vi.setSystemTime(new Date('2026-05-09T17:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTz;
  });

  it('does not count the birthday a day early', () => {
    // new Date('2020-05-10') is UTC midnight, which is May 9 in Chicago.
    expect(calculateAge('2020-05-10')).toBe(5);
  });

  it('counts it on the day', () => {
    expect(calculateAge('2020-05-09')).toBe(6);
  });

  it('rejects a rolled-over date', () => {
    expect(calculateAge('2020-02-31')).toBeNull();
  });
});

describe('kidAgeParts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 9, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports 18 months as 1 year 6 months', () => {
    expect(kidAgeParts('2024-11-09')).toEqual({ years: 1, months: 6 });
  });

  it('reports 2 years 4 months', () => {
    expect(kidAgeParts('2024-01-09')).toEqual({ years: 2, months: 4 });
  });

  it('reports 7 years', () => {
    expect(kidAgeParts('2019-05-09')).toEqual({ years: 7, months: 0 });
  });

  it('does not count a month until its day arrives', () => {
    expect(kidAgeParts('2024-11-10')).toEqual({ years: 1, months: 5 });
  });

  it('falls back to the stored age when there is no date of birth', () => {
    expect(kidAgeParts(undefined, 4)).toEqual({ years: 4, months: 0 });
    expect(kidAgeParts('', 4)).toEqual({ years: 4, months: 0 });
  });

  it('returns null with neither', () => {
    expect(kidAgeParts(undefined)).toBeNull();
    expect(kidAgeParts(null, null)).toBeNull();
  });

  it('returns null for an invalid string', () => {
    expect(kidAgeParts('not a date', 4)).toBeNull();
    expect(kidAgeParts('2020-13-40')).toBeNull();
  });

  it('returns null for a future date of birth', () => {
    expect(kidAgeParts('2027-01-01')).toBeNull();
  });
});
