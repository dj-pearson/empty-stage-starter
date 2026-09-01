/**
 * US-671: compare the ledger balance against the legacy `foods.quantity`
 * column, so the dark launch can be judged on evidence rather than on nerve.
 *
 * The rollout rule from the design doc is "run the ledger balance alongside
 * foods.quantity on real households, compare, and flip only when they agree".
 * This is the comparison. It runs with the flag OFF, on every load, and logs
 * what disagrees; nothing here changes what a parent sees.
 *
 * WHICH DIRECTION THE COMPARISON RUNS, AND WHY IT MATTERS.
 *
 * The obvious version converts `foods.quantity` INTO canonical units and
 * compares against `item_stock.on_hand_canonical`. It is also useless. Every
 * `foods.unit` in the sampled production data is 'servings' or 'packages', and
 * `toCanonical` correctly refuses those: nobody has said what a serving weighs.
 * That version would report "unconvertible" for essentially every row and the
 * dark launch would learn nothing.
 *
 * So it runs the other way, canonical -> display, through `fromCanonical`,
 * which is the same function the US-667 trigger uses to WRITE foods.quantity.
 * Agreement then means precisely the thing worth knowing: the mirror is
 * tracking the ledger, so an old iOS build reading foods.quantity and a new
 * client reading the ledger are seeing the same pantry.
 *
 * A disagreement is never assumed to be the ledger's fault. `mirror_unconvertible`
 * is the server admitting it could not express a balance in the item's display
 * unit and left the old value alone, which is a stale legacy column rather than
 * a wrong ledger, and it is reported as its own kind so the two are not counted
 * together.
 *
 * Pure: no I/O, no clock, no Supabase import, no React.
 *
 * Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md
 */

import { fromCanonical, type CanonicalItemFacts } from '@/lib/canonicalUnits';

/** The `item_stock` fields the comparison reads. */
export interface StockRow {
  item_id: string;
  on_hand_canonical: number;
  canonical_unit: string;
  /** US-667: the last mirror could not write foods.quantity for this item. */
  mirror_unconvertible?: boolean | null;
}

/**
 * The item-side facts the comparison reads. A subset of a `foods` row, widened
 * from `Food` because the catalog columns (canonical_unit, unit_conversions,
 * density_g_per_ml) are carried through `normalizeFoodFromDB`'s row spread but
 * are not yet on the `Food` interface.
 */
export interface ComparableItem extends CanonicalItemFacts {
  id: string;
  quantity?: number | null;
  unit?: string | null;
}

export type DivergenceKind =
  /** Both sides produced a number and the numbers differ. Real drift. */
  | 'value_mismatch'
  /** The ledger holds a balance for an item the foods slice does not have. */
  | 'orphan_stock'
  /** foods.quantity claims stock for an item the ledger has never moved. */
  | 'missing_stock_row'
  /** The server flagged that it could not mirror this balance. Stale, not wrong. */
  | 'mirror_unconvertible'
  /** The client could not express the balance in the item's display unit. */
  | 'unconvertible';

export interface StockDivergence {
  kind: DivergenceKind;
  itemId: string;
  /** Ledger balance rendered in the item's display unit, or null. */
  ledgerValue: number | null;
  /** What foods.quantity says today, or null when the item is absent. */
  legacyValue: number | null;
  canonicalUnit: string | null;
  displayUnit: string | null;
  /** Plain-language cause, safe to log. */
  detail: string;
}

export interface CompareOptions {
  /**
   * Absolute floor for "the same number". Both sides divide by the same
   * conversion factors, but one division happens in Postgres NUMERIC and the
   * other in a JS double, so exact equality would report drift that is only
   * ever the last bits.
   */
  absoluteTolerance?: number;
  /** Relative tolerance, which is what actually matters at pantry magnitudes. */
  relativeTolerance?: number;
}

const DEFAULT_ABSOLUTE_TOLERANCE = 1e-6;
const DEFAULT_RELATIVE_TOLERANCE = 1e-6;

/** Round-trip float noise, not a real difference. */
function approximatelyEqual(a: number, b: number, opts: CompareOptions): boolean {
  const abs = opts.absoluteTolerance ?? DEFAULT_ABSOLUTE_TOLERANCE;
  const rel = opts.relativeTolerance ?? DEFAULT_RELATIVE_TOLERANCE;
  const diff = Math.abs(a - b);
  if (diff <= abs) return true;
  return diff <= rel * Math.max(Math.abs(a), Math.abs(b));
}

/**
 * `normalizeFoodFromDB` collapses 0, a negative and a non-finite quantity to
 * `undefined`, so "the column says nothing" and "the column says zero" arrive
 * here identically. Both mean an empty pantry row to every shipped client, so
 * both read as 0.
 */
function legacyQuantityOf(item: ComparableItem): number {
  const q = item.quantity;
  return typeof q === 'number' && Number.isFinite(q) ? q : 0;
}

/**
 * Every way the ledger and the legacy column disagree, worst first is not
 * attempted: the caller logs all of them and the kinds are what separate a
 * real problem from an expected one.
 */
export function compareLedgerToLegacy(
  stock: readonly StockRow[],
  items: readonly ComparableItem[],
  options: CompareOptions = {}
): StockDivergence[] {
  const out: StockDivergence[] = [];
  const byId = new Map<string, ComparableItem>();
  for (const item of items ?? []) {
    if (item && typeof item.id === 'string' && item.id.length > 0) byId.set(item.id, item);
  }

  const seenStockItems = new Set<string>();

  for (const row of stock ?? []) {
    if (!row || typeof row.item_id !== 'string' || row.item_id.length === 0) continue;
    seenStockItems.add(row.item_id);

    const item = byId.get(row.item_id);
    if (!item) {
      out.push({
        kind: 'orphan_stock',
        itemId: row.item_id,
        ledgerValue: null,
        legacyValue: null,
        canonicalUnit: row.canonical_unit ?? null,
        displayUnit: null,
        detail: `the ledger holds ${row.on_hand_canonical} ${row.canonical_unit} for an item that is not in the loaded foods slice`,
      });
      continue;
    }

    const legacyValue = legacyQuantityOf(item);

    if (row.mirror_unconvertible === true) {
      out.push({
        kind: 'mirror_unconvertible',
        itemId: row.item_id,
        ledgerValue: null,
        legacyValue,
        canonicalUnit: row.canonical_unit ?? null,
        displayUnit: item.unit ?? null,
        detail: `the server could not express ${row.on_hand_canonical} ${row.canonical_unit} in "${item.unit ?? ''}", so foods.quantity is stale at ${legacyValue} rather than wrong`,
      });
      continue;
    }

    const ledgerValue = fromCanonical(row.on_hand_canonical, row.canonical_unit, item.unit, item);

    if (ledgerValue === null) {
      out.push({
        kind: 'unconvertible',
        itemId: row.item_id,
        ledgerValue: null,
        legacyValue,
        canonicalUnit: row.canonical_unit ?? null,
        displayUnit: item.unit ?? null,
        detail: `cannot express ${row.on_hand_canonical} ${row.canonical_unit} in the item display unit "${item.unit ?? ''}"; add a per-item conversion to make it comparable`,
      });
      continue;
    }

    if (!approximatelyEqual(ledgerValue, legacyValue, options)) {
      out.push({
        kind: 'value_mismatch',
        itemId: row.item_id,
        ledgerValue,
        legacyValue,
        canonicalUnit: row.canonical_unit ?? null,
        displayUnit: item.unit ?? null,
        detail: `ledger says ${ledgerValue} and foods.quantity says ${legacyValue}`,
      });
    }
  }

  // The other direction: an item the legacy column claims stock for and the
  // ledger has never moved. Before the US-669 backfill runs this is every item,
  // which is exactly what the comparison should say.
  for (const item of byId.values()) {
    if (seenStockItems.has(item.id)) continue;
    const legacyValue = legacyQuantityOf(item);
    if (legacyValue === 0) continue;
    out.push({
      kind: 'missing_stock_row',
      itemId: item.id,
      ledgerValue: null,
      legacyValue,
      canonicalUnit: null,
      displayUnit: item.unit ?? null,
      detail: `foods.quantity says ${legacyValue} ${item.unit ?? ''} but the ledger has no balance for this item`,
    });
  }

  return out;
}

export interface DivergenceSummary {
  total: number;
  byKind: Record<DivergenceKind, number>;
  /** Divergences that mean the ledger and the legacy column really disagree. */
  drifting: number;
}

/**
 * Counts for one log line, so a household with 400 stale rows does not produce
 * 400 log lines before the interesting one.
 */
export function summarizeDivergences(divergences: readonly StockDivergence[]): DivergenceSummary {
  const byKind: Record<DivergenceKind, number> = {
    value_mismatch: 0,
    orphan_stock: 0,
    missing_stock_row: 0,
    mirror_unconvertible: 0,
    unconvertible: 0,
  };
  for (const d of divergences ?? []) {
    if (d && d.kind in byKind) byKind[d.kind] += 1;
  }
  return {
    total: (divergences ?? []).length,
    byKind,
    // 'mirror_unconvertible' is the server declining to write, and
    // 'missing_stock_row' is the backfill not having reached this item. Neither
    // is the ledger being wrong, so neither blocks the flip on its own.
    drifting: byKind.value_mismatch + byKind.orphan_stock + byKind.unconvertible,
  };
}
