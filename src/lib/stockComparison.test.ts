/**
 * US-671: the dark-launch comparison between the ledger and foods.quantity.
 *
 * The comparison is the thing that decides whether the flag gets flipped, so
 * its failure mode matters more than its success case: a comparison that
 * reports drift the server does not have would stall the rollout, and one that
 * silently converts nothing would wave it through on no evidence at all.
 */
import { describe, it, expect } from 'vitest';
import {
  compareLedgerToLegacy,
  summarizeDivergences,
  type ComparableItem,
  type StockRow,
} from './stockComparison';

const GRAMS = (id: string, quantity: number | undefined, unit: string): ComparableItem => ({
  id,
  quantity,
  unit,
  canonical_unit: 'g',
});

const stock = (
  itemId: string,
  onHand: number,
  unit = 'g',
  extra: Partial<StockRow> = {}
): StockRow => ({
  item_id: itemId,
  on_hand_canonical: onHand,
  canonical_unit: unit,
  ...extra,
});

describe('agreement', () => {
  it('reports nothing when the mirror is tracking the ledger', () => {
    // 2 kg on hand, displayed in kg: the trigger would have written 2.
    const items = [GRAMS('i1', 2, 'kg')];
    expect(compareLedgerToLegacy([stock('i1', 2000)], items)).toEqual([]);
  });

  it('tolerates the last bits of a float round trip', () => {
    // 1 lb is 453.592 g; dividing back out lands a hair off in a JS double.
    const items = [GRAMS('i1', 1, 'lb')];
    const divergences = compareLedgerToLegacy([stock('i1', 453.592)], items);
    expect(divergences).toEqual([]);
  });

  it('treats an absent quantity as the zero every shipped client renders', () => {
    // normalizeFoodFromDB collapses 0 to undefined, so an empty pantry row and
    // an unset one arrive here identically and must both compare equal to 0.
    const items = [GRAMS('i1', undefined, 'g')];
    expect(compareLedgerToLegacy([stock('i1', 0)], items)).toEqual([]);
  });
});

describe('the production shape: an opaque display unit over a count balance', () => {
  // Every foods.unit in the sampled production data is 'servings' or
  // 'packages'. If the comparison cannot handle those it learns nothing at all,
  // which is the failure this test exists to catch.
  const servings: ComparableItem = { id: 'i1', quantity: 3, unit: 'servings', canonical_unit: 'count' };

  it('compares rather than giving up', () => {
    expect(compareLedgerToLegacy([stock('i1', 3, 'count')], [servings])).toEqual([]);
  });

  it('still catches a real mismatch through that rule', () => {
    const divergences = compareLedgerToLegacy([stock('i1', 5, 'count')], [servings]);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({
      kind: 'value_mismatch',
      itemId: 'i1',
      ledgerValue: 5,
      legacyValue: 3,
    });
  });

  it('refuses the same opaque unit over a MASS balance, where it would be a guess', () => {
    const opaqueOverMass: ComparableItem = {
      id: 'i1', quantity: 3, unit: 'servings', canonical_unit: 'g',
    };
    const divergences = compareLedgerToLegacy([stock('i1', 500, 'g')], [opaqueOverMass]);
    expect(divergences).toHaveLength(1);
    expect(divergences[0].kind).toBe('unconvertible');
  });
});

describe('divergence kinds', () => {
  it('reports a value mismatch with the item id and both values', () => {
    const items = [GRAMS('i1', 1, 'kg')];
    const divergences = compareLedgerToLegacy([stock('i1', 2000)], items);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({
      kind: 'value_mismatch',
      itemId: 'i1',
      ledgerValue: 2,
      legacyValue: 1,
      canonicalUnit: 'g',
      displayUnit: 'kg',
    });
    expect(divergences[0].detail).toContain('2');
    expect(divergences[0].detail).toContain('1');
  });

  it('separates the server declining to mirror from the ledger being wrong', () => {
    const items = [GRAMS('i1', 7, 'kg')];
    const divergences = compareLedgerToLegacy(
      [stock('i1', 2000, 'g', { mirror_unconvertible: true })],
      items
    );
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({
      kind: 'mirror_unconvertible',
      itemId: 'i1',
      legacyValue: 7,
    });
    // Not counted as drift: foods.quantity is stale, which is what the server
    // chose on purpose rather than write a wrong number.
    expect(summarizeDivergences(divergences).drifting).toBe(0);
  });

  it('reports a balance for an item that is not in the foods slice', () => {
    const divergences = compareLedgerToLegacy([stock('ghost', 100)], []);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({ kind: 'orphan_stock', itemId: 'ghost' });
  });

  it('reports legacy stock the ledger has never moved', () => {
    const items = [GRAMS('i1', 4, 'kg')];
    const divergences = compareLedgerToLegacy([], items);
    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({
      kind: 'missing_stock_row',
      itemId: 'i1',
      legacyValue: 4,
      ledgerValue: null,
    });
  });

  it('does not call an empty pantry row a missing stock row', () => {
    expect(compareLedgerToLegacy([], [GRAMS('i1', undefined, 'kg')])).toEqual([]);
    expect(compareLedgerToLegacy([], [GRAMS('i1', 0, 'kg')])).toEqual([]);
  });

  it('reports a balance it cannot express in the item display unit', () => {
    const crossDimension: ComparableItem = {
      id: 'i1', quantity: 2, unit: 'cups', canonical_unit: 'g',
    };
    const divergences = compareLedgerToLegacy([stock('i1', 500, 'g')], [crossDimension]);
    expect(divergences).toHaveLength(1);
    expect(divergences[0].kind).toBe('unconvertible');
    // The legacy value is still reported: a developer reading the log needs to
    // know what the old clients are showing, convertible or not.
    expect(divergences[0].legacyValue).toBe(2);
  });

  it('uses a per-item conversion when the item supplies one', () => {
    const cans: ComparableItem = {
      id: 'i1', quantity: 3, unit: 'can', canonical_unit: 'g', unit_conversions: { can: 400 },
    };
    expect(compareLedgerToLegacy([stock('i1', 1200)], [cans])).toEqual([]);
  });
});

describe('summarizeDivergences', () => {
  it('counts by kind and separates real drift from expected staleness', () => {
    const items = [
      GRAMS('mismatch', 1, 'kg'),
      GRAMS('stale', 7, 'kg'),
      GRAMS('unbacked', 4, 'kg'),
    ];
    const divergences = compareLedgerToLegacy(
      [
        stock('mismatch', 2000),
        stock('stale', 2000, 'g', { mirror_unconvertible: true }),
        stock('ghost', 5),
      ],
      items
    );
    const summary = summarizeDivergences(divergences);
    expect(summary.total).toBe(4);
    expect(summary.byKind.value_mismatch).toBe(1);
    expect(summary.byKind.mirror_unconvertible).toBe(1);
    expect(summary.byKind.orphan_stock).toBe(1);
    expect(summary.byKind.missing_stock_row).toBe(1);
    // mismatch + orphan. The stale mirror and the un-backfilled item are not
    // the ledger disagreeing with itself.
    expect(summary.drifting).toBe(2);
  });

  it('is empty and zero for no divergences', () => {
    expect(summarizeDivergences([])).toMatchObject({ total: 0, drifting: 0 });
  });
});

describe('robustness', () => {
  it('skips malformed rows instead of throwing', () => {
    const rows = [
      null,
      { item_id: '', on_hand_canonical: 1, canonical_unit: 'g' },
      stock('i1', 1000),
    ] as unknown as StockRow[];
    const items = [null, { id: '' }, GRAMS('i1', 1, 'kg')] as unknown as ComparableItem[];
    expect(() => compareLedgerToLegacy(rows, items)).not.toThrow();
    expect(compareLedgerToLegacy(rows, items)).toEqual([]);
  });

  it('does not mutate its inputs', () => {
    const rows = [stock('i1', 2000)];
    const items = [GRAMS('i1', 1, 'kg')];
    const snapshot = JSON.stringify({ rows, items });
    compareLedgerToLegacy(rows, items);
    expect(JSON.stringify({ rows, items })).toBe(snapshot);
  });
});
