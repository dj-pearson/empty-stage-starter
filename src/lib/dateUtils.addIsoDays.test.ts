import { describe, it, expect } from 'vitest';
import { addIsoDays } from './date-utils';

/**
 * US-818. copyWeekPlan built each destination date by parsing the target week
 * start, calling setDate(getDate() + offset), and formatting with
 * toISOString(). getDate() reads local, toISOString() writes UTC, and the two
 * disagree by a day once a DST transition falls between the two dates.
 *
 * These run under whatever TZ the machine has, so they pin the arithmetic
 * rather than the bug. The bug itself is pinned in PlanContext's own test,
 * which sets TZ.
 */
describe('addIsoDays', () => {
  it('adds whole days', () => {
    expect(addIsoDays('2026-03-01', 7)).toBe('2026-03-08');
  });

  it('crosses a month boundary', () => {
    expect(addIsoDays('2026-01-28', 5)).toBe('2026-02-02');
  });

  it('crosses a leap day', () => {
    expect(addIsoDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addIsoDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('crosses a year boundary', () => {
    expect(addIsoDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('subtracts', () => {
    expect(addIsoDays('2026-03-08', -7)).toBe('2026-03-01');
  });

  it('is unaffected by a US spring-forward transition', () => {
    // 2026-03-08 is the US DST transition. Six days past 2026-03-08 is the
    // 14th; the setDate/toISOString version returned the 13th.
    expect(addIsoDays('2026-03-08', 6)).toBe('2026-03-14');
  });

  it('is unaffected by a US fall-back transition', () => {
    // 2026-11-01 is the US return to standard time.
    expect(addIsoDays('2026-10-29', 5)).toBe('2026-11-03');
  });

  it('ignores a time component on the input', () => {
    expect(addIsoDays('2026-03-01T23:30:00Z', 1)).toBe('2026-03-02');
  });

  it('holds in the timezone that broke it', () => {
    // The bug needed a real timezone west of UTC to show up, so set one and
    // run both algorithms side by side. The naive version is reproduced here
    // deliberately: it is the thing this helper exists not to be.
    process.env.TZ = 'America/Los_Angeles';
    const naive = (isoDate: string, days: number) => {
      const d = new Date(isoDate);
      d.setDate(d.getDate() + days);
      return d.toISOString().split('T')[0];
    };
    expect(naive('2026-03-08', 6)).toBe('2026-03-13');
    expect(addIsoDays('2026-03-08', 6)).toBe('2026-03-14');
  });
});
