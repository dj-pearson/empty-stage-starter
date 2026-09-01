/**
 * US-672: turn a thing a parent did into a row the ledger can hold.
 *
 * Every write into `inventory_movements` is built here, so the rules that make
 * the ledger trustworthy live in one pure, tested place rather than being
 * restated at each call site:
 *
 *   - a delta is in the item's canonical unit, or the movement is not built
 *   - a movement that moves nothing is not a movement (CHECK delta <> 0)
 *   - what the parent actually typed is kept alongside the canonical amount
 *   - a price is recorded with its currency or not at all
 *
 * NOTHING HERE GUESSES. A builder that cannot express an amount in the item's
 * canonical unit returns `{ skipped, reason }` rather than a number. That is
 * the whole lesson of the code this replaces: AppState.moveCheckedToPantry
 * adds a raw quantity when it cannot convert and appends the item to a
 * `mismatchedNames` list for the parent to eyeball, which is a wrong total plus
 * a chore. A skipped movement leaves the balance unchanged and says why.
 *
 * Pure: no I/O, no clock, no Supabase import, no id generation. The caller
 * supplies `id` and `occurredAt`, which is what makes a retry idempotent
 * (criterion 5) and what makes every case here testable without mocking time.
 *
 * Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md
 */

import { toCanonicalInItemUnit, isUnknown, type CanonicalUnit, type CanonicalItemFacts } from '@/lib/canonicalUnits';

/** Matches the `reason` CHECK on inventory_movements. */
export type MovementReason = 'purchase' | 'cook' | 'waste' | 'expire' | 'correction' | 'initial';

/** Matches the `ref_type` CHECK on inventory_movements. */
export type MovementRefType = 'meal' | 'grocery_item' | 'receipt' | 'merge';

/**
 * A row ready to insert. Deliberately not the generated `Insert` type: this is
 * the subset the client supplies, leaving occurred_at/created_at defaults and
 * reversed_by_id to the server.
 */
export interface MovementDraft {
  id: string;
  household_id: string;
  item_id: string;
  delta: number;
  canonical_unit: CanonicalUnit;
  display_quantity: number | null;
  display_unit: string | null;
  reason: MovementReason;
  ref_type: MovementRefType | null;
  ref_id: string | null;
  created_by: string;
  unit_price: number | null;
  currency: string | null;
}

export interface MovementSkipped {
  skipped: true;
  /** Plain-language cause, safe to log and to show a developer. */
  reason: string;
  /** Which item could not be moved, when that is known. */
  itemId: string | null;
}

export type MovementResult = MovementDraft | MovementSkipped;

export function isSkipped(r: MovementResult): r is MovementSkipped {
  return (r as MovementSkipped).skipped === true;
}

/** The item-side facts a builder reads. A subset of a `foods` row. */
export interface MovementItem extends CanonicalItemFacts {
  id: string;
  /** The item's display unit, which is what a typed quantity is denominated in. */
  unit?: string | null;
}

interface CommonInput {
  id: string;
  householdId: string;
  userId: string;
  item: MovementItem;
}

function missing(field: string, itemId: string | null): MovementSkipped {
  return { skipped: true, reason: `${field} is required to append a movement`, itemId };
}

/**
 * Price and currency travel together or not at all, matching the
 * price_currency_together CHECK. A price without a currency cannot be summed
 * across a household that has ever shopped abroad, so half a pair is dropped
 * rather than stored as a number with no unit.
 */
function pricePair(
  unitPrice: unknown,
  currency: unknown
): { unit_price: number | null; currency: string | null } {
  const price = typeof unitPrice === 'number' && Number.isFinite(unitPrice) ? unitPrice : null;
  const code = typeof currency === 'string' && currency.trim() !== '' ? currency.trim() : null;
  if (price === null || code === null || price < 0) return { unit_price: null, currency: null };
  return { unit_price: price, currency: code };
}

/**
 * The shared core: convert a display amount into the item's canonical unit and
 * assemble a row, or explain why it could not be done.
 *
 * `signedDisplayQuantity` carries the direction. A purchase is positive, a
 * waste is negative, and a correction is whichever way the parent moved the
 * number -- so the sign is decided by the caller and the conversion never has
 * to reason about it.
 */
function buildMovement(
  common: CommonInput,
  params: {
    signedDisplayQuantity: number;
    displayUnit: string | null | undefined;
    reason: MovementReason;
    refType?: MovementRefType | null;
    refId?: string | null;
    unitPrice?: unknown;
    currency?: unknown;
  }
): MovementResult {
  const { id, householdId, userId, item } = common;
  const itemId = item?.id ?? null;

  if (!id) return missing('a client-generated id', itemId);
  if (!householdId) return missing('householdId', itemId);
  if (!userId) return missing('userId', itemId);
  if (!itemId) return missing('item.id', null);

  const { signedDisplayQuantity, displayUnit, reason } = params;

  if (typeof signedDisplayQuantity !== 'number' || !Number.isFinite(signedDisplayQuantity)) {
    return {
      skipped: true,
      reason: `quantity is not a finite number: ${String(signedDisplayQuantity)}`,
      itemId,
    };
  }

  // A movement that moves nothing is noise in an audit trail, and the table
  // refuses it outright (CHECK delta <> 0). Caught here so the caller gets a
  // reason instead of a failed insert.
  if (signedDisplayQuantity === 0) {
    return { skipped: true, reason: 'nothing changed, so there is nothing to record', itemId };
  }

  // toCanonicalInItemUnit, not toCanonical: an item held in 'count' and
  // displayed in an opaque unit ('servings', 'packages') converts one-to-one in
  // its OWN unit, which is the shape essentially every production row has.
  const converted = toCanonicalInItemUnit(signedDisplayQuantity, displayUnit ?? item.unit, item);
  if (isUnknown(converted)) {
    return { skipped: true, reason: converted.reason, itemId };
  }

  // Conversion can round a very small amount to zero (a fraction of a
  // millilitre in litres). The table would reject it, and recording it as
  // "moved" would be a lie either way.
  if (converted.value === 0) {
    return {
      skipped: true,
      reason: `${signedDisplayQuantity} ${String(displayUnit ?? item.unit ?? '')} is zero in ${converted.unit}`,
      itemId,
    };
  }

  return {
    id,
    household_id: householdId,
    item_id: itemId,
    delta: converted.value,
    canonical_unit: converted.unit,
    // What the parent actually said, so the UI can explain a movement as
    // "2 gal" rather than "7570.82 ml".
    display_quantity: signedDisplayQuantity,
    display_unit: (displayUnit ?? item.unit) ?? null,
    reason,
    ref_type: params.refType ?? null,
    ref_id: params.refId ?? null,
    created_by: userId,
    ...pricePair(params.unitPrice, params.currency),
  };
}

/**
 * A parent edited the number on a pantry card.
 *
 * The UI still shows and accepts a single number (criterion 1); the ledger
 * records the DIFFERENCE, because that is the only thing that is actually a
 * fact. "It is 3 now" is a claim about the world that a second device can
 * contradict; "two were used" composes with whatever else happened.
 *
 * The subtraction is done in DISPLAY units and converted once, rather than
 * converting both endpoints and subtracting. Same answer, one rounding step
 * instead of two, and the recorded display_quantity is then exactly the change
 * the parent made.
 */
export function buildCorrectionMovement(
  input: CommonInput & { newQuantity: number; currentQuantity: number }
): MovementResult {
  const { newQuantity, currentQuantity } = input;
  if (typeof newQuantity !== 'number' || !Number.isFinite(newQuantity)) {
    return { skipped: true, reason: `new quantity is not a finite number: ${String(newQuantity)}`, itemId: input.item?.id ?? null };
  }
  const current = typeof currentQuantity === 'number' && Number.isFinite(currentQuantity) ? currentQuantity : 0;
  return buildMovement(input, {
    signedDisplayQuantity: newQuantity - current,
    displayUnit: input.item?.unit,
    reason: 'correction',
  });
}

/** The grocery-row fields a purchase reads. Widened from `GroceryItem`, whose
 *  interface does not yet carry the DB's item_id, price_per_unit or currency
 *  even though they arrive on the row. */
export interface PurchasableGroceryItem {
  id: string;
  name?: string;
  quantity?: number | null;
  unit?: string | null;
  item_id?: string | null;
  price_per_unit?: number | null;
  currency?: string | null;
}

/**
 * A checked row at checkout becomes a credit to the pantry.
 *
 * THE ID IS THE GROCERY ROW'S ID, and that is the whole idempotency story
 * (criteria 5 and 6). There is exactly one purchase movement per grocery row,
 * so deriving the movement id from the row rather than generating a fresh one
 * means a double-tapped checkout, a replayed offline queue and a retried
 * request all collide on the primary key instead of crediting the pantry twice.
 * A random uuid would only be idempotent if the caller happened to hold onto
 * it, which an offline queue can do and a double tap cannot.
 */
export function buildPurchaseMovement(
  input: Omit<CommonInput, 'id'> & { groceryItem: PurchasableGroceryItem; id?: string }
): MovementResult {
  const { groceryItem, item, householdId, userId } = input;
  if (!groceryItem?.id) return missing('a grocery item id', item?.id ?? null);

  const quantity = typeof groceryItem.quantity === 'number' ? groceryItem.quantity : 1;

  return buildMovement(
    { id: input.id ?? groceryItem.id, householdId, userId, item },
    {
      // Buying adds.
      signedDisplayQuantity: Math.abs(quantity),
      // As entered on the list, which is not necessarily the pantry item's
      // unit: a parent buys "2 bottles" of something the pantry holds in ml.
      displayUnit: groceryItem.unit ?? item?.unit,
      reason: 'purchase',
      refType: 'grocery_item',
      refId: groceryItem.id,
      unitPrice: groceryItem.price_per_unit,
      currency: groceryItem.currency,
    }
  );
}

/**
 * A parent threw something out.
 *
 * Its own reason rather than a correction, because "we wasted 400g of spinach"
 * and "I had miscounted" are different facts, and US-681 reports the first one.
 */
export function buildWasteMovement(
  input: CommonInput & { quantity: number; displayUnit?: string | null }
): MovementResult {
  const quantity = typeof input.quantity === 'number' ? input.quantity : Number.NaN;
  return buildMovement(input, {
    // Throwing out removes, whichever sign the caller passed.
    signedDisplayQuantity: Number.isFinite(quantity) ? -Math.abs(quantity) : quantity,
    displayUnit: input.displayUnit ?? input.item?.unit,
    reason: 'waste',
  });
}

/**
 * An arbitrary signed adjustment, in the item's display unit.
 *
 * This is the escape hatch the specific builders are named cases of, and it
 * exists for one job today: undoing a checkout. Until US-677 lands
 * rpc_reverse_movements_by_ref, a purchase is taken back by appending a
 * correction that negates it, which is what a reversal IS in an append-only
 * ledger. Appending a DELTA rather than writing a target quantity is also what
 * makes the undo race-free: whatever else moved in between still composes.
 *
 * Deliberately 'correction' rather than 'waste'. Undoing a shop is not
 * throwing food away, and US-681 reports those separately.
 */
export function buildAdjustmentMovement(
  input: CommonInput & {
    signedQuantity: number;
    displayUnit?: string | null;
    reason?: MovementReason;
    refType?: MovementRefType | null;
    refId?: string | null;
  }
): MovementResult {
  return buildMovement(input, {
    signedDisplayQuantity: input.signedQuantity,
    displayUnit: input.displayUnit ?? input.item?.unit,
    reason: input.reason ?? 'correction',
    refType: input.refType ?? null,
    refId: input.refId ?? null,
  });
}

/**
 * Build many and separate what can be recorded from what cannot, so a caller
 * never has to choose between dropping the failures silently and failing the
 * whole action because one item lacks a conversion.
 */
export function partitionMovements(results: readonly MovementResult[]): {
  movements: MovementDraft[];
  skipped: MovementSkipped[];
} {
  const movements: MovementDraft[] = [];
  const skipped: MovementSkipped[] = [];
  for (const r of results ?? []) {
    if (!r) continue;
    if (isSkipped(r)) skipped.push(r);
    else movements.push(r);
  }
  return { movements, skipped };
}

/**
 * Which pantry item a grocery row credits.
 *
 * Prefers the resolved `item_id` the catalog work populates, and falls back to
 * the SAME lowercased-name match the legacy checkout uses. The fallback is
 * deliberately not the better normalizer from US-657: while both paths can run,
 * they must credit the same item, and a ledger that quietly picked a different
 * row than the legacy write would be far worse than one that matches its
 * mistakes. Moving grocery rows onto the resolver belongs with US-661/US-684.
 */
export function resolveGroceryItemId(
  groceryItem: PurchasableGroceryItem,
  items: readonly MovementItem[]
): string | null {
  if (!groceryItem) return null;
  if (typeof groceryItem.item_id === 'string' && groceryItem.item_id.length > 0) {
    return groceryItem.item_id;
  }
  const name = typeof groceryItem.name === 'string' ? groceryItem.name.toLowerCase() : '';
  if (name === '') return null;
  const match = (items ?? []).find(
    (i) => typeof (i as { name?: string }).name === 'string' &&
      (i as { name?: string }).name!.toLowerCase() === name
  );
  return match?.id ?? null;
}
