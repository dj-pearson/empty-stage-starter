import { describe, it, expect } from 'vitest';
import { lockedBadgeHint, mondayOf, thisWeekResults } from './badgeHints';

// 2026-09-24 is a Thursday.
const TODAY = '2026-09-24';
const e = (date: string, result: string | null, kid_id = 'ana') => ({ date, result, kid_id });

describe('mondayOf', () => {
  it('snaps to Monday, Monday itself included', () => {
    expect(mondayOf('2026-09-24')).toBe('2026-09-21');
    expect(mondayOf('2026-09-21')).toBe('2026-09-21');
    expect(mondayOf('2026-09-27')).toBe('2026-09-21');
  });
});

describe('thisWeekResults', () => {
  it('keeps this week, recorded, up to today, for one child, oldest first', () => {
    const rows = thisWeekResults(
      [e('2026-09-23', 'ate'), e('2026-09-20', 'ate'), e('2026-09-25', 'ate'), e('2026-09-22', null), e('2026-09-21', 'ate', 'ben'), e('2026-09-21', 'tasted')],
      'ana',
      TODAY,
    );
    expect(rows.map((r) => r.date)).toEqual(['2026-09-21', '2026-09-23']);
  });
});

describe('lockedBadgeHint', () => {
  it('counts every logged result this week for perfectWeek', () => {
    expect(lockedBadgeHint('perfectWeek', 5, [e('2026-09-22', 'ate'), e('2026-09-23', 'tasted')], 'ana', TODAY)).toEqual({
      progress: 2,
      total: 5,
    });
  });

  it('counts a refusal toward perfectWeek instead of hiding the bar', () => {
    expect(
      lockedBadgeHint('perfectWeek', 5, [e('2026-09-22', 'refused'), e('2026-09-23', 'ate')], 'ana', TODAY),
    ).toEqual({ progress: 2, total: 5 });
  });

  it('uses the shared streak rule for streak badges', () => {
    const hint = lockedBadgeHint('fiveDayStreak', 5, [e('2026-09-23', 'ate'), e('2026-09-24', 'tasted')], 'ana', TODAY);
    expect(hint).toEqual({ progress: 2, total: 5 });
  });

  it('shows no bar for counts the web cannot see in full', () => {
    expect(lockedBadgeHint('consistentTracker', 30, [e('2026-09-23', 'ate')], 'ana', TODAY)).toBeNull();
    expect(lockedBadgeHint('recipeChef', 5, [], 'ana', TODAY)).toBeNull();
  });
});
