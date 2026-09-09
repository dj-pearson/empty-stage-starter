import { describe, it, expect } from 'vitest';
import { autoAddLogForToday } from './SmartRestockSuggestions';
import { toISODate } from '@/lib/date-utils';

/**
 * US-818/US-299. Auto-restock adds at most twenty items a day. "Day" was the
 * UTC calendar day, so on the US west coast the budget reset at 5pm local and
 * a household could take another twenty before bedtime.
 */
describe('the auto-restock daily budget', () => {
  it('keeps a log written today', () => {
    expect(autoAddLogForToday('{"date":"2026-09-08","count":7}', '2026-09-08')).toEqual({
      date: '2026-09-08',
      count: 7,
    });
  });

  it('resets a log written on another day', () => {
    expect(autoAddLogForToday('{"date":"2026-09-07","count":20}', '2026-09-08')).toEqual({
      date: '2026-09-08',
      count: 0,
    });
  });

  it('starts at zero when nothing is stored', () => {
    expect(autoAddLogForToday(null, '2026-09-08')).toEqual({ date: '2026-09-08', count: 0 });
  });

  it('starts at zero on unparseable JSON rather than throwing', () => {
    expect(autoAddLogForToday('{oh no', '2026-09-08')).toEqual({ date: '2026-09-08', count: 0 });
  });

  it('starts at zero when the stored shape is wrong', () => {
    // A count that is not a number would make the budget arithmetic NaN, and
    // NaN < 20 is false, so the cap would silently block every add.
    expect(autoAddLogForToday('{"date":"2026-09-08","count":"lots"}', '2026-09-08')).toEqual({
      date: '2026-09-08',
      count: 0,
    });
  });

  it('rolls over on the local day, not the UTC one', () => {
    process.env.TZ = 'America/Los_Angeles';
    // 6pm Pacific on the 8th is already the 9th in UTC. The budget belongs to
    // the parent's evening, so it must still read as the 8th.
    const evening = new Date('2026-09-09T01:00:00Z');
    expect(toISODate(evening)).toBe('2026-09-08');
    expect(evening.toISOString().slice(0, 10)).toBe('2026-09-09');
  });
});
