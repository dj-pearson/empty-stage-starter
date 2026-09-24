import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  buildProgressByKid,
  buildWeeklyTrend,
  pickWeekHeadline,
  summarizeKidWeek,
  windowStartIso,
  type KidLadderRow,
  type KidAttemptRow,
  type TrendPlanEntryLike,
  type WeekBucket,
} from './kidProgress';
import { addIsoDays } from '@/lib/date-utils';
import type { PlanEntry } from '@/types';

const TODAY = '2026-09-24';

function entry(date: string, result: PlanEntry['result'], kid_id = 'k1'): Pick<PlanEntry, 'kid_id' | 'date' | 'result'> {
  return { kid_id, date, result };
}

describe('summarizeKidWeek', () => {
  it('excludes future entries', () => {
    const out = summarizeKidWeek([entry('2026-09-25', 'ate'), entry(TODAY, 'ate')], 'k1', TODAY);
    expect(out.ate).toBe(1);
    expect(out.offered).toBe(1);
  });

  it('excludes entries with no recorded result', () => {
    const out = summarizeKidWeek([entry(TODAY, null), entry(TODAY, 'refused')], 'k1', TODAY);
    expect(out.offered).toBe(1);
    expect(out.refused).toBe(1);
  });

  it("counts 'tasted' on its own and in offered", () => {
    const out = summarizeKidWeek(
      [entry(TODAY, 'ate'), entry(TODAY, 'tasted'), entry(TODAY, 'tasted'), entry(TODAY, 'refused')],
      'k1',
      TODAY,
    );
    expect(out).toMatchObject({ ate: 1, tasted: 2, refused: 1, offered: 4 });
  });

  it('keeps the last seven days, today included, and drops older ones', () => {
    const out = summarizeKidWeek(
      [entry('2026-09-18', 'ate'), entry('2026-09-17', 'ate'), entry(TODAY, 'ate')],
      'k1',
      TODAY,
    );
    expect(out.ate).toBe(2);
  });

  it("ignores another kid's entries", () => {
    const out = summarizeKidWeek([entry(TODAY, 'ate', 'k2'), entry(TODAY, 'refused')], 'k1', TODAY);
    expect(out).toMatchObject({ ate: 0, refused: 1, offered: 1 });
  });

  it('counts mastered and active ladder rows for this kid only', () => {
    const ladder: KidLadderRow[] = [
      { kid_id: 'k1', food_id: 'f1', status: 'mastered', current_rung: 'full_portion' },
      { kid_id: 'k1', food_id: 'f2', status: 'active', current_rung: 'licking' },
      { kid_id: 'k1', food_id: 'f3', status: 'active', current_rung: 'small_bite' },
      { kid_id: 'k1', food_id: 'f4', status: 'paused', current_rung: 'looking' },
      { kid_id: 'k2', food_id: 'f5', status: 'mastered', current_rung: 'full_portion' },
    ];
    const out = summarizeKidWeek([], 'k1', TODAY, ladder, [], new Map([['f3', 'Broccoli']]));
    expect(out.mastered).toBe(1);
    expect(out.activeLadder).toEqual([
      { foodId: 'f3', foodName: 'Broccoli', rung: 5 },
      { foodId: 'f2', rung: 3 },
    ]);
  });

  it('counts distinct foods attempted in the window', () => {
    const attempts: KidAttemptRow[] = [
      { kid_id: 'k1', food_id: 'f1', attempted_at: '2026-09-24T12:00:00' },
      { kid_id: 'k1', food_id: 'f1', attempted_at: '2026-09-23T12:00:00' },
      { kid_id: 'k1', food_id: 'f2', attempted_at: '2026-09-20T12:00:00' },
      { kid_id: 'k1', food_id: 'f3', attempted_at: '2026-09-10T12:00:00' },
      { kid_id: 'k2', food_id: 'f4', attempted_at: '2026-09-24T12:00:00' },
    ];
    expect(summarizeKidWeek([], 'k1', TODAY, [], attempts).newFoodsTried).toBe(2);
  });
});

describe('local-day boundary in America/Chicago', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Chicago';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('reads an attempt late in the local evening as that local day', () => {
    // 2026-09-25T03:30Z is 22:30 on the 24th in Chicago (CDT, UTC-5). Read
    // through UTC it would be tomorrow and fall outside the window.
    const attempts: KidAttemptRow[] = [{ kid_id: 'k1', food_id: 'f1', attempted_at: '2026-09-25T03:30:00Z' }];
    expect(summarizeKidWeek([], 'k1', TODAY, [], attempts).newFoodsTried).toBe(1);
    // And 04:30Z on the 18th is 23:30 on the 17th locally: outside the window.
    const old: KidAttemptRow[] = [{ kid_id: 'k1', food_id: 'f1', attempted_at: '2026-09-18T04:30:00Z' }];
    expect(summarizeKidWeek([], 'k1', TODAY, [], old).newFoodsTried).toBe(0);
  });

  it('keeps the plan-entry window on calendar days', () => {
    const out = summarizeKidWeek([entry('2026-09-18', 'ate'), entry('2026-09-17', 'ate')], 'k1', TODAY);
    expect(out.ate).toBe(1);
  });
});

describe('buildProgressByKid', () => {
  it('matches summarizeKidWeek for every kid, zeroed when there is no data', () => {
    const entries = [entry(TODAY, 'ate', 'k1'), entry(TODAY, 'tasted', 'k2'), entry('2026-09-30', 'ate', 'k2')];
    const ladder: KidLadderRow[] = [{ kid_id: 'k2', food_id: 'f1', status: 'active', current_rung: 'touching' }];
    const kids = [{ id: 'k1' }, { id: 'k2' }, { id: 'k3' }];
    const map = buildProgressByKid(kids, entries, TODAY, ladder, []);
    for (const kid of kids) {
      expect(map.get(kid.id)).toEqual(summarizeKidWeek(entries, kid.id, TODAY, ladder, []));
    }
    expect(map.get('k3')).toMatchObject({ offered: 0, mastered: 0, activeLadder: [] });
  });
});

describe('windowDays', () => {
  const tenDaysBack = entry('2026-09-14', 'tasted');

  it('counts an entry ten days back in a 14-day window', () => {
    expect(summarizeKidWeek([tenDaysBack], 'k1', TODAY, [], [], undefined, 14)).toMatchObject({ tasted: 1, offered: 1 });
    expect(buildProgressByKid([{ id: 'k1' }], [tenDaysBack], TODAY, [], [], undefined, 14).get('k1')).toMatchObject({
      tasted: 1,
    });
  });

  it('leaves it out under the default seven days', () => {
    expect(summarizeKidWeek([tenDaysBack], 'k1', TODAY).offered).toBe(0);
    expect(buildProgressByKid([{ id: 'k1' }], [tenDaysBack], TODAY).get('k1')?.offered).toBe(0);
  });

  it('starts a 14-day window thirteen days back', () => {
    expect(windowStartIso(TODAY, 14)).toBe('2026-09-11');
    expect(windowStartIso(TODAY)).toBe('2026-09-18');
  });
});

// --- Four-week trend (Insights) ------------------------------------------


function dish(
  date: string,
  result: PlanEntry['result'],
  opts: Partial<TrendPlanEntryLike> = {},
): TrendPlanEntryLike {
  return { kid_id: 'k1', date, result, meal_slot: 'dinner', food_id: `f-${date}`, recipe_id: null, ...opts };
}

function bucket(logged: number, exposures = logged, extra: Partial<WeekBucket> = {}): WeekBucket {
  return {
    startIso: '',
    endIso: '',
    exposures,
    ate: logged,
    tasted: 0,
    refused: 0,
    distinctFoods: logged,
    logged,
    lastLoggedIso: null,
    ...extra,
  };
}

describe('buildWeeklyTrend', () => {
  it('returns four seven-day buckets, oldest first, ending today', () => {
    const trend = buildWeeklyTrend([], 'k1', TODAY);
    expect(trend.map((b) => [b.startIso, b.endIso])).toEqual([
      ['2026-08-28', '2026-09-03'],
      ['2026-09-04', '2026-09-10'],
      ['2026-09-11', '2026-09-17'],
      ['2026-09-18', TODAY],
    ]);
  });

  it("excludes a future-dated 'ate' row", () => {
    const trend = buildWeeklyTrend([dish('2026-09-25', 'ate'), dish(TODAY, 'ate')], 'k1', TODAY);
    expect(trend.reduce((s, b) => s + b.exposures, 0)).toBe(1);
  });

  it('excludes a past row with no result', () => {
    const trend = buildWeeklyTrend([dish('2026-09-20', null)], 'k1', TODAY);
    expect(trend.every((b) => b.logged === 0 && b.exposures === 0)).toBe(true);
  });

  it('drops a row 28 days back and keeps one 27 days back', () => {
    const trend = buildWeeklyTrend(
      [dish(addIsoDays(TODAY, -28), 'ate'), dish(addIsoDays(TODAY, -27), 'tasted')],
      'k1',
      TODAY,
    );
    expect(trend[0]).toMatchObject({ logged: 1, tasted: 1, ate: 0 });
    expect(trend.reduce((s, b) => s + b.logged, 0)).toBe(1);
  });

  it('counts a three-row recipe in one slot as one exposure with its best result', () => {
    const recipe = { recipe_id: 'r1', meal_slot: 'dinner' as const };
    const trend = buildWeeklyTrend(
      [
        dish(TODAY, 'refused', { ...recipe, food_id: 'a' }),
        dish(TODAY, 'ate', { ...recipe, food_id: 'b' }),
        dish(TODAY, 'tasted', { ...recipe, food_id: 'c' }),
      ],
      'k1',
      TODAY,
    );
    expect(trend[3]).toMatchObject({ exposures: 1, logged: 1, ate: 1, tasted: 0, refused: 0, distinctFoods: 1 });
  });

  it("sums the four buckets' exposures to the 28-day total", () => {
    const entries: TrendPlanEntryLike[] = [];
    for (let i = 0; i < 28; i += 2) entries.push(dish(addIsoDays(TODAY, -i), 'ate'));
    const attempts: KidAttemptRow[] = [
      { kid_id: 'k1', food_id: 'fa', attempted_at: '2026-09-01' },
      { kid_id: 'k1', food_id: 'fb', attempted_at: '2026-09-20' },
      { kid_id: 'k1', food_id: 'fc', attempted_at: '2026-08-20' },
      { kid_id: 'k2', food_id: 'fd', attempted_at: '2026-09-20' },
    ];
    const trend = buildWeeklyTrend(entries, 'k1', TODAY, attempts);
    expect(trend.reduce((s, b) => s + b.exposures, 0)).toBe(14 + 2);
    expect(trend.reduce((s, b) => s + b.logged, 0)).toBe(14);
  });

  it("ignores another kid's rows", () => {
    const trend = buildWeeklyTrend([dish(TODAY, 'ate', { kid_id: 'k2' })], 'k1', TODAY);
    expect(trend[3].logged).toBe(0);
  });

  describe('across a DST change (America/Chicago)', () => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = 'America/Chicago';
    });
    afterAll(() => {
      process.env.TZ = originalTz;
    });

    it('gives every bucket exactly seven days', () => {
      // Daylight time ends 2026-11-01; the window runs 2026-10-17..2026-11-13.
      const today = '2026-11-13';
      const entries: TrendPlanEntryLike[] = [];
      for (let i = 0; i < 28; i += 1) entries.push(dish(addIsoDays(today, -i), 'ate'));
      const trend = buildWeeklyTrend(entries, 'k1', today);
      expect(trend).toHaveLength(4);
      for (const b of trend) {
        expect(addIsoDays(b.startIso, 6)).toBe(b.endIso);
        expect(b.logged).toBe(7);
      }
      expect(trend[0].startIso).toBe('2026-10-17');
    });
  });
});

describe('pickWeekHeadline', () => {
  it("is 'notEnough' below three logged dishes in 28 days", () => {
    const out = pickWeekHeadline([bucket(0), bucket(1), bucket(0), bucket(1)], [], TODAY);
    expect(out).toEqual({ kind: 'notEnough', params: { logged: 2 } });
  });

  it("is 'quiet' with the last logged day when this week has no logs", () => {
    const trend = [bucket(2), bucket(2, 2, { lastLoggedIso: '2026-09-15' }), bucket(0), bucket(0)];
    trend[0].lastLoggedIso = '2026-09-02';
    expect(pickWeekHeadline(trend, [], TODAY)).toEqual({
      kind: 'quiet',
      params: { lastLoggedIso: '2026-09-15', daysAgo: 9 },
    });
  });

  it("is 'aboveAverage' when this week beats the prior weeks' mean", () => {
    const out = pickWeekHeadline([bucket(2), bucket(3), bucket(4), bucket(5, 6)], [], TODAY);
    expect(out).toEqual({ kind: 'aboveAverage', params: { exposures: 6, average: 3 } });
  });

  it("is 'reachedSafe' when a ladder food was mastered this week", () => {
    const ladder: KidLadderRow[] = [
      { kid_id: 'k1', food_id: 'f1', status: 'mastered', current_rung: 'full_portion', last_attempt_at: '2026-09-22' },
      { kid_id: 'k1', food_id: 'f2', status: 'mastered', current_rung: 'full_portion', last_attempt_at: '2026-09-01' },
    ];
    const out = pickWeekHeadline([bucket(0), bucket(0), bucket(0), bucket(1)], ladder, TODAY, new Map([['f1', 'Peas']]));
    expect(out).toEqual({ kind: 'reachedSafe', params: { count: 1, foodId: 'f1', foodName: 'Peas' } });
  });

  it("does not claim 'aboveAverage' over a usual of zero", () => {
    const out = pickWeekHeadline([bucket(0), bucket(1), bucket(0), bucket(2)], [], TODAY);
    expect(out.kind).toBe('steady');
  });

  it("is 'steady' when this week is at or under the usual", () => {
    const out = pickWeekHeadline([bucket(4), bucket(4), bucket(4), bucket(3)], [], TODAY);
    expect(out).toEqual({ kind: 'steady', params: { dishes: 3, distinctFoods: 3 } });
  });

  it('never carries a refusal count in its params', () => {
    const trend = buildWeeklyTrend(
      [dish(TODAY, 'refused'), dish('2026-09-23', 'refused'), dish('2026-09-10', 'refused')],
      'k1',
      TODAY,
    );
    const out = pickWeekHeadline(trend, [], TODAY);
    expect(JSON.stringify(out.params).toLowerCase()).not.toContain('refus');
  });
});
