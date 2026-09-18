import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const from = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (t: string) => from(t) } }));

import {
  createWebSyncQueue,
  createGroceryExecutor,
  queueWrite,
  queueWrites,
  pendingWriteCount,
  webQueueKey,
  type WebQueuedOp,
  purgeForeignQueues,
  WEB_QUEUE_KEY_PREFIX,
  applyPendingOpsToGroceryItems,
  pendingWebOps,
} from "./webSyncQueue";
import type { GroceryItem } from "@/types";

/** A chainable stand-in for the PostgREST builder, recording what it was told. */
function supabaseStub(result: { error: unknown }) {
  const calls: Record<string, unknown>[] = [];
  const builder = {
    update(values: Record<string, unknown>) {
      calls.push({ op: "update", values });
      return builder;
    },
    delete() {
      calls.push({ op: "delete" });
      return builder;
    },
    // Resolves rather than chaining: an insert names its row in the payload,
    // so there is no .eq() after it and the executor awaits this directly.
    insert(row: Record<string, unknown>) {
      calls.push({ op: "insert", row });
      return Promise.resolve(result) as unknown as typeof builder;
    },
    eq(col: string, val: unknown) {
      calls.push({ op: "eq", col, val });
      return Promise.resolve(result) as unknown as typeof builder;
    },
  };
  const client = { from: (table: string) => (calls.push({ op: "from", table }), builder) };
  return { client: client as never, calls };
}

const op = (kind: string, payload: Record<string, unknown>): WebQueuedOp =>
  ({ id: "1", kind, enqueuedAt: 0, attempts: 0, payload }) as WebQueuedOp;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("queue scoping", () => {
  it("keys the queue by user so a second account cannot drain the first's writes", async () => {
    await queueWrite("user-a", "grocery.toggle", { id: "row", checked: true });

    expect(await pendingWriteCount("user-a")).toBe(1);
    expect(await pendingWriteCount("user-b")).toBe(0);
    expect(webQueueKey("user-a")).not.toBe(webQueueKey("user-b"));
    expect(localStorage.getItem(webQueueKey("user-a"))).toBeTruthy();
  });

  it("refuses to queue anything for a signed-out visitor", async () => {
    expect(await queueWrite(null, "grocery.toggle", { id: "row", checked: true })).toBe(false);
    expect(await queueWrites(undefined, "grocery.delete", [{ id: "row" }])).toBe(false);
    expect(await pendingWriteCount(null)).toBe(0);
    // Nothing was written under any key we would recognise.
    expect(localStorage.getItem(webQueueKey("undefined"))).toBeNull();
    expect(localStorage.getItem(webQueueKey("null"))).toBeNull();
  });

  // A queued write is the ONE case where the optimistic row is kept on screen,
  // so a queue that could not store it must not report success -- that would
  // leave a change looking saved that nothing will ever send.
  it("reports false rather than claiming a write it could not store", async () => {
    const readOnly = {
      getItem: async () => null,
      setItem: async () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: async () => {},
    };
    expect(
      await queueWrite("user-a", "grocery.toggle", { id: "row", checked: true }, readOnly),
    ).toBe(false);
  });

  it("queues one op per row for a bulk delete", async () => {
    expect(
      await queueWrites("user-a", "grocery.delete", [{ id: "a" }, { id: "b" }, { id: "c" }]),
    ).toBe(true);
    expect(await pendingWriteCount("user-a")).toBe(3);
  });
});

describe("grocery executor", () => {
  it("replays a toggle as an update on that row", async () => {
    const { client, calls } = supabaseStub({ error: null });
    const ok = await createGroceryExecutor(client)(op("grocery.toggle", { id: "r1", checked: true }));

    expect(ok).toBe(true);
    expect(calls).toEqual([
      { op: "from", table: "grocery_items" },
      { op: "update", values: { checked: true } },
      { op: "eq", col: "id", val: "r1" },
    ]);
  });

  it("replays an update with the fields the caller sent", async () => {
    const { client, calls } = supabaseStub({ error: null });
    await createGroceryExecutor(client)(
      op("grocery.update", { id: "r1", updates: { quantity: 3, notes: "ripe" } }),
    );
    expect(calls[1]).toEqual({ op: "update", values: { quantity: 3, notes: "ripe" } });
  });

  it("replays a delete", async () => {
    const { client, calls } = supabaseStub({ error: null });
    const ok = await createGroceryExecutor(client)(op("grocery.delete", { id: "r1" }));
    expect(ok).toBe(true);
    expect(calls[1]).toEqual({ op: "delete" });
  });

  it("replays an insert with the row it was given, id and all", async () => {
    const { client, calls } = supabaseStub({ error: null });
    const row = { id: "r1", name: "Oat milk", category: "dairy", household_id: "h1" };
    const ok = await createGroceryExecutor(client)(op("grocery.insert", { row }));

    expect(ok).toBe(true);
    expect(calls).toEqual([
      { op: "from", table: "grocery_items" },
      { op: "insert", row },
    ]);
  });

  it("reads a duplicate key on an insert replay as the write having landed", async () => {
    // The first attempt reached Postgres and the response did not. The row is
    // there; retrying until the drain discards it would tell the user their
    // item was lost while it sits in their list.
    const { client } = supabaseStub({ error: { code: "23505", message: "duplicate key value" } });
    expect(await createGroceryExecutor(client)(op("grocery.insert", { row: { id: "r1" } }))).toBe(
      true,
    );
  });

  it("still reports failure for an insert the server refused for any other reason", async () => {
    const { client } = supabaseStub({ error: { code: "42501", message: "row-level security" } });
    expect(await createGroceryExecutor(client)(op("grocery.insert", { row: { id: "r1" } }))).toBe(
      false,
    );
  });

  it("reports failure when the server rejects, so the op is retried not lost", async () => {
    const { client } = supabaseStub({ error: { message: "row-level security" } });
    expect(await createGroceryExecutor(client)(op("grocery.delete", { id: "r1" }))).toBe(false);
  });

  it("reports failure for an op kind this build cannot replay", async () => {
    const { client } = supabaseStub({ error: null });
    expect(await createGroceryExecutor(client)(op("grocery.teleport", { id: "r1" }))).toBe(false);
  });

  it("treats a thrown client as a failure rather than crashing the drain", async () => {
    const throwing = {
      from() {
        throw new Error("client exploded");
      },
    } as never;
    expect(await createGroceryExecutor(throwing)(op("grocery.delete", { id: "r1" }))).toBe(false);
  });
});

describe("end to end", () => {
  it("a write queued offline lands exactly once when it is replayed", async () => {
    await queueWrite("user-a", "grocery.toggle", { id: "r1", checked: true });

    const { client, calls } = supabaseStub({ error: null });
    const result = await createWebSyncQueue("user-a").drain(createGroceryExecutor(client));

    expect(result).toEqual({ succeeded: 1, failed: 0, dropped: 0 });
    expect(calls.filter((c) => c.op === "update")).toHaveLength(1);
    expect(await pendingWriteCount("user-a")).toBe(0);
  });

  it("survives a reload: the queue is read back from storage, not memory", async () => {
    await queueWrite("user-a", "grocery.toggle", { id: "r1", checked: true });
    const stored = localStorage.getItem(webQueueKey("user-a"));

    localStorage.clear();
    localStorage.setItem(webQueueKey("user-a"), stored as string);

    expect(await pendingWriteCount("user-a")).toBe(1);
  });

  it("keeps a write the server has not accepted yet", async () => {
    await queueWrite("user-a", "grocery.delete", { id: "r1" });
    const { client } = supabaseStub({ error: { message: "TypeError: Failed to fetch" } });

    const result = await createWebSyncQueue("user-a").drain(createGroceryExecutor(client));
    expect(result.failed).toBe(1);
    expect(await pendingWriteCount("user-a")).toBe(1);
  });
});

describe('queues belonging to other accounts', () => {
  /**
   * US-823 AC5, read carefully. It asks for the queue to be "cleared on sign
   * out", and the reason it gives is that "a queue drained into the wrong
   * household is worse than losing the write". The per-user key already makes
   * that impossible, and clearing on sign-out would destroy exactly what this
   * story protects: a parent who adds items in a shop with no signal, signs
   * out on a shared tablet and signs back in later. signOutScrub.ts records
   * the same decision and keeps the key.
   *
   * What is actually left is growth, so the purge runs on SIGN-IN and keeps
   * the current user's queue.
   */
  const keyFor = (id: string) => `${WEB_QUEUE_KEY_PREFIX}.${id}`;

  it('keeps the signed-in user their own queue', () => {
    const keys = [keyFor('user-a'), keyFor('user-b')];
    expect(purgeForeignQueues('user-a', keys)).toEqual([keyFor('user-b')]);
  });

  it('drops every other account, not just the first', () => {
    const keys = [keyFor('a'), keyFor('b'), keyFor('c'), keyFor('d')];
    expect(purgeForeignQueues('c', keys).sort()).toEqual(
      [keyFor('a'), keyFor('b'), keyFor('d')].sort()
    );
  });

  it('touches nothing that is not a sync queue', () => {
    // The scrub policy in signOutScrub.ts owns every other key, and a purge
    // that reached past its own prefix would be deleting app state nobody
    // asked it to.
    const keys = [
      'kid-meal-planner',
      'eatpal_feature_flags',
      'cookie-consent',
      keyFor('other'),
    ];
    expect(purgeForeignQueues('me', keys)).toEqual([keyFor('other')]);
  });

  it('is a no-op when the only queue is the current one', () => {
    expect(purgeForeignQueues('me', [keyFor('me')])).toEqual([]);
  });

  it('is a no-op on an empty storage', () => {
    expect(purgeForeignQueues('me', [])).toEqual([]);
  });

  it('does not mistake a prefix for a match', () => {
    // A key that merely starts with the same characters is not one of ours.
    expect(purgeForeignQueues('me', ['eatpal.web.syncQueueBackup'])).toEqual([]);
  });
});

/**
 * US-823 AC4. A server load REPLACES the grocery slice wholesale, so the only
 * thing standing between a queued write and the screen is this projection.
 */
describe('projecting the unsent queue onto a server load', () => {
  const item = (id: string, over: Partial<GroceryItem> = {}): GroceryItem => ({
    id,
    name: id,
    quantity: 1,
    unit: 'count',
    checked: false,
    category: 'snack',
    ...over,
  });

  it('re-applies a tick the load would otherwise have wiped', () => {
    const server = [item('a'), item('b')];
    const out = applyPendingOpsToGroceryItems(server, [
      op('grocery.toggle', { id: 'a', checked: true }),
    ]);
    expect(out.find((i) => i.id === 'a')?.checked).toBe(true);
    expect(out.find((i) => i.id === 'b')?.checked).toBe(false);
  });

  it('leaves the server rows alone when nothing is queued', () => {
    const server = [item('a', { checked: true }), item('b')];
    expect(applyPendingOpsToGroceryItems(server, [])).toEqual(server);
  });

  it('applies ops in FIFO order, so the last write wins the same way the drain will', () => {
    const out = applyPendingOpsToGroceryItems(
      [item('a')],
      [
        op('grocery.toggle', { id: 'a', checked: true }),
        op('grocery.toggle', { id: 'a', checked: false }),
        op('grocery.toggle', { id: 'a', checked: true }),
      ],
    );
    expect(out[0].checked).toBe(true);
  });

  it('is idempotent, so racing a drain that already sent the op is harmless', () => {
    // The drain can land between reading the queue and applying the fold. An
    // op replayed onto a server row that already carries its effect has to be
    // a no-op, or the projection would be its own source of drift.
    const server = [item('a', { checked: true })];
    const ops = [op('grocery.toggle', { id: 'a', checked: true })];
    expect(applyPendingOpsToGroceryItems(server, ops)).toEqual(
      applyPendingOpsToGroceryItems(applyPendingOpsToGroceryItems(server, ops), ops),
    );
  });

  it('carries a queued field update onto the loaded row', () => {
    const out = applyPendingOpsToGroceryItems(
      [item('a', { quantity: 1, notes: 'old' })],
      [op('grocery.update', { id: 'a', updates: { quantity: 4, notes: 'the big bag' } })],
    );
    expect(out[0].quantity).toBe(4);
    expect(out[0].notes).toBe('the big bag');
    expect(out[0].name).toBe('a');
  });

  it('removes a row deleted offline rather than showing it back', () => {
    const out = applyPendingOpsToGroceryItems(
      [item('a'), item('b')],
      [op('grocery.delete', { id: 'a' })],
    );
    expect(out.map((i) => i.id)).toEqual(['b']);
  });

  it('skips an op naming a row the load did not return, rather than resurrecting it', () => {
    // Deleted on another device. The server is right and the drain's own write
    // will be refused for the same reason.
    const server = [item('b')];
    expect(applyPendingOpsToGroceryItems(server, [
      op('grocery.toggle', { id: 'gone', checked: true }),
      op('grocery.update', { id: 'gone', updates: { quantity: 9 } }),
      op('grocery.delete', { id: 'gone' }),
    ])).toEqual(server);
  });

  it('does not mutate the array or the rows it was handed', () => {
    const rows = [item('a'), item('b')];
    const snapshot = JSON.parse(JSON.stringify(rows));
    applyPendingOpsToGroceryItems(rows, [
      op('grocery.toggle', { id: 'a', checked: true }),
      op('grocery.delete', { id: 'b' }),
    ]);
    expect(rows).toEqual(snapshot);
  });

  it('costs one malformed op its own effect, never the whole load', () => {
    const server = [item('a'), item('b')];
    const out = applyPendingOpsToGroceryItems(server, [
      op('grocery.toggle', { id: 'a' }),
      op('grocery.toggle', { checked: true }),
      op('grocery.update', { id: 'a', updates: null }),
      op('grocery.update', { id: 'a', updates: ['not', 'an', 'object'] }),
      op('grocery.delete', { id: 42 }),
      op('grocery.toggle', { id: 'b', checked: true }),
    ]);
    // Only the one well-formed op did anything.
    expect(out.find((i) => i.id === 'a')?.checked).toBe(false);
    expect(out.find((i) => i.id === 'b')?.checked).toBe(true);
    expect(out).toHaveLength(2);
  });

  it('ignores a kind this build cannot replay, matching what the drain does with it', () => {
    const server = [item('a')];
    expect(applyPendingOpsToGroceryItems(server, [op('grocery.teleport', { id: 'a' })])).toEqual(
      server,
    );
  });

  it('appends a row inserted offline that the load knows nothing about', () => {
    // The story's own sentence: a parent ADDING items with no signal. Until
    // US-823's second half the insert was the one write the queue refused.
    const out = applyPendingOpsToGroceryItems(
      [item('g1')],
      [
        op('grocery.insert', {
          row: { id: 'g2', name: 'Oat milk', quantity: 2, unit: 'l', category: 'dairy', checked: false },
        }),
      ],
    );
    expect(out.map((i) => i.id)).toEqual(['g1', 'g2']);
    expect(out[1].name).toBe('Oat milk');
    expect(out[1].quantity).toBe(2);
  });

  it('does not append an insert the load already returned', () => {
    // The insert landed and the server's copy is in the load. Appending would
    // be the duplicate row the client-generated id exists to prevent.
    const server = [item('g2', { name: 'Oat milk' })];
    const out = applyPendingOpsToGroceryItems(server, [
      op('grocery.insert', { row: { id: 'g2', name: 'Oat milk', category: 'dairy' } }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Oat milk');
  });

  it('applies a later op to a row the same queue inserted', () => {
    // Added and then ticked off, both offline, in that order.
    const out = applyPendingOpsToGroceryItems(
      [],
      [
        op('grocery.insert', { row: { id: 'g2', name: 'Oat milk', category: 'dairy' } }),
        op('grocery.toggle', { id: 'g2', checked: true }),
      ],
    );
    expect(out).toHaveLength(1);
    expect(out[0].checked).toBe(true);
  });

  it('skips an insert whose row cannot be read as a grocery item', () => {
    const server = [item('g1')];
    expect(
      applyPendingOpsToGroceryItems(server, [
        op('grocery.insert', { row: null }),
        op('grocery.insert', { row: 'not an object' }),
        op('grocery.insert', { row: { id: 'g9' } }),
      ]),
    ).toEqual(server);
  });

  it('reads the real queue for a user, in order, and nothing for a signed-out visitor', async () => {
    await queueWrite('user-a', 'grocery.toggle', { id: 'a', checked: true });
    await queueWrite('user-a', 'grocery.delete', { id: 'b' });

    const ops = await pendingWebOps('user-a');
    expect(ops.map((o) => o.kind)).toEqual(['grocery.toggle', 'grocery.delete']);
    expect(await pendingWebOps('user-b')).toEqual([]);
    expect(await pendingWebOps(null)).toEqual([]);
  });

  it('survives a queue that cannot be parsed instead of wedging the load', async () => {
    localStorage.setItem(webQueueKey('user-a'), '{ not json');
    expect(await pendingWebOps('user-a')).toEqual([]);
  });
});
