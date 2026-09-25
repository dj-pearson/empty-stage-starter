import { describe, it, expect } from 'vitest';
import { buildMilestoneTimeline, groupByMonth } from './milestoneTimeline';
import type { KidLadderRow } from './kidProgress';

const foods = new Map([
  ['f-apple', { name: 'Apple' }],
  ['f-bean', { name: 'Green bean' }],
  ['f-corn', { name: 'Corn' }],
]);

const ladder = (food_id: string, extra: Partial<KidLadderRow> = {}): KidLadderRow => ({
  kid_id: 'ana',
  food_id,
  status: 'mastered',
  current_rung: 'eat_regularly',
  ...extra,
});

describe('buildMilestoneTimeline', () => {
  it('sorts newest first across badges and safe foods', () => {
    const items = buildMilestoneTimeline(
      [
        { badge_id: 'firstTryBite', earned_at: '2026-03-02T15:00:00Z' },
        { badge_id: 'weekWarrior', earned_at: '2026-06-10T15:00:00Z' },
      ],
      [ladder('f-apple', { last_attempt_at: '2026-04-20' })],
      foods,
    );
    expect(items.map((i) => i.id)).toEqual(['weekWarrior', 'f-apple', 'firstTryBite']);
    expect(items[0]).toMatchObject({ kind: 'badge', labelKey: 'progressBadges.weekWarrior' });
    expect(items[1]).toMatchObject({ kind: 'safe', foodName: 'Apple', dayIso: '2026-04-20' });
  });

  it('breaks a same-day tie by id', () => {
    const items = buildMilestoneTimeline(
      [{ badge_id: 'weekWarrior', earned_at: '2026-05-05' }],
      [ladder('f-corn', { last_attempt_at: '2026-05-05' }), ladder('f-bean', { last_attempt_at: '2026-05-05' })],
      foods,
    );
    expect(items.map((i) => i.id)).toEqual(['f-bean', 'f-corn', 'weekWarrior']);
  });

  it('skips a mastered row with no last_attempt_at and no updated_at instead of dating it today', () => {
    const items = buildMilestoneTimeline([], [ladder('f-apple'), ladder('f-bean', { updated_at: '2026-02-01' })], foods);
    expect(items.map((i) => i.id)).toEqual(['f-bean']);
  });

  it('skips badge ids the catalog does not know, and undated badges', () => {
    const items = buildMilestoneTimeline(
      [
        { badge_id: 'moonWalker', earned_at: '2026-05-01T00:00:00Z' },
        { badge_id: 'firstTryBite', earned_at: null },
        { badge_id: 'perfectWeek', earned_at: '2026-05-01T12:00:00Z' },
      ],
      [],
      foods,
    );
    expect(items.map((i) => i.id)).toEqual(['perfectWeek']);
  });

  it('skips rows that are not mastered or whose food is gone', () => {
    const items = buildMilestoneTimeline(
      [],
      [ladder('f-apple', { status: 'active', last_attempt_at: '2026-01-01' }), ladder('f-gone', { last_attempt_at: '2026-01-01' })],
      foods,
    );
    expect(items).toEqual([]);
  });

  it('keeps earned_at as stored for a badge, for the view to format', () => {
    const [item] = buildMilestoneTimeline([{ badge_id: 'recipeChef', earned_at: '2026-03-02T15:00:00+00:00' }], [], foods);
    expect(item.dateIso).toBe('2026-03-02T15:00:00+00:00');
  });
});

describe('groupByMonth', () => {
  it('groups consecutive items by month', () => {
    const groups = groupByMonth([{ dayIso: '2026-05-09' }, { dayIso: '2026-05-01' }, { dayIso: '2026-03-30' }]);
    expect(groups.map((g) => [g.month, g.items.length])).toEqual([
      ['2026-05', 2],
      ['2026-03', 1],
    ]);
  });
});
