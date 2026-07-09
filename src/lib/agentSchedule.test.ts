import { describe, it, expect } from 'vitest';

/**
 * US-478: unit tests for the agent dispatcher's due/not-due decision.
 *
 * The logic lives in a dependency-free module so it can be shared by the
 * Deno edge function and this Node/Vitest test (same pattern as
 * src/lib/syncQueue.test.ts importing from app/mobile). All times are UTC.
 */
import {
  parseCron,
  isValidCron,
  cronMatches,
  previousFireTime,
  isAgentDue,
} from '../../supabase/functions/_shared/cron';

const utc = (iso: string) => new Date(iso);

describe('parseCron / isValidCron', () => {
  it('accepts standard 5-field expressions', () => {
    expect(isValidCron('*/5 * * * *')).toBe(true);
    expect(isValidCron('0 9 * * 1')).toBe(true);
    expect(isValidCron('0 0 1 * *')).toBe(true);
    expect(isValidCron('30 8-17 * * 1-5')).toBe(true);
  });

  it('rejects malformed expressions', () => {
    expect(isValidCron('* * * *')).toBe(false); // 4 fields
    expect(isValidCron('*/0 * * * *')).toBe(false); // zero step
    expect(isValidCron('99 * * * *')).toBe(false); // minute out of range
    expect(isValidCron('* 25 * * *')).toBe(false); // hour out of range
    expect(isValidCron('not a cron')).toBe(false);
  });

  it('parses fields positionally', () => {
    expect(parseCron('30 9 1 6 2')).toEqual({
      minute: '30',
      hour: '9',
      dom: '1',
      month: '6',
      dow: '2',
    });
  });
});

describe('cronMatches', () => {
  it('matches every-5-minutes cron', () => {
    const f = parseCron('*/5 * * * *');
    expect(cronMatches(f, utc('2026-07-09T10:05:00Z'))).toBe(true);
    expect(cronMatches(f, utc('2026-07-09T10:07:00Z'))).toBe(false);
  });

  it('matches a specific weekday-and-time (Monday 09:00 UTC)', () => {
    const f = parseCron('0 9 * * 1');
    // 2026-07-13 is a Monday.
    expect(cronMatches(f, utc('2026-07-13T09:00:00Z'))).toBe(true);
    expect(cronMatches(f, utc('2026-07-13T09:01:00Z'))).toBe(false);
    // 2026-07-14 is a Tuesday.
    expect(cronMatches(f, utc('2026-07-14T09:00:00Z'))).toBe(false);
  });

  it('honors Vixie OR-semantics when both day fields are restricted', () => {
    // 1st of month OR any Monday.
    const f = parseCron('0 0 1 * 1');
    expect(cronMatches(f, utc('2026-07-01T00:00:00Z'))).toBe(true); // 1st (a Wednesday)
    expect(cronMatches(f, utc('2026-07-13T00:00:00Z'))).toBe(true); // a Monday
    expect(cronMatches(f, utc('2026-07-14T00:00:00Z'))).toBe(false); // neither
  });

  it('treats dow=0 and dow=7 both as Sunday', () => {
    // 2026-07-12 is a Sunday.
    expect(cronMatches(parseCron('0 0 * * 0'), utc('2026-07-12T00:00:00Z'))).toBe(true);
    expect(cronMatches(parseCron('0 0 * * 7'), utc('2026-07-12T00:00:00Z'))).toBe(true);
  });
});

describe('previousFireTime', () => {
  it('finds the most recent 5-minute boundary', () => {
    const prev = previousFireTime('*/5 * * * *', utc('2026-07-09T10:07:30Z'));
    expect(prev?.toISOString()).toBe('2026-07-09T10:05:00.000Z');
  });

  it('finds the previous weekly fire', () => {
    // Query on Wednesday; last Monday-09:00 fire was 2026-07-06.
    const prev = previousFireTime('0 9 * * 1', utc('2026-07-08T12:00:00Z'));
    expect(prev?.toISOString()).toBe('2026-07-06T09:00:00.000Z');
  });
});

describe('isAgentDue', () => {
  const now = utc('2026-07-09T10:05:00Z');

  it('is not due when there is no schedule', () => {
    expect(isAgentDue(null, null, now)).toBe(false);
    expect(isAgentDue('', null, now)).toBe(false);
    expect(isAgentDue('   ', null, now)).toBe(false);
  });

  it('is not due for an invalid cron', () => {
    expect(isAgentDue('every 5 mins', null, now)).toBe(false);
  });

  it('is due when it has never run and a fire time has passed', () => {
    expect(isAgentDue('*/5 * * * *', null, now)).toBe(true);
  });

  it('is due when the last run predates the most recent fire', () => {
    expect(isAgentDue('*/5 * * * *', '2026-07-09T10:00:00Z', now)).toBe(true);
  });

  it('is NOT due when it already ran at/after the most recent fire', () => {
    expect(isAgentDue('*/5 * * * *', '2026-07-09T10:05:00Z', now)).toBe(false);
    expect(isAgentDue('*/5 * * * *', '2026-07-09T10:06:00Z', now)).toBe(false);
  });

  it('treats an unparseable last-run timestamp as never-ran', () => {
    expect(isAgentDue('*/5 * * * *', 'not-a-date', now)).toBe(true);
  });

  it('accepts a Date for lastRunAt', () => {
    expect(isAgentDue('*/5 * * * *', utc('2026-07-09T10:00:00Z'), now)).toBe(true);
  });
});
