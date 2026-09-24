/**
 * Item 16: a receipt closes the shopping loop in one step.
 *
 * The lines a parent confirms do two things together: the grocery rows they
 * pay for are checked off, and the pantry is credited. The pantry side goes
 * through the ledger (a signed `purchase` movement, ref_type 'receipt') when
 * ledger writes are on and through the legacy `foods.quantity` sum otherwise,
 * the same boundary the Pantry page's receipt top-up uses.
 *
 * A row the receipt credited is stamped `pantry_credited_at`, and checkout
 * skips stamped rows (see partitionForCheckout in groceryData), so a shop
 * finished after the scan does not credit the same milk twice. The stamp is on
 * the row so another device, or this one after a reload, sees it too.
 *
 * Undo reverses both halves: the rows go back to unchecked and unstamped, the
 * top-ups are taken back the way they went in, and foods the receipt created
 * are deleted.
 */

import type { Food, GroceryItem } from '@/types';
import {
  acceptedRowsToFoods,
  normalizeReceiptUnit,
  receiptNameKey,
  topUpUnits,
  type ReviewRow,
} from '@/lib/receiptParse';

export interface ReceiptTopUp {
  foodId: string;
  quantityDelta: number;
  /** What the receipt line was sold in; null when it said nothing. */
  unit: string | null;
}

export interface ReceiptApplyPlan {
  /** Unchecked rows of the list on screen that confirmed lines pay for. */
  checkOffRowIds: string[];
  /**
   * For each checked-off row, the line that pays for it, so a row whose
   * pantry credit failed can be left unstamped for checkout to retry.
   */
  lineForRow: Record<string, { foodId: string | null; createKey: string | null }>;
  topUps: ReceiptTopUp[];
  creates: Omit<Food, 'id'>[];
}

/** The key acceptedRowsToFoods folds new foods under. */
export function receiptCreateKey(name: string, unit: string | null | undefined): string {
  return `${receiptNameKey(name)}|${normalizeReceiptUnit(unit)}`;
}

/**
 * What the confirm button will do. `listMatch` is line uid -> grocery row id,
 * already edited by the parent on the review sheet.
 */
export function planReceiptApply(
  rows: readonly ReviewRow[],
  listMatch: ReadonlyMap<string, string | null>,
): ReceiptApplyPlan {
  const accepted = rows.filter((r) => r.accept);
  const { updates, creates } = acceptedRowsToFoods(accepted);
  const units = topUpUnits(accepted);
  const checkOffRowIds: string[] = [];
  const lineForRow: ReceiptApplyPlan['lineForRow'] = {};
  for (const r of accepted) {
    const rowId = listMatch.get(r.uid);
    if (!rowId || lineForRow[rowId]) continue;
    checkOffRowIds.push(rowId);
    lineForRow[rowId] = r.matchedFoodId
      ? { foodId: r.matchedFoodId, createKey: null }
      : { foodId: null, createKey: receiptCreateKey(r.parsedName, r.unit) };
  }
  return {
    checkOffRowIds,
    lineForRow,
    topUps: updates.map((u) => ({ ...u, unit: units.get(u.foodId) ?? null })),
    creates,
  };
}

export interface RestockResult {
  recorded: boolean;
}

export interface ReceiptApplyDeps {
  ledgerWritesEnabled: boolean;
  /** The latest copy of a food, not a render's. */
  getFood: (id: string) => Food | undefined;
  /** Every food held right now; read before and after, for the undo of creates. */
  getFoods: () => readonly Food[];
  /** The latest copy of a grocery row. */
  getRow: (id: string) => GroceryItem | undefined;
  addFood: (food: Omit<Food, 'id'>) => Promise<boolean>;
  deleteFood: (id: string) => void;
  updateFood: (id: string, patch: Partial<Food>) => void;
  /** A signed purchase movement; recorded: false means use the legacy write. */
  recordRestock: (
    food: Food,
    signedQuantity: number,
    opts: { unit: string | null; refType: 'receipt' },
  ) => Promise<RestockResult>;
  updateGroceryItem: (id: string, patch: Partial<GroceryItem>) => void;
  now?: () => Date;
}

export interface ReceiptApplyOutcome {
  checkedOff: number;
  toppedUp: number;
  created: number;
  /** New foods the plan limit refused. */
  blocked: number;
  undo: () => Promise<void>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

interface AppliedTopUp {
  foodId: string;
  delta: number;
  unit: string | null;
  via: 'ledger' | 'legacy';
}

async function creditTopUp(deps: ReceiptApplyDeps, t: ReceiptTopUp): Promise<AppliedTopUp | null> {
  const food = deps.getFood(t.foodId);
  if (!food) return null;
  if (deps.ledgerWritesEnabled) {
    try {
      const result = await deps.recordRestock(food, t.quantityDelta, {
        unit: t.unit || food.unit || null,
        refType: 'receipt',
      });
      if (result.recorded) {
        return { foodId: t.foodId, delta: t.quantityDelta, unit: t.unit || food.unit || null, via: 'ledger' };
      }
    } catch {
      // Fall through to the legacy write, as the Pantry page's top-up does.
    }
  }
  const latest = deps.getFood(t.foodId) ?? food;
  deps.updateFood(latest.id, { quantity: round2((latest.quantity ?? 0) + t.quantityDelta) });
  return { foodId: t.foodId, delta: t.quantityDelta, unit: t.unit, via: 'legacy' };
}

async function reverseTopUp(deps: ReceiptApplyDeps, a: AppliedTopUp): Promise<void> {
  const food = deps.getFood(a.foodId);
  if (!food) return;
  if (a.via === 'ledger') {
    try {
      const result = await deps.recordRestock(food, -a.delta, { unit: a.unit, refType: 'receipt' });
      if (result.recorded) return;
    } catch {
      // Legacy below.
    }
  }
  const latest = deps.getFood(a.foodId) ?? food;
  deps.updateFood(latest.id, { quantity: Math.max(0, round2((latest.quantity ?? 0) - a.delta)) });
}

/**
 * Run a plan. Pantry first, then the list, so a row is only stamped as
 * credited once its credit happened: a row whose new food the plan limit
 * refused is still checked off (it was bought) but left unstamped, and
 * checkout gets its own try at it.
 */
export async function applyReceiptPlan(
  plan: ReceiptApplyPlan,
  deps: ReceiptApplyDeps,
): Promise<ReceiptApplyOutcome> {
  const idsBefore = new Set(deps.getFoods().map((f) => f.id));

  const createdKeys = new Set<string>();
  const createdNames: { name: string }[] = [];
  let blocked = 0;
  for (const food of plan.creates) {
    const ok = await deps.addFood(food);
    const key = receiptCreateKey(food.name, food.unit);
    if (ok) {
      createdKeys.add(key);
      createdNames.push({ name: food.name });
    } else {
      blocked++;
    }
  }

  const applied: AppliedTopUp[] = [];
  for (const t of plan.topUps) {
    const done = await creditTopUp(deps, t);
    if (done) applied.push(done);
  }
  const creditedFoods = new Set(applied.map((a) => a.foodId));

  const stamp = (deps.now ?? (() => new Date()))().toISOString();
  const changedRows: { id: string; checked: boolean; credited: string | null }[] = [];
  for (const rowId of plan.checkOffRowIds) {
    const row = deps.getRow(rowId);
    if (!row) continue;
    const line = plan.lineForRow[rowId];
    const credited = line
      ? (line.foodId !== null && creditedFoods.has(line.foodId)) ||
        (line.createKey !== null && createdKeys.has(line.createKey))
      : false;
    changedRows.push({ id: rowId, checked: row.checked, credited: row.pantry_credited_at ?? null });
    deps.updateGroceryItem(rowId, credited ? { checked: true, pantry_credited_at: stamp } : { checked: true });
  }

  let undone = false;
  const undo = async () => {
    if (undone) return;
    undone = true;
    for (const r of changedRows) {
      deps.updateGroceryItem(r.id, { checked: r.checked, pantry_credited_at: r.credited });
    }
    for (const a of applied) await reverseTopUp(deps, a);
    // A food this receipt created is one that was not there before and
    // carries the created name. Matching by name alone could take a food
    // someone added by hand in the meantime; requiring it to be new since
    // the apply cannot.
    const deleted = new Set<string>();
    for (const { name } of createdNames) {
      const target = receiptNameKey(name);
      const food = deps
        .getFoods()
        .find((f) => !idsBefore.has(f.id) && !deleted.has(f.id) && receiptNameKey(f.name) === target);
      if (food) {
        deleted.add(food.id);
        deps.deleteFood(food.id);
      }
    }
  };

  return {
    checkedOff: changedRows.length,
    toppedUp: applied.length,
    created: createdNames.length,
    blocked,
    undo,
  };
}
