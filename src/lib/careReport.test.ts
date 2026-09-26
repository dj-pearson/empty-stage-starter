import { describe, expect, it } from 'vitest';
import { MAX_NOTE_LENGTH, buildCareReport, parseCareReport, type CareReportAttempt } from './careReport';

const at = (day: string, foodId: string, outcome: string, extra: Partial<CareReportAttempt> = {}): CareReportAttempt => ({
  foodId,
  stage: null,
  outcome,
  attemptedAt: `${day}T18:00:00.000Z`,
  preparationMethod: null,
  ...extra,
});

const base = {
  kidFirstName: 'Sam',
  from: '2026-09-01',
  to: '2026-09-30',
  foodNames: { pea: 'Peas', carrot: 'Carrot', kiwi: 'Kiwi', rice: 'Rice' },
  safeFoodNames: ['Pasta', ' Rice ', ''],
  includeNotes: false,
};

describe('buildCareReport', () => {
  const attempts: CareReportAttempt[] = [
    at('2026-08-20', 'pea', 'refused'), // before the range: peas are not new
    at('2026-09-02', 'pea', 'success', { stage: 'touching', parentNotes: 'Touched with a fork' }),
    at('2026-09-02', 'carrot', 'refused', { stage: 'looking' }),
    at('2026-09-05', 'carrot', 'tantrum', { stage: 'looking', reactionNotes: 'Upset, left the table' }),
    at('2026-09-09', 'kiwi', 'partial'),
    at('2026-10-02', 'kiwi', 'success'), // after the range
  ];
  const ladderRows = [
    { foodId: 'carrot', currentRung: 'looking' as const, status: 'backed_off' },
    { foodId: 'rice', currentRung: 'full_portion' as const, status: 'mastered' },
  ];

  it('summarizes the range with refusals and distress reported plainly', () => {
    const report = buildCareReport({ ...base, attempts, ladderRows });
    expect(report.summary).toEqual({
      daysLogged: 3,
      offers: 4,
      accepted: 2,
      refused: 1,
      distress: 1,
      foodsOffered: 3,
      newFoodsOffered: 2,
    });
  });

  it('lists only foods first offered inside the range as new', () => {
    const report = buildCareReport({ ...base, attempts, ladderRows });
    expect(report.newFoods).toEqual([
      { name: 'Carrot', firstOfferedOn: '2026-09-02', offers: 2, accepted: 0 },
      { name: 'Kiwi', firstOfferedOn: '2026-09-09', offers: 1, accepted: 1 },
    ]);
  });

  it('merges the always-eats list with mastered ladder foods, trimmed and deduplicated', () => {
    const report = buildCareReport({ ...base, attempts, ladderRows });
    expect(report.safeFoods).toEqual(['Pasta', 'Rice']);
  });

  it('keeps ladder foods only, by name, with no ids anywhere in the result', () => {
    const report = buildCareReport({ ...base, attempts, ladderRows });
    expect(report.ladder.map((r) => r.foodName)).toEqual(['Carrot', 'Rice']);
    expect(report.ladder[0].outcomeCounts).toMatchObject({ refused: 1, tantrum: 1, total: 2 });
    const json = JSON.stringify(report);
    for (const id of ['"pea"', '"carrot"', '"kiwi"', '"rice"', 'foodId']) expect(json).not.toContain(id);
  });

  it('leaves notes out unless the parent opts in', () => {
    expect(buildCareReport({ ...base, attempts, ladderRows }).notes).toEqual([]);
    const withNotes = buildCareReport({ ...base, attempts, ladderRows, includeNotes: true });
    expect(withNotes.includesNotes).toBe(true);
    expect(withNotes.notes).toEqual([
      { on: '2026-09-05', food: 'Carrot', text: 'Upset, left the table' },
      { on: '2026-09-02', food: 'Peas', text: 'Touched with a fork' },
    ]);
  });

  it('clips long notes', () => {
    const long = 'a'.repeat(MAX_NOTE_LENGTH + 50);
    const report = buildCareReport({
      ...base,
      attempts: [at('2026-09-03', 'pea', 'success', { parentNotes: long })],
      ladderRows: [],
      includeNotes: true,
    });
    expect(report.notes[0].text.length).toBe(MAX_NOTE_LENGTH);
    expect(report.notes[0].text.endsWith('...')).toBe(true);
  });

  it('round-trips through the snapshot parser', () => {
    const report = buildCareReport({ ...base, attempts, ladderRows, includeNotes: true });
    expect(parseCareReport(JSON.parse(JSON.stringify(report)))).toEqual(report);
  });
});

describe('parseCareReport', () => {
  it('refuses anything that is not a current report', () => {
    expect(parseCareReport(null)).toBeNull();
    expect(parseCareReport({ version: 99 })).toBeNull();
    expect(parseCareReport('{"version":1}')).toBeNull();
  });
});
