import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildProgressByKid, summarizeKidWeek, windowStartIso, type KidLadderRow, type KidAttemptRow } from './kidProgress';
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
