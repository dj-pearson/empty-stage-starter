import { describe, it, expect } from 'vitest';
import { summarizeFoodAttempts, type FoodAttemptHistoryRow } from './foodAttemptHistory';

let seq = 0;
function row(overrides: Partial<FoodAttemptHistoryRow> = {}): FoodAttemptHistoryRow {
  seq += 1;
  return {
    id: `a-${seq}`,
    food_id: 'broccoli',
    stage: 'looking',
    outcome: 'success',
    attempted_at: '2026-09-01T18:00:00.000Z',
    is_milestone: false,
    reaction_notes: null,
    ...overrides,
  };
}

const household = new Set(['broccoli', 'peas']);

describe('summarizeFoodAttempts', () => {
  it('takes the best stage from successes and partials only', () => {
    const { perFood } = summarizeFoodAttempts(
      [
        row({ stage: 'touching', outcome: 'success' }),
        row({ stage: 'licking', outcome: 'partial' }),
        row({ stage: 'full_portion', outcome: 'refused' }),
        row({ stage: 'full_bite', outcome: 'tantrum' }),
      ],
      household
    );
    // licking is index 3; the refused full_portion and tantrum full_bite do not count.
    expect(perFood.get('broccoli')?.bestStageIndex).toBe(3);
  });

  it('gives -1 when a food has only refusals', () => {
    const { perFood } = summarizeFoodAttempts(
      [row({ food_id: 'peas', stage: 'small_bite', outcome: 'refused' })],
      household
    );
    expect(perFood.get('peas')?.bestStageIndex).toBe(-1);
  });

  it('excludes foods outside the household set', () => {
    const summary = summarizeFoodAttempts(
      [row(), row({ food_id: 'someone-elses' }), row({ food_id: null })],
      household
    );
    expect(summary.total).toBe(1);
    expect(summary.perFood.has('someone-elses')).toBe(false);
  });

  it('skips rows with no attempted_at', () => {
    const summary = summarizeFoodAttempts(
      [row({ attempted_at: null }), row({ attempted_at: '2026-09-02T18:00:00.000Z' })],
      household
    );
    expect(summary.total).toBe(1);
    expect(summary.perFood.get('broccoli')?.count).toBe(1);
  });

  it('tracks the latest result and whether a reaction was ever noted', () => {
    const { perFood } = summarizeFoodAttempts(
      [
        row({ attempted_at: '2026-09-03T18:00:00.000Z', outcome: 'refused' }),
        row({ attempted_at: '2026-09-01T18:00:00.000Z', reaction_notes: 'rash on chin' }),
        row({ attempted_at: '2026-09-02T18:00:00.000Z', outcome: 'partial' }),
      ],
      household
    );
    const broccoli = perFood.get('broccoli');
    expect(broccoli?.lastOutcome).toBe('refused');
    expect(broccoli?.lastAt).toBe('2026-09-03T18:00:00.000Z');
    expect(broccoli?.hasReaction).toBe(true);
    expect(broccoli?.outcomeCounts).toEqual({ success: 1, partial: 1, refused: 1, tantrum: 0 });
  });

  it('counts every outcome in the totals; there is no filter to change them', () => {
    const rows = [
      row({ outcome: 'success' }),
      row({ outcome: 'refused' }),
      row({ outcome: 'tantrum' }),
      row({ food_id: 'peas', outcome: 'partial' }),
    ];
    // The signature takes rows and the household set only.
    expect(summarizeFoodAttempts.length).toBe(2);
    const summary = summarizeFoodAttempts(rows, household);
    expect(summary.total).toBe(4);
    expect(summary.perFood.get('broccoli')?.count).toBe(3);
    expect(summary.perFood.get('peas')?.count).toBe(1);
  });
});
