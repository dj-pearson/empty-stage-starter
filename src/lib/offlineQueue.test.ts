import { describe, it, expect, beforeEach } from "vitest";
import {
  createOfflineQueue,
  MAX_QUEUE,
  MAX_RETRIES,
  type QueueStorage,
  type QueuedOp,
} from "./offlineQueue";

/**
 * These are the assertions src/lib/syncQueue.test.ts was written to make and
 * never did: it ran against app/mobile/lib/syncQueue, whose drainQueue opened
 * with a platform check that reads 'web' under vitest, so both tests took an
 * `if (web no-op) return` branch and asserted nothing about replay. Deleting
 * the whole drain body left that file green. Every test below fails if the
 * behaviour it names is removed.
 */

function memoryStorage(): QueueStorage & { raw(): Record<string, string> } {
  const map: Record<string, string> = {};
  return {
    async getItem(k) {
      return k in map ? map[k] : null;
    },
    async setItem(k, v) {
      map[k] = v;
    },
    async removeItem(k) {
      delete map[k];
    },
    raw: () => map,
  };
}

const KEY = "test.queue";
let storage: ReturnType<typeof memoryStorage>;
let queue: ReturnType<typeof createOfflineQueue>;

beforeEach(() => {
  storage = memoryStorage();
  queue = createOfflineQueue(storage, KEY);
});

describe("enqueue", () => {
  it("persists across a fresh queue over the same storage", async () => {
    await queue.enqueue("grocery.toggle", { id: "a" });
    const reopened = createOfflineQueue(storage, KEY);
    expect(await reopened.peek()).toHaveLength(1);
  });

  it("starts every op at zero attempts", async () => {
    const op = await queue.enqueue("grocery.toggle", { id: "a" });
    expect(op.attempts).toBe(0);
  });

  it("keeps the newest entries when the queue overflows", async () => {
    for (let i = 0; i < MAX_QUEUE + 5; i++) {
      await queue.enqueue("grocery.toggle", { id: `i${i}` });
    }
    const held = await queue.peek();
    expect(held).toHaveLength(MAX_QUEUE);
    expect((held[held.length - 1].payload as { id: string }).id).toBe(`i${MAX_QUEUE + 4}`);
    expect(held.some((o) => (o.payload as { id: string }).id === "i0")).toBe(false);
  });
});

describe("drain", () => {
  it("replays in FIFO order and removes what landed", async () => {
    await queue.enqueue("grocery.toggle", { id: "a" });
    await queue.enqueue("grocery.toggle", { id: "b" });
    await queue.enqueue("grocery.toggle", { id: "c" });

    const seen: string[] = [];
    const result = await queue.drain(async (op) => {
      seen.push((op.payload as { id: string }).id);
      return true;
    });

    expect(seen).toEqual(["a", "b", "c"]);
    expect(result).toEqual({ succeeded: 3, failed: 0, dropped: 0 });
    expect(await queue.peek()).toHaveLength(0);
  });

  it("keeps a failed op and bumps its attempt count", async () => {
    await queue.enqueue("plan.insert", { id: "p1" });
    const result = await queue.drain(async () => false);

    expect(result).toEqual({ succeeded: 0, failed: 1, dropped: 0 });
    const held = await queue.peek();
    expect(held).toHaveLength(1);
    expect(held[0].attempts).toBe(1);
  });

  it("treats a thrown executor as a failure, not a crash", async () => {
    await queue.enqueue("plan.insert", { id: "p1" });
    const result = await queue.drain(async () => {
      throw new Error("network down");
    });
    expect(result.failed).toBe(1);
    expect((await queue.peek())[0].attempts).toBe(1);
  });

  it("does not let one failure block the ops behind it", async () => {
    await queue.enqueue("plan.insert", { id: "bad" });
    await queue.enqueue("plan.insert", { id: "good" });

    const seen: string[] = [];
    const result = await queue.drain(async (op) => {
      const id = (op.payload as { id: string }).id;
      seen.push(id);
      return id !== "bad";
    });

    expect(seen).toEqual(["bad", "good"]);
    expect(result).toEqual({ succeeded: 1, failed: 1, dropped: 0 });
    expect(await queue.peek()).toHaveLength(1);
  });

  it("preserves relative order of ops that keep failing", async () => {
    await queue.enqueue("plan.update", { id: "first" });
    await queue.enqueue("plan.update", { id: "second" });
    await queue.drain(async () => false);
    const held = await queue.peek();
    expect(held.map((o) => (o.payload as { id: string }).id)).toEqual(["first", "second"]);
  });

  it("drops a poison-pill op on the MAX_RETRIES-th failure and counts it", async () => {
    await queue.enqueue("plan.insert", { id: "poison" });

    let dropped = 0;
    for (let i = 0; i < MAX_RETRIES; i++) {
      const result = await queue.drain(async () => false);
      dropped += result.dropped;
    }

    expect(dropped).toBe(1);
    expect(await queue.peek()).toHaveLength(0);
    // It survived MAX_RETRIES-1 drains before going, rather than being dropped early.
    expect(MAX_RETRIES).toBeGreaterThan(1);
  });

  it("reports zeros without calling the executor on an empty queue", async () => {
    let called = false;
    const result = await queue.drain(async () => {
      called = true;
      return true;
    });
    expect(called).toBe(false);
    expect(result).toEqual({ succeeded: 0, failed: 0, dropped: 0 });
  });
});

describe("surviving bad stored data", () => {
  it("reads a corrupt value as an empty queue instead of throwing", async () => {
    await storage.setItem(KEY, "{not json");
    expect(await queue.peek()).toEqual([]);
    await expect(queue.drain(async () => true)).resolves.toEqual({
      succeeded: 0,
      failed: 0,
      dropped: 0,
    });
  });

  it("reads a non-array value as an empty queue", async () => {
    await storage.setItem(KEY, JSON.stringify({ id: "not-a-list" }));
    expect(await queue.peek()).toEqual([]);
  });

  it("discards entries that could never be replayed", async () => {
    const good: QueuedOp = {
      id: "1",
      kind: "grocery.toggle",
      enqueuedAt: 0,
      attempts: 0,
      payload: { id: "a" },
    };
    await storage.setItem(KEY, JSON.stringify([good, { nonsense: true }, null, "x"]));
    const held = await queue.peek();
    expect(held).toHaveLength(1);
    expect(held[0].id).toBe("1");
  });

  it("does not lose the caller's write when storage refuses to save", async () => {
    const failing: QueueStorage = {
      getItem: async () => null,
      setItem: async () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: async () => {},
    };
    const q = createOfflineQueue(failing, KEY);
    await expect(q.enqueue("grocery.toggle", { id: "a" })).resolves.toMatchObject({
      kind: "grocery.toggle",
    });
  });
});

describe("clear", () => {
  it("empties the queue", async () => {
    await queue.enqueue("grocery.toggle", { id: "a" });
    await queue.clear();
    expect(await queue.peek()).toEqual([]);
  });
});
