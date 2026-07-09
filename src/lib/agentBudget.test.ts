import { describe, it, expect } from 'vitest';

/**
 * US-480: unit tests for budget-guardrail logic (cap-reached skip + mid-loop
 * abort). Pure logic shared with the Deno agent-runtime.
 */
import {
  sumCost,
  isCostCapReached,
  remainingBudget,
  exceedsBudget,
} from '../../supabase/functions/_shared/budget';

describe('sumCost', () => {
  it('sums costs and tolerates null/undefined', () => {
    expect(sumCost([{ cost_usd: 0.1 }, { cost_usd: 0.25 }, { cost_usd: null }, {}])).toBeCloseTo(0.35);
    expect(sumCost([])).toBe(0);
  });
});

describe('isCostCapReached (pre-run skip)', () => {
  it('is false when there is no cap', () => {
    expect(isCostCapReached(1000, null)).toBe(false);
    expect(isCostCapReached(1000, undefined)).toBe(false);
    expect(isCostCapReached(1000, -1)).toBe(false);
  });

  it('is true at or over the cap', () => {
    expect(isCostCapReached(5, 5)).toBe(true);
    expect(isCostCapReached(5.01, 5)).toBe(true);
  });

  it('is false under the cap', () => {
    expect(isCostCapReached(4.99, 5)).toBe(false);
    expect(isCostCapReached(0, 5)).toBe(false);
  });
});

describe('remainingBudget', () => {
  it('is Infinity without a cap', () => {
    expect(remainingBudget(10, null)).toBe(Infinity);
  });

  it('never goes negative', () => {
    expect(remainingBudget(3, 5)).toBe(2);
    expect(remainingBudget(6, 5)).toBe(0);
  });
});

describe('exceedsBudget (mid-loop abort)', () => {
  it('never aborts without a cap', () => {
    expect(exceedsBudget(100, 100, null)).toBe(false);
  });

  it('aborts once the day total passes the cap', () => {
    // started at $4 spent today, this run has accrued $1.50 → $5.50 > $5.
    expect(exceedsBudget(4, 1.5, 5)).toBe(true);
  });

  it('does not abort exactly at the cap (lets the current step finish)', () => {
    expect(exceedsBudget(4, 1, 5)).toBe(false);
  });

  it('does not abort while under the cap', () => {
    expect(exceedsBudget(1, 1, 5)).toBe(false);
  });
});
