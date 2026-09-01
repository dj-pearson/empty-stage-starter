/**
 * US-671 criterion 4: an out-of-order realtime insert still yields the right
 * balance.
 *
 * This is the claim that justifies having no last-write-wins logic in the
 * movements merge, and it is worth pinning rather than asserting in a comment.
 * Every other slice in this app needs conflict resolution because its rows are
 * edited in place; a movement is appended once and never changed, so the merge
 * is a dedupe by id and the fold is addition, which commutes.
 *
 * The item_stock half is the opposite case and is tested alongside it: that row
 * IS updated in place, so it merges by item_id and the newest event wins.
 */
import { describe, it, expect } from 'vitest';
import {
  applyMovementRealtime,
  applyItemStockRealtime,
  parseMovementRows,
  parseStockRows,
  type InventoryMovement,
  type ItemStock,
} from './InventoryContext';
import { foldMovements, balanceOf } from '@/lib/inventoryLedger';

type Payload = Parameters<typeof applyMovementRealtime>[1];

const insert = (row: Record<string, unknown>): Payload =>
  ({ eventType: 'INSERT', new: row, old: {} }) as unknown as Payload;

const update = (row: Record<string, unknown>): Payload =>
  ({ eventType: 'UPDATE', new: row, old: { id: row.id } }) as unknown as Payload;

const remove = (id: string): Payload =>
  ({ eventType: 'DELETE', new: {}, old: { id } }) as unknown as Payload;

function movement(id: string, delta: number, occurredAt: string, itemId = 'item-1') {
  return {
    id,
    household_id: 'hh-1',
    item_id: itemId,
    delta,
    canonical_unit: 'g',
    display_quantity: null,
    display_unit: null,
    reason: 'purchase',
    ref_type: null,
    ref_id: null,
    occurred_at: occurredAt,
    created_by: 'user-1',
    reversed_by_id: null,
    created_at: occurredAt,
  } as Record<string, unknown>;
}

// A purchase, a cook and a correction, in the order they actually happened.
const CHRONOLOGICAL = [
  movement('m1', 1000, '2026-09-01T08:00:00Z'),
  movement('m2', -250, '2026-09-01T12:00:00Z'),
  movement('m3', -50, '2026-09-01T18:00:00Z'),
];
const TRUE_BALANCE = 700;

describe('applyMovementRealtime: append-only needs no conflict resolution', () => {
  it('lands on the same balance whatever order the events arrive in', () => {
    const orders: number[][] = [
      [0, 1, 2],
      [2, 1, 0],
      [1, 2, 0],
      [2, 0, 1],
    ];
    for (const order of orders) {
      let state: InventoryMovement[] = [];
      for (const i of order) state = applyMovementRealtime(state, insert(CHRONOLOGICAL[i]));
      expect(state).toHaveLength(3);
      expect(balanceOf(foldMovements(state), 'item-1')).toBe(TRUE_BALANCE);
    }
  });

  it('a re-delivered event does not double-count', () => {
    // Supabase realtime is at-least-once, and an offline queue replays. Both
    // arrive here as the same id twice.
    let state: InventoryMovement[] = [];
    for (const row of [...CHRONOLOGICAL, ...CHRONOLOGICAL]) {
      state = applyMovementRealtime(state, insert(row));
    }
    expect(state).toHaveLength(3);
    expect(balanceOf(foldMovements(state), 'item-1')).toBe(TRUE_BALANCE);
  });

  it('an event that arrives before a load has caught up still folds correctly', () => {
    // The realtime event for m3 beats the initial fetch that carries m1 and m2.
    let state = applyMovementRealtime([], insert(CHRONOLOGICAL[2]));
    // Then the server-authoritative load replaces the slice wholesale, which is
    // safe here precisely because it carries the same rows.
    state = [CHRONOLOGICAL[0], CHRONOLOGICAL[1], CHRONOLOGICAL[2]] as unknown as InventoryMovement[];
    expect(balanceOf(foldMovements(state), 'item-1')).toBe(TRUE_BALANCE);
  });

  it('keeps items independent', () => {
    let state: InventoryMovement[] = [];
    state = applyMovementRealtime(state, insert(movement('a1', 500, '2026-09-01T08:00:00Z', 'item-A')));
    state = applyMovementRealtime(state, insert(movement('b1', 300, '2026-09-01T09:00:00Z', 'item-B')));
    state = applyMovementRealtime(state, insert(movement('a2', -200, '2026-09-01T10:00:00Z', 'item-A')));
    const folded = foldMovements(state);
    expect(balanceOf(folded, 'item-A')).toBe(300);
    expect(balanceOf(folded, 'item-B')).toBe(300);
  });

  it('replaces a row in place when reversed_by_id is written', () => {
    // The one mutable column, set by rpc_reverse_movements_by_ref. It arrives
    // as an UPDATE and must not append a second copy of the movement.
    let state = applyMovementRealtime([], insert(CHRONOLOGICAL[0]));
    state = applyMovementRealtime(state, update({ ...CHRONOLOGICAL[0], reversed_by_id: 'm9' }));
    expect(state).toHaveLength(1);
    expect(state[0].reversed_by_id).toBe('m9');
    expect(balanceOf(foldMovements(state), 'item-1')).toBe(1000);
  });

  it('drops a malformed row instead of poisoning the balance', () => {
    const state = applyMovementRealtime([], insert({ id: 'bad', item_id: 'item-1', delta: 'lots', canonical_unit: 'g' }));
    expect(state).toEqual([]);
  });

  it('honours a DELETE even though the privilege is revoked server-side', () => {
    let state = applyMovementRealtime([], insert(CHRONOLOGICAL[0]));
    state = applyMovementRealtime(state, remove('m1'));
    expect(state).toEqual([]);
  });
});

describe('applyItemStockRealtime: a row that IS updated in place', () => {
  const stockRow = (itemId: string, onHand: number): Record<string, unknown> => ({
    item_id: itemId,
    household_id: 'hh-1',
    on_hand_canonical: onHand,
    canonical_unit: 'g',
    mirror_unconvertible: false,
    updated_at: '2026-09-01T08:00:00Z',
  });

  it('upserts by item_id rather than appending', () => {
    let state: ItemStock[] = [];
    state = applyItemStockRealtime(state, insert(stockRow('item-1', 1000)));
    state = applyItemStockRealtime(state, update(stockRow('item-1', 750)));
    expect(state).toHaveLength(1);
    expect(state[0].on_hand_canonical).toBe(750);
  });

  it('keeps separate items separate', () => {
    let state: ItemStock[] = [];
    state = applyItemStockRealtime(state, insert(stockRow('item-1', 1000)));
    state = applyItemStockRealtime(state, insert(stockRow('item-2', 20)));
    expect(state).toHaveLength(2);
  });

  it('removes a row on DELETE', () => {
    let state = applyItemStockRealtime([], insert(stockRow('item-1', 1000)));
    state = applyItemStockRealtime(state, {
      eventType: 'DELETE',
      new: {},
      old: { item_id: 'item-1' },
    } as unknown as Payload);
    expect(state).toEqual([]);
  });

  it('ignores a row with no usable balance', () => {
    expect(applyItemStockRealtime([], insert({ item_id: 'item-1', on_hand_canonical: null }))).toEqual([]);
    expect(applyItemStockRealtime([], insert({ on_hand_canonical: 5 }))).toEqual([]);
  });
});

/**
 * NUMERIC does not arrive as a JS number on every path. PostgREST sends it
 * unquoted, but a realtime payload can carry it as a string -- this codebase
 * has met that before, in normalizeGroceryItemFromDB, whose test pins "2" -> 2.
 *
 * The failure mode is what makes it worth its own block: nothing throws. A
 * string delta is simply not a number, so `foldMovements` skips it and the
 * pantry is quietly short by one purchase, with no error anywhere to find.
 */
describe('NUMERIC columns arriving as strings', () => {
  it('folds a string delta into the balance instead of dropping it', () => {
    let state: InventoryMovement[] = [];
    state = applyMovementRealtime(state, insert({ ...movement('m1', 0, '2026-09-01T08:00:00Z'), delta: '1000' }));
    state = applyMovementRealtime(state, insert({ ...movement('m2', 0, '2026-09-01T12:00:00Z'), delta: '-250.5' }));
    expect(state).toHaveLength(2);
    expect(state[0].delta).toBe(1000);
    expect(balanceOf(foldMovements(state), 'item-1')).toBe(749.5);
  });

  it('coerces a string balance on item_stock', () => {
    const state = applyItemStockRealtime([], insert({
      item_id: 'item-1',
      household_id: 'hh-1',
      on_hand_canonical: '2000',
      canonical_unit: 'g',
    }));
    expect(state).toHaveLength(1);
    expect(state[0].on_hand_canonical).toBe(2000);
  });

  it('normalizes the load path identically to the realtime path', () => {
    const rows = [
      { ...movement('m1', 0, '2026-09-01T08:00:00Z'), delta: '1000' },
      { ...movement('m2', 0, '2026-09-01T12:00:00Z'), delta: -250 },
    ];
    const parsed = parseMovementRows(rows);
    expect(balanceOf(foldMovements(parsed), 'item-1')).toBe(750);

    const merged = rows.reduce<InventoryMovement[]>(
      (acc, row) => applyMovementRealtime(acc, insert(row)),
      []
    );
    expect(parsed).toEqual(merged);
  });

  it('still drops a delta that is not a number in any spelling', () => {
    expect(parseMovementRows([{ ...movement('m1', 0, '2026-09-01T08:00:00Z'), delta: 'lots' }])).toEqual([]);
    expect(parseMovementRows([{ ...movement('m1', 0, '2026-09-01T08:00:00Z'), delta: null }])).toEqual([]);
  });

  it('drops rows that are missing their key fields', () => {
    expect(parseMovementRows([{ delta: 5, canonical_unit: 'g' }])).toEqual([]);
    expect(parseStockRows([{ on_hand_canonical: 5 }])).toEqual([]);
    expect(parseStockRows([null, undefined])).toEqual([]);
  });
});
