import { describe, it, expect } from 'vitest';
import {
  pageRange,
  pageCount,
  formatDuration,
  capUtilization,
  utcDayKey,
  buildDailySpendSeries,
  RUNS_PAGE_SIZE,
  type RunForChart,
} from './runsDashboard';

describe('pagination', () => {
  it('computes range bounds per page', () => {
    expect(pageRange(0, 25)).toEqual({ from: 0, to: 24 });
    expect(pageRange(2, 25)).toEqual({ from: 50, to: 74 });
    expect(pageRange(-1, 25)).toEqual({ from: 0, to: 24 });
  });
  it('computes page count', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(25)).toBe(1);
    expect(pageCount(26)).toBe(2);
    expect(pageCount(51, 25)).toBe(3);
  });
  it('exposes a default page size', () => {
    expect(RUNS_PAGE_SIZE).toBeGreaterThan(0);
  });
});

describe('formatDuration', () => {
  it('returns dash for unfinished or invalid', () => {
    expect(formatDuration('2026-07-10T12:00:00Z', null)).toBe('—');
    expect(formatDuration('2026-07-10T12:00:05Z', '2026-07-10T12:00:00Z')).toBe('—');
  });
  it('formats sub-second, seconds, and minutes', () => {
    expect(formatDuration('2026-07-10T12:00:00.000Z', '2026-07-10T12:00:00.250Z')).toBe('250ms');
    expect(formatDuration('2026-07-10T12:00:00Z', '2026-07-10T12:00:03.500Z')).toBe('3.5s');
    expect(formatDuration('2026-07-10T12:00:00Z', '2026-07-10T12:03:04Z')).toBe('3m 4s');
  });
});

describe('capUtilization', () => {
  it('is a percentage of the cap', () => {
    expect(capUtilization(2, 5)).toBe(40);
    expect(capUtilization(5, 5)).toBe(100);
    expect(capUtilization(7.5, 5)).toBe(150);
  });
  it('is zero when there is no cap', () => {
    expect(capUtilization(3, 0)).toBe(0);
  });
});

describe('utcDayKey', () => {
  it('returns the UTC date portion', () => {
    expect(utcDayKey('2026-07-10T23:59:00Z')).toBe('2026-07-10');
  });
});

describe('buildDailySpendSeries', () => {
  const now = new Date('2026-07-10T12:00:00Z');
  const names = new Map([
    ['a1', 'triage'],
    ['a2', 'nurture'],
  ]);

  it('buckets spend by day and agent over the window', () => {
    const runs: RunForChart[] = [
      { agent_id: 'a1', cost_usd: 0.5, started_at: '2026-07-10T01:00:00Z' },
      { agent_id: 'a1', cost_usd: 0.25, started_at: '2026-07-10T09:00:00Z' },
      { agent_id: 'a2', cost_usd: 1, started_at: '2026-07-09T09:00:00Z' },
    ];
    const { data, agents } = buildDailySpendSeries(runs, names, 14, now);
    expect(agents).toEqual(['nurture', 'triage']);
    expect(data).toHaveLength(14);
    const today = data[data.length - 1];
    expect(today.date).toBe('07-10');
    expect(today.triage).toBe(0.75);
    expect(today.nurture).toBe(0);
    const yesterday = data[data.length - 2];
    expect(yesterday.nurture).toBe(1);
  });

  it('ignores runs outside the window and unknown agents', () => {
    const runs: RunForChart[] = [
      { agent_id: 'a1', cost_usd: 9, started_at: '2026-06-01T00:00:00Z' }, // too old
      { agent_id: 'ghost', cost_usd: 9, started_at: '2026-07-10T00:00:00Z' }, // unknown agent
      { agent_id: null, cost_usd: 9, started_at: '2026-07-10T00:00:00Z' }, // no agent
    ];
    const { data, agents } = buildDailySpendSeries(runs, names, 7, now);
    expect(agents).toEqual([]);
    expect(data).toHaveLength(7);
    expect(data.every((row) => Object.keys(row).length === 1)).toBe(true); // only 'date'
  });
});
