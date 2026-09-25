/**
 * The ladder report reads every try in the range, not the first 1000
 * PostgREST hands back, and says how many it was built from.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  ATTEMPT_PAGE_SIZE,
  buildClinicianLadderReport,
  fetchAllPages,
  formatReportTotalsLine,
  type ReportTranslate,
} from './clinicianLadderReport';

interface Row {
  food_id: string;
  outcome: string;
  stage: string;
  attempted_at: string;
  preparation_method: string | null;
}

/** 1001 rows in attempted_at order, one minute apart from 2026-03-01. */
const ROWS: Row[] = Array.from({ length: 1001 }, (_, i) => ({
  food_id: i % 2 === 0 ? 'peas' : 'broccoli',
  outcome: i % 3 === 0 ? 'refused' : 'success',
  stage: 'looking',
  attempted_at: new Date(Date.UTC(2026, 2, 1) + i * 60_000).toISOString(),
  preparation_method: null,
}));

const t: ReportTranslate = (key, vars = {}) => {
  const template = typeof vars.defaultValue === 'string' ? vars.defaultValue : key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(vars[name] ?? ''));
};

describe('fetchAllPages', () => {
  it('reads 1001 rows over two pages, in order, and stops on the short page', async () => {
    const fetchPage = vi.fn(async (from: number, to: number) => ({ data: ROWS.slice(from, to + 1), error: null }));

    const rows = await fetchAllPages(fetchPage);

    expect(ATTEMPT_PAGE_SIZE).toBe(1000);
    expect(rows).toHaveLength(1001);
    expect(rows.map((r) => r.attempted_at)).toEqual(ROWS.map((r) => r.attempted_at));
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('asks for one more page when the last full page ends exactly on the boundary', async () => {
    const fetchPage = vi.fn(async (from: number, to: number) => ({ data: ROWS.slice(0, 4).slice(from, to + 1), error: null }));
    expect(await fetchAllPages(fetchPage, 2)).toHaveLength(4);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('throws the first error instead of returning a partial list', async () => {
    const failure = new Error('timeout');
    const fetchPage = vi.fn(async (from: number) =>
      from === 0 ? { data: ROWS.slice(0, 2), error: null } : { data: null, error: failure }
    );
    await expect(fetchAllPages(fetchPage, 2)).rejects.toBe(failure);
  });

  it('treats null data as an empty page', async () => {
    expect(await fetchAllPages(async () => ({ data: null, error: null }))).toEqual([]);
  });
});

describe('formatReportTotalsLine', () => {
  it('ends with the number of logged tries the report was built from', async () => {
    const rows = await fetchAllPages(async (from: number, to: number) => ({ data: ROWS.slice(from, to + 1), error: null }));
    const report = buildClinicianLadderReport({
      kidFirstName: 'Ava',
      from: '2026-03-01',
      to: '2026-03-31',
      attempts: rows.map((r) => ({
        foodId: r.food_id,
        stage: r.stage,
        outcome: r.outcome,
        attemptedAt: r.attempted_at,
        preparationMethod: r.preparation_method,
      })),
      ladderRows: [],
    });

    expect(report.totals.attempts).toBe(1001);
    const line = formatReportTotalsLine(report.totals, t);
    expect(line).toContain('Based on 1001 logged tries');
    expect(line.startsWith('foodLadder.report.totalsLine')).toBe(true);
  });
});
