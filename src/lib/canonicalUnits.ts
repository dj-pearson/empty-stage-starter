/**
 * US-658: convert an amount into the canonical unit an item's ledger is
 * denominated in, with an honest "I don't know" instead of a wrong number.
 *
 * This is the write boundary for `inventory_movements.delta`. Everything that
 * debits or credits stock goes through here, so a movement is either recorded
 * in a unit the ledger can add up, or it is not recorded as arithmetic at all.
 *
 * Why it exists on top of unitNormalize.ts rather than beside it: that module
 * already does generic (qty, unit) -> family conversion well, with 69 tests
 * behind it, and this reuses all of it. What it cannot do is the item-specific
 * part, which is the whole reason string matching could never fix the pantry:
 *
 *   "1 can of tomatoes" is a mass only for THIS product.
 *   "1 bunch of parsley" is a mass only for THIS product.
 *
 * Those live in `foods.unit_conversions`, and they win over anything generic.
 *
 * The failure that motivated the design: AppState.moveCheckedToPantry converts
 * a bought quantity into the pantry row's unit and, when it cannot, adds the
 * raw number anyway and appends the item to a `mismatchedNames` list for the
 * parent to eyeball. That is a wrong total plus a chore. Here, an unconvertible
 * pair returns `{ unknown: true, reason }` and the caller must decide; it can
 * never be mistaken for a number.
 *
 * Pure: no I/O, no clock, no Supabase import.
 *
 * Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md
 */

import { normalize } from '@/lib/unitNormalize';

/** The three families the ledger can do arithmetic in. Matches the
 *  `foods.canonical_unit` CHECK constraint from migration 20260831000001. */
export type CanonicalUnit = 'g' | 'ml' | 'count';

/** The item-side facts this needs. A subset of `foods`, so callers can pass a
 *  row directly without adapting it. */
export interface CanonicalItemFacts {
  /** Unit this item's movements are denominated in. Null = not yet classified. */
  canonical_unit?: CanonicalUnit | string | null;
  /**
   * Per-item conversions, keyed by unit token, valued in `canonical_unit`.
   * e.g. `{ "can": 400, "bunch": 60 }` for an item canonical in grams.
   */
  unit_conversions?: Record<string, number> | null;
  /**
   * Grams per millilitre, for the one cross-dimension case worth supporting.
   * Null means volume and mass do not convert for this item, which is the
   * correct default: 100 ml of honey and 100 ml of water are not the same mass.
   */
  density_g_per_ml?: number | null;
}

export interface CanonicalAmount {
  value: number;
  unit: CanonicalUnit;
  /** Which rule produced this, so callers and tests can assert the path. */
  via: 'item_conversion' | 'generic' | 'density' | 'identity';
}

export interface CanonicalUnknown {
  unknown: true;
  /** Plain-language cause, safe to log and to show a developer. */
  reason: string;
}

export type CanonicalResult = CanonicalAmount | CanonicalUnknown;

/** Narrowing helper so callers do not test for the `unknown` key by hand. */
export function isUnknown(r: CanonicalResult): r is CanonicalUnknown {
  return (r as CanonicalUnknown).unknown === true;
}

const CANONICAL_UNITS: ReadonlySet<string> = new Set(['g', 'ml', 'count']);

/** unitNormalize speaks 'piece' for the count family; the ledger says 'count'. */
function familyToCanonical(family: string): CanonicalUnit | null {
  if (family === 'mass') return 'g';
  if (family === 'volume') return 'ml';
  if (family === 'count') return 'count';
  return null;
}

/** Same token rules unitNormalize applies, so item_conversions keys match. */
function tokenise(unit: string | null | undefined): string {
  if (unit == null) return '';
  return String(unit)
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[\s_-]+/g, ' ');
}

/**
 * Convert `quantity` of `unit` into the item's canonical unit.
 *
 * Resolution order, item-specific first:
 *   1. `item.unit_conversions[unit]` — the only thing that can turn a can, a
 *      bunch or a bag into an amount.
 *   2. Generic conversion within the same dimension, via unitNormalize.
 *   3. Cross-dimension mass/volume, only when the item supplies a density.
 *   4. Otherwise `{ unknown, reason }`.
 *
 * Never throws. Every bad input is a returned value, including a non-finite
 * quantity, an unrecognised unit, a package unit with no per-item conversion,
 * and a cross-dimension pair with no density.
 */
export function toCanonical(
  quantity: number,
  unit: string | null | undefined,
  item: CanonicalItemFacts = {}
): CanonicalResult {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    return { unknown: true, reason: `quantity is not a finite number: ${String(quantity)}` };
  }

  const token = tokenise(unit);
  const declared = item.canonical_unit;
  const target: CanonicalUnit | null =
    declared != null && CANONICAL_UNITS.has(String(declared))
      ? (String(declared) as CanonicalUnit)
      : null;

  // 1. Item-specific conversions win. This is the point of the whole module.
  const conversions = item.unit_conversions;
  if (conversions && typeof conversions === 'object') {
    for (const [key, factor] of Object.entries(conversions)) {
      if (tokenise(key) !== token || token === '') continue;
      if (typeof factor !== 'number' || !Number.isFinite(factor)) {
        return {
          unknown: true,
          reason: `item conversion for "${token}" is not a finite number`,
        };
      }
      if (!target) {
        return {
          unknown: true,
          reason: `item has a conversion for "${token}" but no canonical_unit to express it in`,
        };
      }
      return { value: quantity * factor, unit: target, via: 'item_conversion' };
    }
  }

  // 2. Generic conversion, reusing the existing normaliser.
  const n = normalize(quantity, unit);
  const from = familyToCanonical(n.family);

  if (!from) {
    // 'package' (jar, bag, can) or genuinely unrecognised. Both mean the same
    // thing to the ledger: nobody has said what one of these amounts to.
    const what = n.family === 'package' ? `package unit "${token}"` : `unrecognised unit "${token}"`;
    return {
      unknown: true,
      reason: `${what} has no per-item conversion; add one to foods.unit_conversions to make it countable`,
    };
  }

  // An item with no declared canonical_unit still classifies cleanly: the unit
  // itself says which dimension it belongs to. This is what US-669's backfill
  // uses to populate canonical_unit in the first place.
  if (!target) {
    return { value: n.qty, unit: from, via: n.recognised ? 'generic' : 'identity' };
  }

  if (from === target) {
    return { value: n.qty, unit: target, via: 'generic' };
  }

  // 3. Cross-dimension, only with a density the item supplied.
  const density = item.density_g_per_ml;
  const massVolume =
    (from === 'ml' && target === 'g') || (from === 'g' && target === 'ml');
  if (massVolume) {
    if (typeof density !== 'number' || !Number.isFinite(density) || density <= 0) {
      return {
        unknown: true,
        reason: `cannot convert ${from} to ${target} without a density for this item`,
      };
    }
    const value = from === 'ml' ? n.qty * density : n.qty / density;
    return { value, unit: target, via: 'density' };
  }

  // count <-> mass/volume. There is no general answer and a density does not
  // help: how many grams a "piece" weighs is per-item, so it belongs in
  // unit_conversions, not here.
  return {
    unknown: true,
    reason: `cannot convert ${from} to ${target}; add a per-item conversion for "${token}"`,
  };
}

/**
 * Convenience for the common shape: fold a list of amounts into one canonical
 * total, reporting anything that could not be converted rather than dropping
 * it silently.
 *
 * The ledger uses this when a single action produces several movements, so a
 * partial failure is visible as a list rather than as a quietly smaller total.
 */
export function sumCanonical(
  parts: { quantity: number; unit?: string | null }[],
  item: CanonicalItemFacts = {}
): { total: number; unit: CanonicalUnit | null; unconvertible: CanonicalUnknown[] } {
  let total = 0;
  let unit: CanonicalUnit | null = null;
  const unconvertible: CanonicalUnknown[] = [];

  for (const part of parts) {
    const r = toCanonical(part.quantity, part.unit, item);
    if (isUnknown(r)) {
      unconvertible.push(r);
      continue;
    }
    if (unit === null) {
      unit = r.unit;
    } else if (unit !== r.unit) {
      unconvertible.push({
        unknown: true,
        reason: `mixed canonical units in one sum: ${unit} and ${r.unit}`,
      });
      continue;
    }
    total += r.value;
  }

  return { total, unit, unconvertible };
}
