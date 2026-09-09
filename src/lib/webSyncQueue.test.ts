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
} from "./webSyncQueue";

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
