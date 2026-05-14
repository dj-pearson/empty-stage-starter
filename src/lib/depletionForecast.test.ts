/**
 * US-299: depletionForecast unit tests.
 *
 * Each scenario fixes a deterministic `asOf` so weekday-formatted chip
 * labels and runOutDate math are reproducible across timezones.
 */

import { describe, it, expect } from 'vitest';
import {
  forecastRunOutDate,
  urgencyBucket,
  chipLabel,
  toDate,
} from './depletionForecast';

const REFERENCE_NOW = new Date('2026-05-13T12:00:00Z');

function daysBefore(n: number, base = REFERENCE_NOW): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

describe('forecastRunOutDate', () => {
  describe('cold-start (<2 cycles)', () => {
    it('returns cold-start confidence when history is empty', () => {
      const f = forecastRunOutDate([], 5, { asOf: REFERENCE_NOW });
      expect(f.confidence).toBe('cold-start');
      expect(f.cycleCount).toBe(0);
      expect(f.dailyConsumption).toBeCloseTo(1 / 14, 5);
    });

    it('uses caller-provided category default when supplied', () => {
      // Category default of 1 / 7 = "runs out in `qty` weeks" pace.
      const f = forecastRunOutDate([], 7, {
        asOf: REFERENCE_NOW,
        coldStartDailyConsumption: 1 / 7,
      });
      expect(f.dailyConsumption).toBeCloseTo(1 / 7, 5);
      expect(f.daysToDepletion).toBe(49); // 7 / (1/7) = 49
    });

    it('treats a single timestamp as cold-start (no interval computable)', () => {
      const f = forecastRunOutDate([daysBefore(10)], 5, { asOf: REFERENCE_NOW });
      expect(f.confidence).toBe('cold-start');
      expect(f.cycleCount).toBe(0);
    });
  });

  describe('steady-state cadence', () => {
    it('yields high confidence with >=5 evenly-spaced cycles', () => {
      // Restock every 7 days for the last ~6 weeks.
      const history = [42, 35, 28, 21, 14, 7].map((n) => daysBefore(n));
      const f = forecastRunOutDate(history, 7, { asOf: REFERENCE_NOW });
      expect(f.confidence).toBe('high');
      expect(f.cycleCount).toBe(5);
      // 1 unit per 7 days → 1/7 per day → 7 units lasts 49 days.
      expect(f.dailyConsumption).toBeCloseTo(1 / 7, 5);
      expect(f.daysToDepletion).toBe(49);
    });

    it('produces an in-window runOutDate', () => {
      const history = [21, 14, 7].map((n) => daysBefore(n));
      // 2 units, restock every 7d → consumed in 14 days.
      const f = forecastRunOutDate(history, 2, { asOf: REFERENCE_NOW });
      const expected = new Date(REFERENCE_NOW);
      expected.setUTCDate(expected.getUTCDate() + 14);
      expect(f.runOutDate.toISOString().slice(0, 10)).toBe(
        expected.toISOString().slice(0, 10)
      );
    });
  });

  describe('mid-confidence band (2-4 cycles)', () => {
    it('returns low confidence on exactly 2 cycles', () => {
      const history = [21, 14, 7].map((n) => daysBefore(n));
      // 3 timestamps → 2 intervals → 2 cycles.
      const f = forecastRunOutDate(history, 5, { asOf: REFERENCE_NOW });
      expect(f.cycleCount).toBe(2);
      expect(f.confidence).toBe('low');
    });

    it('returns medium confidence on 3-4 cycles', () => {
      const history = [28, 21, 14, 7].map((n) => daysBefore(n));
      const f = forecastRunOutDate(history, 5, { asOf: REFERENCE_NOW });
      expect(f.cycleCount).toBe(3);
      expect(f.confidence).toBe('medium');
    });
  });

  describe('irregular cadence', () => {
    it('demotes to medium even with 5 cycles when CV >= 0.3', () => {
      // Wildly varying gaps: 2d, 14d, 3d, 21d, 7d, 4d → CV well over 0.3.
      const history = [51, 47, 26, 23, 9, 2].map((n) => daysBefore(n));
      const f = forecastRunOutDate(history, 5, { asOf: REFERENCE_NOW });
      expect(f.cycleCount).toBe(5);
      expect(f.confidence).toBe('medium');
    });
  });

  describe('seasonal clamp', () => {
    it('forces low confidence when caller flags out-of-window', () => {
      const history = [35, 28, 21, 14, 7].map((n) => daysBefore(n));
      const f = forecastRunOutDate(history, 5, {
        asOf: REFERENCE_NOW,
        seasonalOutOfWindow: true,
      });
      // Would otherwise be high.
      expect(f.confidence).toBe('low');
    });
  });

  describe('edge cases', () => {
    it('skips invalid timestamps without poisoning the median', () => {
      const history: any[] = [
        daysBefore(28),
        'not-a-date',
        daysBefore(21),
        null,
        daysBefore(14),
        daysBefore(7),
      ];
      const f = forecastRunOutDate(history, 5, { asOf: REFERENCE_NOW });
      // 4 valid timestamps -> 3 cycles
      expect(f.cycleCount).toBe(3);
    });

    it('returns zero daysToDepletion when pantry is empty', () => {
      const history = [21, 14, 7].map((n) => daysBefore(n));
      const f = forecastRunOutDate(history, 0, { asOf: REFERENCE_NOW });
      expect(f.daysToDepletion).toBe(0);
    });

    it('ignores duplicate or out-of-order timestamps via sort', () => {
      // Same set, scrambled order.
      const history = [daysBefore(7), daysBefore(28), daysBefore(14), daysBefore(21)];
      const f = forecastRunOutDate(history, 4, { asOf: REFERENCE_NOW });
      // Restock every 7d → 4 units lasts 28 days.
      expect(f.dailyConsumption).toBeCloseTo(1 / 7, 5);
      expect(f.daysToDepletion).toBe(28);
    });
  });

  describe('toDate helper', () => {
    it('accepts Date instances', () => {
      const d = new Date('2026-01-01');
      expect(toDate(d)).toEqual(d);
    });

    it('accepts ISO strings', () => {
      expect(toDate('2026-01-01')?.toISOString().slice(0, 10)).toBe('2026-01-01');
    });

    it('rejects invalid input', () => {
      expect(toDate('totally not a date')).toBeNull();
      expect(toDate(NaN)).toBeNull();
    });
  });
});

describe('urgencyBucket', () => {
  it('returns critical at <= 2 days', () => {
    expect(urgencyBucket(0)).toBe('critical');
    expect(urgencyBucket(2)).toBe('critical');
  });

  it('returns soon between 3 and 7 days', () => {
    expect(urgencyBucket(3)).toBe('soon');
    expect(urgencyBucket(7)).toBe('soon');
  });

  it('returns later beyond 7 days', () => {
    expect(urgencyBucket(8)).toBe('later');
    expect(urgencyBucket(30)).toBe('later');
  });
});

describe('chipLabel', () => {
  it('renders "Out today" at 0 days', () => {
    expect(chipLabel(0, REFERENCE_NOW)).toBe('Out today');
  });

  it('renders "Out tomorrow" at 1 day', () => {
    expect(chipLabel(1, REFERENCE_NOW)).toBe('Out tomorrow');
  });

  it('renders weekday for 3..7 day forecasts', () => {
    // 2026-05-13 is a Wednesday in UTC. +4 days = Sunday.
    const label = chipLabel(4, REFERENCE_NOW);
    expect(label).toMatch(/^Runs out [A-Za-z]+$/);
  });

  it('renders "next week" between 8 and 14 days', () => {
    expect(chipLabel(10, REFERENCE_NOW)).toBe('Runs out next week');
  });

  it('falls back to "in N days" beyond 14', () => {
    expect(chipLabel(30, REFERENCE_NOW)).toBe('Runs out in 30 days');
  });
});
