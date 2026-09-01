/**
 * US-670: fold inventory movements into balances, client side.
 *
 * The server keeps item_stock current with a trigger. This is the same
 * arithmetic in TypeScript, for optimistic UI and for offline, and the two
 * MUST agree: if they disagree the app shows a parent a number the server does
 * not hold, and the US-666 reconciliation would report drift that is not real.
 *
 * WHY THIS SUMS REVERSALS RATHER THAN EXCLUDING THEM.
 *
 * US-670's criterion 2 words the rule as "reversals are excluded from the
 * balance along with the movement that reversed them". The server does not do
 * that; apply_inventory_movement_to_stock() adds every delta it sees, and a
 * reversal is an ordinary row whose delta negates the row it reverses, so the
 * pair cancels.
 *
 * The two rules give the same answer whenever a reversal is an exact negation,
 * which rpc_reverse_movements_by_ref (US-677) guarantees. They differ only when
 * the data is malformed, and then:
 *
 *   summing   always agrees with item_stock, because it is the same operation
 *   excluding silently disagrees, and the disagreement surfaces as phantom
 *             drift in a reconciliation report that is meant to be trustworthy
 *
 * There is also a subtler reason. `reversed_by_id` points at a row that may not
 * be in the set you are folding: page a household's history and the original
 * can arrive without its reversal. Excluding on a back-pointer then drops the
 * original and keeps nothing to cancel it, which is wrong in a way that looks
 * like a small number rather than an obvious error.
 *
 * So: the balance sums. `reversalAnomalies` reports any pair that fails to
 * cancel, which is the case the excluding rule was really trying to protect
 * against, and a test asserts the two rules coincide on well-formed data.
 *
 * Pure: no I/O, no clock, no Supabase import.
 *
 * Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md
 */

/** The movement fields the fold reads. A subset of `inventory_movements`. */
export interface LedgerMovement {
  id: string;
  item_id: string;
  delta: number;
  canonical_unit: string;
  /** Set on an ORIGINAL when a reversal was appended against it. */
  reversed_by_id?: string | null;
}

export interface ItemBalance {
  onHand: number;
  canonicalUnit: string;
  /** Ids already folded in, so the same movement cannot count twice. */
  seen: ReadonlySet<string>;
}

export type LedgerState = ReadonlyMap<string, ItemBalance>;

export interface LedgerAnomaly {
  kind: 'mixed_units' | 'unbalanced_reversal' | 'invalid_delta';
  movementId: string;
  itemId: string;
  detail: string;
}

const EMPTY: LedgerState = new Map();

/** A fresh, empty ledger state. */
export function emptyLedger(): LedgerState {
  return EMPTY;
}

/** On-hand amount for an item, or 0 when nothing has moved. */
export function balanceOf(state: LedgerState, itemId: string): number {
  return state.get(itemId)?.onHand ?? 0;
}

/** Canonical unit an item's balance is denominated in, or null if unknown. */
export function unitOf(state: LedgerState, itemId: string): string | null {
  return state.get(itemId)?.canonicalUnit ?? null;
}

function isUsable(m: LedgerMovement | null | undefined): m is LedgerMovement {
  return (
    !!m &&
    typeof m.id === 'string' &&
    m.id.length > 0 &&
    typeof m.item_id === 'string' &&
    m.item_id.length > 0 &&
    typeof m.delta === 'number' &&
    Number.isFinite(m.delta)
  );
}

/**
 * Fold one movement into a state, returning a NEW state.
 *
 * Applying the same movement id twice is a no-op, which is what makes an
 * offline queue safe to replay: the server rejects the duplicate on its primary
 * key and the client must reach the same balance either way.
 *
 * A movement whose unit disagrees with the item's established unit is ignored
 * rather than added, mirroring the server trigger, which raises instead of
 * accumulating grams into millilitres.
 */
export function applyMovement(state: LedgerState, movement: LedgerMovement): LedgerState {
  if (!isUsable(movement)) return state;

  const current = state.get(movement.item_id);

  if (current) {
    if (current.seen.has(movement.id)) return state;
    if (current.canonicalUnit !== movement.canonical_unit) return state;
  }

  const next = new Map(state);
  const seen = new Set(current?.seen ?? []);
  seen.add(movement.id);

  next.set(movement.item_id, {
    onHand: (current?.onHand ?? 0) + movement.delta,
    canonicalUnit: current?.canonicalUnit ?? movement.canonical_unit,
    seen,
  });

  return next;
}

/**
 * Fold a whole list into balances.
 *
 * Order-independent for movements of the same item: addition commutes, and
 * duplicates are dropped by id rather than by position. The one order-sensitive
 * detail is which unit an item adopts when its movements disagree, and that is
 * a malformed state the server refuses to create; `reversalAnomalies` and
 * `ledgerAnomalies` report it rather than hiding it.
 */
export function foldMovements(movements: readonly LedgerMovement[]): LedgerState {
  const acc = new Map<string, { onHand: number; canonicalUnit: string; seen: Set<string> }>();

  for (const movement of movements ?? []) {
    if (!isUsable(movement)) continue;

    const current = acc.get(movement.item_id);
    if (!current) {
      acc.set(movement.item_id, {
        onHand: movement.delta,
        canonicalUnit: movement.canonical_unit,
        seen: new Set([movement.id]),
      });
      continue;
    }
    if (current.seen.has(movement.id)) continue;
    if (current.canonicalUnit !== movement.canonical_unit) continue;
    current.onHand += movement.delta;
    current.seen.add(movement.id);
  }

  return acc as unknown as LedgerState;
}

/**
 * The balance excluding every reversed original AND the reversal that
 * cancelled it, which is how US-670's criterion 2 words the rule.
 *
 * Exported so the equivalence can be asserted rather than assumed: on
 * well-formed data this returns exactly what `foldMovements` returns. It is not
 * what the app uses, for the reasons in the module header.
 */
export function foldExcludingReversals(movements: readonly LedgerMovement[]): LedgerState {
  const usable = (movements ?? []).filter(isUsable);
  const reversedOriginals = new Set<string>();
  const reversalRows = new Set<string>();

  for (const m of usable) {
    if (m.reversed_by_id) {
      reversedOriginals.add(m.id);
      reversalRows.add(m.reversed_by_id);
    }
  }

  return foldMovements(
    usable.filter((m) => !reversedOriginals.has(m.id) && !reversalRows.has(m.id))
  );
}

/**
 * Reversal pairs that do not cancel, plus movements the fold had to ignore.
 *
 * This is the failure the excluding rule was really guarding against, made
 * visible instead of absorbed into a balance.
 */
export function ledgerAnomalies(movements: readonly LedgerMovement[]): LedgerAnomaly[] {
  const out: LedgerAnomaly[] = [];
  const byId = new Map<string, LedgerMovement>();
  const unitByItem = new Map<string, string>();

  // Deliberately widened: `isUsable` is a type predicate, so narrowing on its
  // negation against an already-typed value collapses the failing branch to
  // `never` and the reported fields become unreachable.
  const candidates = (movements ?? []) as readonly Partial<LedgerMovement>[];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate.id !== 'string') continue;
    if (!isUsable(candidate as LedgerMovement)) {
      out.push({
        kind: 'invalid_delta',
        movementId: String(candidate.id ?? ''),
        itemId: String(candidate.item_id ?? ''),
        detail: `delta is not a finite number: ${String(candidate.delta)}`,
      });
      continue;
    }
    const m = candidate as LedgerMovement;
    byId.set(m.id, m);
    const known = unitByItem.get(m.item_id);
    if (known === undefined) unitByItem.set(m.item_id, m.canonical_unit);
    else if (known !== m.canonical_unit) {
      out.push({
        kind: 'mixed_units',
        movementId: m.id,
        itemId: m.item_id,
        detail: `movement is in ${m.canonical_unit} but the item's balance is held in ${known}`,
      });
    }
  }

  for (const m of byId.values()) {
    if (!m.reversed_by_id) continue;
    const reversal = byId.get(m.reversed_by_id);
    if (!reversal) continue; // not in this page; not an anomaly on its own
    if (reversal.delta + m.delta !== 0) {
      out.push({
        kind: 'unbalanced_reversal',
        movementId: m.id,
        itemId: m.item_id,
        detail: `reversal ${reversal.id} has delta ${reversal.delta}, which does not cancel ${m.delta}`,
      });
    }
  }

  return out;
}

/** Convenience: apply many movements in sequence, for tests and optimistic UI. */
export function applyAll(
  state: LedgerState,
  movements: readonly LedgerMovement[]
): LedgerState {
  let next = state;
  for (const movement of movements ?? []) next = applyMovement(next, movement);
  return next;
}
