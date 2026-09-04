import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  buildStockComparisonSample,
  sampleSignature,
  SAMPLE_DIVERGENCE_LIMIT,
} from './stockComparisonSample';
import { summarizeDivergences } from './stockComparison';
import type { StockDivergence } from './stockComparison';

/**
 * The dark-launch evidence is countable (US-785).
 *
 * US-671 compares the ledger against foods.quantity and reports through
 * logger.warn, which in production is a Sentry breadcrumb -- and a breadcrumb
 * only transmits attached to a captured error. On a household where nothing
 * crashes the comparison disagreed with itself and told nobody, so "what
 * fraction of households agree" was unanswerable, and that is exactly the gate
 * US-739 puts on flipping the flag.
 */

const divergence = (over: Partial<StockDivergence> = {}): StockDivergence =>
  ({
    kind: 'value_mismatch',
    itemId: 'item-1',
    ledgerValue: 2,
    legacyValue: 3,
    canonicalUnit: 'g',
    displayUnit: 'oz',
    detail: null,
    ...over,
  }) as StockDivergence;

describe('buildStockComparisonSample', () => {
  it('records an agreeing run', () => {
    // The numerator of the agreement rate. Recording only disagreements would
    // give a rate computed from failures alone, which is not a rate.
    const sample = buildStockComparisonSample({
      householdId: 'h1',
      itemCount: 12,
      stockRowCount: 12,
      divergences: [],
      summary: summarizeDivergences([]),
    });
    expect(sample.divergence_count).toBe(0);
    expect(sample.divergences).toEqual([]);
    expect(sample.household_id).toBe('h1');
  });

  it('keeps the denominators, without which a count means nothing', () => {
    // Three disagreements across 5 items and across 500 are different findings.
    const sample = buildStockComparisonSample({
      householdId: 'h1',
      itemCount: 500,
      stockRowCount: 480,
      divergences: [divergence()],
      summary: summarizeDivergences([divergence()]),
    });
    expect(sample.item_count).toBe(500);
    expect(sample.stock_row_count).toBe(480);
  });

  it('counts every divergence even though it stores only the first N', () => {
    const many = Array.from({ length: 120 }, (_, i) => divergence({ itemId: `item-${i}` }));
    const sample = buildStockComparisonSample({
      householdId: 'h1',
      itemCount: 120,
      stockRowCount: 120,
      divergences: many,
      summary: summarizeDivergences(many),
    });
    // The count comes from the summary, not the capped array -- otherwise a
    // household diverging on 120 rows is recorded as diverging on 50 and the
    // agreement rate flatters itself.
    expect(sample.divergence_count).toBe(120);
    expect(sample.divergences).toHaveLength(SAMPLE_DIVERGENCE_LIMIT);
  });

  it('breaks the count down by kind', () => {
    const ds = [
      divergence({ kind: 'value_mismatch' }),
      divergence({ kind: 'missing_stock_row' }),
      divergence({ kind: 'missing_stock_row' }),
    ];
    const sample = buildStockComparisonSample({
      householdId: 'h1',
      itemCount: 3,
      stockRowCount: 1,
      divergences: ds,
      summary: summarizeDivergences(ds),
    });
    expect(sample.divergence_kinds.value_mismatch).toBe(1);
    expect(sample.divergence_kinds.missing_stock_row).toBe(2);
  });

  it('carries the app version so a fix reads differently from a regression', () => {
    const sample = buildStockComparisonSample({
      householdId: 'h1',
      itemCount: 1,
      stockRowCount: 1,
      divergences: [],
      summary: summarizeDivergences([]),
      appVersion: '1.2.3',
    });
    expect(sample.app_version).toBe('1.2.3');
  });
});

describe('sampleSignature', () => {
  const base = () =>
    buildStockComparisonSample({
      householdId: 'h1',
      itemCount: 10,
      stockRowCount: 10,
      divergences: [divergence()],
      summary: summarizeDivergences([divergence()]),
    });

  it('is equal for two runs saying the same thing', () => {
    // The effect re-runs on every realtime event and pantry edit. Without this
    // the table fills with a household's noise and the agreement rate counts
    // whoever edits most, not whoever agrees.
    expect(sampleSignature(base())).toBe(sampleSignature(base()));
  });

  it('ignores the per-item detail', () => {
    const a = base();
    const b = { ...base(), divergences: [] };
    expect(sampleSignature(a)).toBe(sampleSignature(b));
  });

  it('changes when the divergence count changes', () => {
    const two = [divergence(), divergence({ itemId: 'item-2' })];
    const b = buildStockComparisonSample({
      householdId: 'h1',
      itemCount: 10,
      stockRowCount: 10,
      divergences: two,
      summary: summarizeDivergences(two),
    });
    expect(sampleSignature(base())).not.toBe(sampleSignature(b));
  });

  it('changes when the household changes', () => {
    const b = { ...base(), household_id: 'h2' };
    expect(sampleSignature(base())).not.toBe(sampleSignature(b));
  });

  it('changes when a run starts agreeing', () => {
    const agreeing = buildStockComparisonSample({
      householdId: 'h1',
      itemCount: 10,
      stockRowCount: 10,
      divergences: [],
      summary: summarizeDivergences([]),
    });
    expect(sampleSignature(base())).not.toBe(sampleSignature(agreeing));
  });
});

describe('the comparison is recorded, not only logged', () => {
  const appContext = readFileSync(
    path.join(process.cwd(), 'src', 'contexts', 'AppContext.tsx'),
    'utf8'
  );

  it('AppContext records a sample', () => {
    expect(appContext).toContain('buildStockComparisonSample');
    expect(appContext).toContain('stock_comparison_samples');
  });

  it('records the agreeing case too, not just the divergent one', () => {
    // `if (summary.total === 0) return;` used to end the effect before
    // anything was recorded, which would have made the rate unmeasurable in
    // the one direction that matters for the flip.
    expect(appContext).not.toMatch(/if \(summary\.total === 0\) return;/);
  });
});

describe('the migration and the diagnostics exist', () => {
  const root = process.cwd();

  it('creates the table with RLS and no update or delete policy', () => {
    const sql = readFileSync(
      path.join(root, 'supabase', 'migrations', '20260903000000_stock_comparison_samples.sql'),
      'utf8'
    );
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.stock_comparison_samples');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FOR SELECT');
    expect(sql).toContain('FOR INSERT');
    // Append-only on purpose: a client that can rewrite its own measurements
    // can make the agreement rate say anything.
    expect(sql).not.toMatch(/FOR UPDATE/);
    expect(sql).not.toMatch(/FOR DELETE/);
  });

  it('ships the query US-739 reads its agreement rate from', () => {
    const sql = readFileSync(
      path.join(root, 'supabase', 'diagnostics', 'us-785-stock-comparison.sql'),
      'utf8'
    );
    expect(sql).toContain('agreement_pct');
    expect(sql).toContain('stock_comparison_samples');
  });
});
