import { describe, it, expect } from 'vitest';
import {
  reachedRowCap,
  FOODS_ROW_CAP,
  RECIPES_ROW_CAP,
  GROCERY_ROW_CAP,
} from './AppContext';

/**
 * US-819. The initial load caps foods, recipes and grocery items, writes the
 * capped slice into state wholesale, and says nothing. A household over the
 * cap sees a partial catalogue that looks complete.
 *
 * The caps are not going away in this change -- pagination is the real fix --
 * so what is pinned here is that the truncation is detectable at all.
 */
describe('reachedRowCap', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('is false for a partial slice', () => {
    expect(reachedRowCap(rows(499), FOODS_ROW_CAP)).toBe(false);
  });

  it('is true at exactly the cap', () => {
    // Ambiguous on purpose: a household with precisely 500 foods is not
    // truncated. That is why the message says what is shown rather than
    // claiming rows were dropped.
    expect(reachedRowCap(rows(500), FOODS_ROW_CAP)).toBe(true);
  });

  it('is true past the cap, in case a query stops enforcing it', () => {
    expect(reachedRowCap(rows(501), FOODS_ROW_CAP)).toBe(true);
  });

  it('treats a missing result as not capped', () => {
    expect(reachedRowCap(null, FOODS_ROW_CAP)).toBe(false);
    expect(reachedRowCap(undefined, FOODS_ROW_CAP)).toBe(false);
  });

  it('is false for an empty household', () => {
    expect(reachedRowCap([], FOODS_ROW_CAP)).toBe(false);
  });

  it('uses each slice its own cap', () => {
    expect(reachedRowCap(rows(200), RECIPES_ROW_CAP)).toBe(true);
    expect(reachedRowCap(rows(200), GROCERY_ROW_CAP)).toBe(false);
  });
});
