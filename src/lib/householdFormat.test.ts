import { describe, it, expect } from 'vitest';
import { formatJoinedDate, formatRelativeFromNow, initialsFor, isExpired } from './householdFormat';

const NOW = Date.parse('2026-03-10T12:00:00Z');
const at = (ms: number) => new Date(NOW + ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatRelativeFromNow', () => {
  it('picks minutes, hours or days', () => {
    expect(formatRelativeFromNow(at(30 * MINUTE), 'en', NOW)).toBe('in 30 minutes');
    expect(formatRelativeFromNow(at(3 * HOUR), 'en', NOW)).toBe('in 3 hours');
    expect(formatRelativeFromNow(at(2 * DAY), 'en', NOW)).toBe('in 2 days');
  });

  it('gives the past form for a past time', () => {
    expect(formatRelativeFromNow(at(-2 * HOUR), 'en', NOW)).toBe('2 hours ago');
  });

  it('returns an empty string for an invalid time', () => {
    expect(formatRelativeFromNow('not a date', 'en', NOW)).toBe('');
    expect(formatRelativeFromNow('', 'en', NOW)).toBe('');
  });
});

describe('isExpired', () => {
  it('is true for a past or invalid time and false for a future one', () => {
    expect(isExpired(at(-MINUTE), NOW)).toBe(true);
    expect(isExpired('garbage', NOW)).toBe(true);
    expect(isExpired(at(MINUTE), NOW)).toBe(false);
  });
});

describe('formatJoinedDate', () => {
  it('formats a short month, day and year', () => {
    expect(formatJoinedDate('2026-01-05T12:00:00Z', 'en-US')).toMatch(/Jan 5, 2026/);
  });

  it('returns an empty string for an invalid time', () => {
    expect(formatJoinedDate('nope', 'en-US')).toBe('');
  });
});

describe('initialsFor', () => {
  it('takes up to two initials from the name', () => {
    expect(initialsFor('Dana Baker', 'X')).toBe('DB');
    expect(initialsFor('  dana  lee baker ', 'X')).toBe('DL');
    expect(initialsFor('dana', 'X')).toBe('D');
  });

  it('falls back to the first letter of the fallback', () => {
    expect(initialsFor(null, 'Parent')).toBe('P');
    expect(initialsFor('   ', 'guardian')).toBe('G');
  });
});
