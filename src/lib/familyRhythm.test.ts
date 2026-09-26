import { describe, expect, it } from 'vitest';
import { addIsoDays } from '@/lib/date-utils';
import type { KidAttemptRow } from '@/lib/kidProgress';
import {
  EXPOSURE_TARGET,
  GRACE_SPACING_DAYS,
  WEEKLY_GOAL_DAYS,
  exposureCounts,
  familyMilestones,
  isoDayDiff,
  lastWeekRecap,
  loggedDaySet,
  mondayOf,
  parentStreak,
  weekMeter,
} from './familyRhythm';

const TODAY = '2026-09-24'; // a Thursday

const attempt = (day: string, extra: Partial<KidAttemptRow> = {}): KidAttemptRow => ({
  kid_id: 'kid-a',
  food_id: 'broccoli',
  attempted_at: day,
  outcome: 'refused',
  ...extra,
});

/** Days as offsets back from TODAY. */
const daysBack = (...offsets: number[]) => new Set(offsets.map((o) => addIsoDays(TODAY, -o)));

/**
 * The rule stated the slow way: walk back from `today` (neutral when unlogged),
 * count logged days, forgive a miss when it is the first one met or at least
 * GRACE_SPACING_DAYS before the previous forgiven miss, stop otherwise.
 */
function referenceStreak(days: ReadonlySet<string>, today: string): number {
  const earliest = [...days].sort()[0];
  if (!earliest) return 0;
  let count = 0;
  let laterMiss: string | null = null;
  for (let day = today; day >= earliest; day = addIsoDays(day, -1)) {
    if (days.has(day)) {
      count += 1;
      continue;
    }
    if (day === today) continue;
    if (laterMiss !== null && isoDayDiff(day, laterMiss) < GRACE_SPACING_DAYS) break;
    laterMiss = day;
  }
  return count;
}

describe('parentStreak', () => {
  it('is zero with nothing logged', () => {
    expect(parentStreak(new Set(), TODAY)).toMatchObject({ current: 0, best: 0, atRisk: false });
  });

  it('counts consecutive logged days, today included', () => {
    const s = parentStreak(daysBack(0, 1, 2, 3), TODAY);
    expect(s.current).toBe(4);
    expect(s.loggedToday).toBe(true);
    expect(s.graceReadyOn).toBeNull();
  });

  it('does not treat an unlogged today as a miss', () => {
    const s = parentStreak(daysBack(1, 2, 3), TODAY);
    expect(s.current).toBe(3);
    expect(s.atRisk).toBe(false);
  });

  it('forgives one missed day and says when the next grace day is ready', () => {
    const s = parentStreak(daysBack(0, 1, 3, 4, 5), TODAY);
    expect(s.current).toBe(5);
    expect(s.graceReadyOn).toBe(addIsoDays(TODAY, -2 + GRACE_SPACING_DAYS));
  });

  it('ends on a second miss inside the grace window', () => {
    // Missed 2 and 5 days ago: three apart, so the older miss is not forgiven.
    const s = parentStreak(daysBack(0, 1, 3, 4, 6, 7, 8), TODAY);
    expect(s.current).toBe(4);
    expect(s.best).toBe(5);
  });

  it('forgives misses spaced a week apart', () => {
    const s = parentStreak(daysBack(0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14), TODAY);
    // One miss (7 days ago) inside 15 days: 14 logged days.
    expect(s.current).toBe(14);
  });

  it('flags a live streak at risk when yesterday used the grace day', () => {
    const s = parentStreak(daysBack(2, 3, 4), TODAY);
    expect(s.current).toBe(3);
    expect(s.atRisk).toBe(true);
  });

  it('records the first day each length was reached', () => {
    const s = parentStreak(daysBack(0, 1, 2), TODAY);
    expect(s.reachedOn.get(1)).toBe(addIsoDays(TODAY, -2));
    expect(s.reachedOn.get(3)).toBe(TODAY);
  });

  it('matches the walk-back reference on random histories', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let run = 0; run < 300; run += 1) {
      const density = 0.4 + random() * 0.55;
      const days = new Set<string>();
      for (let i = 0; i < 80; i += 1) if (random() < density) days.add(addIsoDays(TODAY, -i));
      expect(parentStreak(days, TODAY).current, `run ${run}`).toBe(referenceStreak(days, TODAY));
      // And from a past day, where that day is logged.
      const pastDay = addIsoDays(TODAY, -Math.floor(random() * 40));
      if (days.has(pastDay)) {
        const upToPast = new Set([...days].filter((d) => d <= pastDay));
        expect(parentStreak(upToPast, pastDay).current).toBe(referenceStreak(upToPast, pastDay));
      }
    }
  });
});

describe('loggedDaySet', () => {
  it('reads local days, skips the future and rows with no date', () => {
    const days = loggedDaySet(
      [attempt(TODAY), attempt(addIsoDays(TODAY, 1)), attempt('', {}), { ...attempt(TODAY), attempted_at: null }],
      TODAY,
    );
    expect([...days]).toEqual([TODAY]);
  });
});

describe('weekMeter', () => {
  it('runs Monday to Sunday and counts logged days toward the goal', () => {
    expect(mondayOf(TODAY)).toBe('2026-09-21');
    expect(mondayOf('2026-09-27')).toBe('2026-09-21'); // Sunday
    expect(mondayOf('2026-09-21')).toBe('2026-09-21');

    const m = weekMeter(new Set(['2026-09-21', '2026-09-23', '2026-09-20']), TODAY);
    expect(m.days.map((d) => d.day)).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
    expect(m.loggedCount).toBe(2);
    expect(m.goal).toBe(WEEKLY_GOAL_DAYS);
    expect(m.reached).toBe(false);
    expect(m.days[3]).toMatchObject({ isToday: true, isFuture: false });
    expect(m.days[4].isFuture).toBe(true);
  });
});

describe('lastWeekRecap', () => {
  it('summarizes the previous Monday-Sunday and counts only first-ever offers as new', () => {
    const recap = lastWeekRecap(
      [
        attempt('2026-09-01', { food_id: 'pea' }), // offered before: not new last week
        attempt('2026-09-15', { food_id: 'pea', outcome: 'success' }),
        attempt('2026-09-16', { food_id: 'carrot', outcome: 'partial' }),
        attempt('2026-09-16', { food_id: 'carrot', kid_id: 'kid-b' }),
        attempt('2026-09-20', { food_id: 'kiwi' }),
        attempt('2026-09-22', { food_id: 'fig' }), // this week
      ],
      TODAY,
    );
    expect(recap).toEqual({
      startIso: '2026-09-14',
      endIso: '2026-09-20',
      daysLogged: 3,
      offers: 4,
      newFoodsOffered: 3,
      accepted: 2,
    });
  });
});

describe('exposureCounts', () => {
  it('counts every offer per child and food, refusals included', () => {
    const counts = exposureCounts([
      attempt('2026-09-01'),
      attempt('2026-09-02', { outcome: 'success' }),
      attempt('2026-09-02', { kid_id: 'kid-b' }),
    ]);
    expect(counts.get('kid-a|broccoli')).toBe(2);
    expect(counts.get('kid-b|broccoli')).toBe(1);
  });
});

describe('familyMilestones', () => {
  it('dates each milestone from the history and leaves the rest locked with progress', () => {
    const history: KidAttemptRow[] = [];
    // Ten straight days of broccoli refusals ending today, plus five new foods.
    for (let i = 9; i >= 0; i -= 1) history.push(attempt(addIsoDays(TODAY, -i)));
    for (const food of ['a', 'b', 'c', 'd']) history.push(attempt(addIsoDays(TODAY, -3), { food_id: food }));

    const byId = new Map(familyMilestones(history, TODAY).map((m) => [m.id, m]));
    expect(byId.get('first_log')?.earnedOn).toBe(addIsoDays(TODAY, -9));
    expect(byId.get('days_7')?.earnedOn).toBe(addIsoDays(TODAY, -3));
    expect(byId.get('streak_7')?.earnedOn).toBe(addIsoDays(TODAY, -3));
    expect(byId.get('new_foods_5')?.earnedOn).toBe(addIsoDays(TODAY, -3));
    // Ten refusals of one food is the persistence milestone. It is not about eating.
    expect(byId.get('stuck_with_it')).toMatchObject({ earnedOn: TODAY, progress: EXPOSURE_TARGET });
    expect(byId.get('days_30')).toMatchObject({ earnedOn: null, progress: 10, target: 30 });
    expect(byId.get('streak_21')).toMatchObject({ earnedOn: null, progress: 10 });
  });

  it('ignores attempts dated after today', () => {
    const byId = new Map(familyMilestones([attempt(addIsoDays(TODAY, 2))], TODAY).map((m) => [m.id, m]));
    expect(byId.get('first_log')?.earnedOn).toBeNull();
  });
});
