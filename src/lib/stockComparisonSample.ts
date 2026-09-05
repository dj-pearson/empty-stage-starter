import type { DivergenceSummary, StockDivergence } from '@/lib/stockComparison';

/**
 * Turn a ledger-vs-legacy comparison run into a row worth keeping (US-785).
 *
 * Kitchen-loop US-671 runs the comparison with the ledger flag OFF and reports
 * what disagrees through logger.warn. In production that is a Sentry
 * breadcrumb, and a breadcrumb only transmits attached to a captured error --
 * so on a household where nothing crashes, the comparison runs, disagrees, and
 * tells nobody. The design spec's safety rail is to flip the flag only once the
 * two agree on real households, and household-planner US-739 AC 6 wants the
 * agreement rate written down before the flip. Neither is answerable from
 * breadcrumbs.
 *
 * Pure, so the shape of what gets recorded is testable without a database.
 */

/** How many per-item divergences a single sample carries. */
export const SAMPLE_DIVERGENCE_LIMIT = 50;

export interface StockComparisonSampleInput {
  householdId: string;
  itemCount: number;
  stockRowCount: number;
  divergences: readonly StockDivergence[];
  summary: DivergenceSummary;
  appVersion?: string | null;
  limit?: number;
}

export interface StockComparisonSample {
  household_id: string;
  item_count: number;
  stock_row_count: number;
  divergence_count: number;
  divergence_kinds: Record<string, number>;
  divergences: Array<{
    kind: string;
    itemId: string;
    ledgerValue: number | null;
    legacyValue: number | null;
    canonicalUnit: string | null;
    displayUnit: string | null;
  }>;
  app_version: string | null;
}

export function buildStockComparisonSample({
  householdId,
  itemCount,
  stockRowCount,
  divergences,
  summary,
  appVersion = null,
  limit = SAMPLE_DIVERGENCE_LIMIT,
}: StockComparisonSampleInput): StockComparisonSample {
  return {
    household_id: householdId,
    item_count: itemCount,
    stock_row_count: stockRowCount,
    // From the summary, not from the array length: the array is capped and the
    // count must not be, or a household diverging on 500 rows would be recorded
    // as diverging on 50 and the agreement rate would flatter itself.
    divergence_count: summary.total,
    divergence_kinds: { ...summary.byKind },
    divergences: (divergences ?? []).slice(0, limit).map((d) => ({
      kind: d.kind,
      itemId: d.itemId,
      ledgerValue: d.ledgerValue ?? null,
      legacyValue: d.legacyValue ?? null,
      canonicalUnit: d.canonicalUnit ?? null,
      displayUnit: d.displayUnit ?? null,
    })),
    app_version: appVersion ?? null,
  };
}

/**
 * A stable fingerprint of what a sample says.
 *
 * The comparison effect re-runs on every realtime event and every pantry edit.
 * Writing a row each time would bill a household's noise as evidence and bury
 * the moment something actually changed. Recording a sample only when the
 * fingerprint moves keeps one row per distinct state per session, which is what
 * an agreement rate wants to count.
 *
 * Deliberately excludes the per-item detail and the timestamp: two runs that
 * disagree about the same items in the same way are the same observation.
 */
export function sampleSignature(sample: StockComparisonSample): string {
  const kinds = Object.keys(sample.divergence_kinds)
    .sort()
    .map((k) => `${k}=${sample.divergence_kinds[k]}`)
    .join(',');
  return [
    sample.household_id,
    sample.item_count,
    sample.stock_row_count,
    sample.divergence_count,
    kinds,
  ].join('|');
}
