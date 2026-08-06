/**
 * US-610: Safe Food Insurance risk scoring.
 *
 * The four cases the story names are the four that matter, and three of them
 * are about NOT firing. A false alarm on a staple is worse than silence here:
 * it teaches a parent to ignore the one warning that would have mattered.
 */

import { describe, it, expect } from 'vitest';
import {
  MIN_OBSERVATIONS,
  scoreSafeFoodRisk,
  selectSlippingSafeFoods,
  type SafeFoodObservation,
} from './safeFoodRisk';

const AS_OF = '2026-03-20';

const FOODS = [
  { id: 'nuggets', name: 'Chicken nuggets', isSafe: true },
  { id: 'broccoli', name: 'Broccoli', isSafe: false },
];

/** `daysAgo` keeps each case readable relative to the injected today. */
function obs(foodId: string, daysAgo: number, result: string): SafeFoodObservation {
  const ms = Date.parse(`${AS_OF}T12:00:00Z`) - daysAgo * 86_400_000;
  return { foodId, date: new Date(ms).toISOString().slice(0, 10), result };
}

function repeat(foodId: string, days: number[], result: string): SafeFoodObservation[] {
  return days.map((d) => obs(foodId, d, result));
}

function score(
  observations: SafeFoodObservation[],
  planEntries?: { foodId: string; date: string }[]
) {
  return scoreSafeFoodRisk({
    foods: FOODS,
    observations,
    planEntries: planEntries?.map((e) => ({ recipeId: null, foodId: e.foodId, date: e.date })),
    asOf: AS_OF,
  });
}

describe('scoreSafeFoodRisk', () => {
  it('does not flag a stable staple', () => {
    // Eaten reliably in both windows, with the odd off night in each.
    const observations = [
      ...repeat('nuggets', [1, 3, 5, 8, 11], 'ate'),
      ...repeat('nuggets', [13], 'refused'),
      ...repeat('nuggets', [16, 19, 22, 26, 30, 34], 'ate'),
      ...repeat('nuggets', [38], 'refused'),
    ];

    const [row] = score(observations);
    expect(row.foodId).toBe('nuggets');
    expect(row.level).toBe('none');
    expect(row.score).toBe(0);
    expect(selectSlippingSafeFoods(score(observations))).toHaveLength(0);
  });

  it('flags a genuine decline', () => {
    // Baseline: eaten nearly every time. Recent: mostly refused.
    const observations = [
      ...repeat('nuggets', [1, 4, 7, 10], 'refused'),
      ...repeat('nuggets', [12], 'tasted'),
      ...repeat('nuggets', [16, 19, 22, 25, 28, 31, 34, 38], 'ate'),
    ];

    const [row] = score(observations);
    expect(row.level).toBe('at_risk');
    expect(row.score).toBeGreaterThanOrEqual(0.55);
    expect(row.signals.map((s) => s.kind)).toEqual(
      expect.arrayContaining(['declining_acceptance', 'rising_refusals'])
    );
    expect(row.baselineAcceptanceRate).toBe(1);
    expect(row.recentAcceptanceRate).toBeLessThan(0.2);
    expect(selectSlippingSafeFoods(score(observations))).toHaveLength(1);
  });

  it('does not flag on insufficient data, however bad the recent run looks', () => {
    // Three refusals is a terrible week and still not enough to call it.
    const observations = [
      ...repeat('nuggets', [1, 4, 7], 'refused'),
      ...repeat('nuggets', [18, 24, 30], 'ate'),
    ];

    const [row] = score(observations);
    expect(row.insufficientData).toBe(true);
    expect(row.level).toBe('none');
    expect(row.signals).toEqual([]);
    expect(row.observations).toEqual({ recent: 3, baseline: 3 });
  });

  it('requires the minimum in BOTH windows, not just overall', () => {
    const observations = [
      ...repeat('nuggets', [1, 3, 5, 7, 9, 11], 'refused'),
      ...repeat('nuggets', [20, 26], 'ate'),
    ];

    const [row] = score(observations);
    expect(row.observations.recent).toBeGreaterThanOrEqual(MIN_OBSERVATIONS);
    expect(row.observations.baseline).toBeLessThan(MIN_OBSERVATIONS);
    expect(row.insufficientData).toBe(true);
    expect(row.level).toBe('none');
  });

  it('clears the flag once the food recovers', () => {
    // Same bad patch as the decline case, but the three most recent servings
    // all went fine.
    const observations = [
      ...repeat('nuggets', [1, 3, 5], 'ate'),
      ...repeat('nuggets', [8, 10, 12], 'refused'),
      ...repeat('nuggets', [16, 19, 22, 25, 28, 31, 34, 38], 'ate'),
    ];

    const [row] = score(observations);
    expect(row.level).toBe('none');
    expect(row.signals).toEqual([{ kind: 'recovering', cleanServings: 3 }]);
  });

  it('does not treat a partial recovery as a recovery', () => {
    const observations = [
      ...repeat('nuggets', [1, 3], 'ate'),
      ...repeat('nuggets', [5, 8, 10, 12], 'refused'),
      ...repeat('nuggets', [16, 19, 22, 25, 28, 31, 34, 38], 'ate'),
    ];

    const [row] = score(observations);
    expect(row.signals.map((s) => s.kind)).not.toContain('recovering');
    expect(row.level).not.toBe('none');
  });

  it('never flags on over-serving alone', () => {
    // Served constantly and eaten every single time. That is dinner, not risk.
    const days = [0, 1, 2, 3, 4, 5, 6, 7, 9, 11, 13, 16, 20, 24, 28, 34];
    const observations = repeat('nuggets', days, 'ate');
    const planEntries = days.map((d) => ({
      foodId: 'nuggets',
      date: new Date(Date.parse(`${AS_OF}T12:00:00Z`) - d * 86_400_000).toISOString().slice(0, 10),
    }));

    const [row] = score(observations, planEntries);
    expect(row.level).toBe('none');
    expect(row.signals.map((s) => s.kind)).not.toContain('over_served');
  });

  it('adds over-serving as an aggravator once a decline is already visible', () => {
    const observations = [
      ...repeat('nuggets', [1, 3, 6, 9], 'refused'),
      ...repeat('nuggets', [11], 'tasted'),
      ...repeat('nuggets', [16, 19, 22, 25, 28, 31], 'ate'),
    ];
    const planDays = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 26];
    const planEntries = planDays.map((d) => ({
      foodId: 'nuggets',
      date: new Date(Date.parse(`${AS_OF}T12:00:00Z`) - d * 86_400_000).toISOString().slice(0, 10),
    }));

    const withoutFatigue = score(observations)[0];
    const withFatigue = score(observations, planEntries)[0];

    expect(withFatigue.signals.map((s) => s.kind)).toContain('over_served');
    expect(withFatigue.score).toBeGreaterThan(withoutFatigue.score);
  });

  it('only scores foods marked safe', () => {
    const rows = score([
      ...repeat('broccoli', [1, 3, 5, 7], 'refused'),
      ...repeat('broccoli', [16, 20, 24, 28], 'ate'),
    ]);

    expect(rows.map((r) => r.foodId)).toEqual(['nuggets']);
    expect(rows[0].insufficientData).toBe(true);
  });

  it('ignores unrecognized outcome labels rather than guessing', () => {
    const observations = [
      ...repeat('nuggets', [1, 4, 7, 10], 'skipped'),
      ...repeat('nuggets', [16, 19, 22, 25], 'ate'),
    ];

    const [row] = score(observations);
    expect(row.observations.recent).toBe(0);
    expect(row.insufficientData).toBe(true);
  });

  it('ignores future-dated plan entries, which are plans and not outcomes', () => {
    const observations = [
      ...repeat('nuggets', [-3, -1], 'refused'),
      ...repeat('nuggets', [1, 4, 7, 10], 'refused'),
      ...repeat('nuggets', [16, 19, 22, 25], 'ate'),
    ];

    const [row] = score(observations);
    expect(row.observations.recent).toBe(4);
  });

  it('orders the worst food first', () => {
    const foods = [
      { id: 'nuggets', name: 'Chicken nuggets', isSafe: true },
      { id: 'toast', name: 'Toast', isSafe: true },
    ];

    const rows = scoreSafeFoodRisk({
      foods,
      asOf: AS_OF,
      observations: [
        // Nuggets: total collapse.
        ...repeat('nuggets', [1, 4, 7, 10], 'refused'),
        ...repeat('nuggets', [16, 19, 22, 25], 'ate'),
        // Toast: softer slide — still eaten about half the time, and it was
        // never perfect to begin with.
        ...repeat('toast', [2, 9], 'ate'),
        ...repeat('toast', [6], 'tasted'),
        ...repeat('toast', [4, 12], 'refused'),
        ...repeat('toast', [16, 19, 22, 26, 30], 'ate'),
        ...repeat('toast', [34], 'refused'),
      ],
    });

    expect(rows.map((r) => r.foodId)).toEqual(['nuggets', 'toast']);
    expect(rows[0].score).toBeGreaterThan(rows[1].score);
  });
});
