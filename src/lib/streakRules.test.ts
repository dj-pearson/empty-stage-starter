import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  EMPTY_DAYS_FORGIVEN,
  REFUSAL_BREAKS_STREAK,
  bestStreak,
  currentStreak,
} from './streakRules';

/**
 * US-781: there were three streak rules in this product and they disagreed.
 *
 * Home.tsx counted any day with a result and broke on the first gap.
 * ProgressDashboard.tsx counted any day with an ENTRY, never reading the
 * result, and forgave one empty day. BadgeService.swift counted a try-bite
 * day, broke on a pure refusal, and forgave one empty day.
 *
 * So a child who refused everything yesterday had a live streak on the web and
 * a broken one on the phone, and the two web numbers disagreed with each other
 * as well. The decision, recorded in PLATFORMS.md, is that the phone's rule
 * wins: it is what ships, and a streak that survives a day of pure refusals is
 * counting that the app was opened rather than that anything was tried.
 */

const TODAY = '2026-09-18';

/** Days back from TODAY, as the ISO key the rule walks. */
const day = (offset: number) => {
  const [y, m, d] = TODAY.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - offset));
  return date.toISOString().slice(0, 10);
};

const entry = (offset: number, result: string | null, kidId = 'ana') => ({
  date: day(offset),
  kid_id: kidId,
  result,
});

const streak = (entries: Array<ReturnType<typeof entry>>, kidId = 'ana') =>
  currentStreak(entries, kidId, { todayKey: TODAY });

describe('currentStreak matches the rule the phone ships', () => {
  it('counts consecutive try-bite days', () => {
    expect(streak([entry(0, 'ate'), entry(1, 'tasted'), entry(2, 'ate')])).toBe(3);
  });

  it('ends on a day of nothing but refusals', () => {
    // The consequential difference between the web rules and the phone's.
    expect(streak([entry(0, 'ate'), entry(1, 'refused'), entry(2, 'ate')])).toBe(1);
  });

  it('does not end when a refusal shares the day with a try-bite', () => {
    // A child who refused broccoli and ate the pasta still tried something.
    expect(streak([entry(0, 'refused'), entry(0, 'ate'), entry(1, 'ate')])).toBe(2);
  });

  it('forgives one empty day and ends on the second', () => {
    expect(streak([entry(0, 'ate'), /* day 1 empty */ entry(2, 'ate')])).toBe(2);
    expect(streak([entry(0, 'ate'), /* days 1 and 2 empty */ entry(3, 'ate')])).toBe(1);
  });

  it('forgives today, so an unlogged morning does not zero the streak', () => {
    expect(streak([entry(1, 'ate'), entry(2, 'ate')])).toBe(2);
  });

  it('restores the skip budget after a productive day', () => {
    // ate, gap, ate, gap, ate -- each gap is spent and then refunded.
    expect(streak([entry(0, 'ate'), entry(2, 'ate'), entry(4, 'ate')])).toBe(3);
  });

  it('ignores an entry with no result recorded', () => {
    expect(streak([entry(0, null), entry(1, 'ate')])).toBe(1);
  });

  it('returns zero for a child with nothing logged', () => {
    expect(streak([])).toBe(0);
  });
});

describe('a streak belongs to one child', () => {
  it('does not let one sibling keep another sibling streak alive', () => {
    // The defect this story fixed first: Home.tsx counted over the UNFILTERED
    // entries while the filtered list sat one line above it, so in a
    // two-child household either child eating kept the other one going.
    const entries = [entry(0, 'ate'), entry(1, 'ate'), entry(2, 'ate')];
    expect(streak(entries, 'ana')).toBe(3);
    expect(streak(entries, 'ben')).toBe(0);
  });

  it('reads the camelCase key the native shape uses too', () => {
    const entries = [{ date: day(0), kidId: 'ana', result: 'ate' }];
    expect(currentStreak(entries, 'ana', { todayKey: TODAY })).toBe(1);
  });
});

describe('the kinder rule is one constant away', () => {
  it('ships with the refusal rule on', () => {
    expect(REFUSAL_BREAKS_STREAK).toBe(true);
    expect(EMPTY_DAYS_FORGIVEN).toBe(1);
  });

  it('forgives a refusal when that constant is flipped', () => {
    // The whole difference between the two readings. If the product decides a
    // discouraged parent matters more than the measurement, this is the edit.
    const entries = [entry(0, 'ate'), entry(1, 'refused'), entry(2, 'ate')];
    expect(currentStreak(entries, 'ana', { todayKey: TODAY, refusalBreaks: false })).toBe(2);
  });
});

describe('bestStreak uses the same rule as currentStreak', () => {
  it('finds a past run that today is not part of', () => {
    const entries = [
      entry(10, 'ate'), entry(11, 'ate'), entry(12, 'ate'), entry(13, 'ate'),
      entry(0, 'ate'),
    ];
    expect(bestStreak(entries, 'ana', { todayKey: TODAY })).toBe(4);
  });

  it('is zero when nothing was ever logged', () => {
    expect(bestStreak([], 'ana', { todayKey: TODAY })).toBe(0);
  });

  it('never reports less than the current streak', () => {
    const entries = [entry(0, 'ate'), entry(1, 'ate')];
    const now = currentStreak(entries, 'ana', { todayKey: TODAY });
    expect(bestStreak(entries, 'ana', { todayKey: TODAY })).toBeGreaterThanOrEqual(now);
  });
});

/**
 * The count of implementations. Three rules over the same data produced three
 * numbers, and a fourth would go unnoticed the same way these did.
 */
describe('there is one web streak rule', () => {
  it('the home week line and AchievementsView.tsx both call the shared one', () => {
    // AchievementsView was the FOURTH, missed when this story counted three:
    // it filtered to entries with a result but still never read what the
    // result was, so a week of refusals unlocked a streak badge on the web
    // while the phone showed nothing.
    for (const file of [
      // The streak moved off Home.tsx into the per-kid week line when the
      // home screen was rebuilt; Home.tsx itself no longer counts anything.
      'src/components/home/KidWeekLine.tsx',
      'src/components/AchievementsView.tsx',
    ]) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, `${file} should import the shared rule`).toMatch(
        /import \{ currentStreak \} from ["']@\/lib\/streakRules["']/,
      );
      // And not walk the calendar itself any more.
      expect(source, `${file} still walks days on its own`).not.toMatch(
        /for \(let d = 0; d <= 365/,
      );
    }
  });

  it('ProgressDashboard.tsx no longer computes a streak at all', () => {
    // The months view reads durable attempts and ladder rows. A streak there
    // would need the -30d plan cache, which is what made it disagree before.
    const source = fs.readFileSync('src/components/ProgressDashboard.tsx', 'utf8');
    expect(source).not.toMatch(/@\/lib\/streakRules/);
    expect(source).not.toMatch(/currentStreak\(/);
    expect(source).not.toMatch(/\bplanEntries\b|usePlan\(/);
  });

  it('the phone still has its own copy, and PLATFORMS.md says so', () => {
    // Swift cannot import TypeScript. What this holds is that the two are
    // described together: if BadgeService changes, PLATFORMS.md is the file
    // that has to change with it.
    const ios = fs.readFileSync('ios/EatPal/EatPal/Services/BadgeService.swift', 'utf8');
    expect(ios).toContain('func currentStreak(');

    const platforms = fs.readFileSync('PLATFORMS.md', 'utf8');
    expect(platforms).toContain('src/lib/streakRules.ts');
    expect(platforms).toContain('BadgeService.swift');
    expect(platforms).toMatch(/Decision/);
  });
});
