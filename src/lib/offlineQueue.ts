/**
 * The offline write queue, as a mechanism with no platform in it.
 *
 * US-823 AC 2: one implementation, not a second system beside the mobile one.
 * This is app/mobile/lib/syncQueue.ts (US-127) lifted out so the web app can
 * import the same code path; that module is now a thin adapter that binds
 * `safeStorage` and re-exports this API, so no mobile caller changed.
 *
 * TWO THINGS CHANGED IN THE LIFT, both deliberate:
 *
 *  1. STORAGE IS INJECTED. It was a hard import of `safeStorage`, which is why
 *     the only way to test the queue was to run it against whatever jsdom's
 *     localStorage happened to hold.
 *
 *  2. THERE IS NO PLATFORM CHECK. `drainQueue` used to open with
 *     `if (platformOS() === 'web') return zeros`, and `platformOS()` returns
 *     'web' whenever `require('react-native')` throws -- which is exactly what
 *     happens under vitest. So the guard fired in every test, the drain never
 *     ran, and src/lib/syncQueue.test.ts asserted nothing about it: deleting
 *     the entire drain implementation left that file green. Whether a platform
 *     drains is a caller's policy (useOfflineSyncDriver already makes that
 *     decision with a real Platform.OS check), not the queue's.
 *
 * Conflict policy is unchanged: last-write-wins, no server-state merge. The
 * executor re-issues the write and says whether it landed.
 */

export const MAX_QUEUE = 200;
export const MAX_RETRIES = 5;

/** The subset of a key/value store this queue needs. Async so native fits. */
export interface QueueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface QueuedOp<Kind extends string = string> {
  id: string;
  kind: Kind;
  /** Wallclock ms when the op was enqueued. */
  enqueuedAt: number;
  /** Replay attempts so far; gates the poison-pill drop. */
  attempts: number;
  /** Op-specific payload -- JSON-safe (no class instances, no functions). */
  payload: Record<string, unknown>;
}

export interface DrainResult {
  succeeded: number;
  failed: number;
  dropped: number;
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A queue bound to one storage and one key.
 *
 * Entries that survive a reload are entries someone is still waiting on, so
 * every read tolerates garbage rather than throwing: a corrupt or half-written
 * value reads as an empty queue instead of wedging every write behind it.
 */
export function createOfflineQueue<Kind extends string = string>(
  storage: QueueStorage,
  storageKey: string,
) {
  async function load(): Promise<QueuedOp<Kind>[]> {
    try {
      const raw = await storage.getItem(storageKey);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Drop entries that can't be replayed rather than handing the executor a
      // shape it will fail on five times before giving up.
      return parsed.filter(isQueuedOp) as QueuedOp<Kind>[];
    } catch {
      return [];
    }
  }

  async function save(queue: QueuedOp<Kind>[]): Promise<void> {
    try {
      // Keep the NEWEST entries on overflow: an op from four days ago is the
      // one most likely to be stale or already superseded.
      const trimmed = queue.length > MAX_QUEUE ? queue.slice(-MAX_QUEUE) : queue;
      await storage.setItem(storageKey, JSON.stringify(trimmed));
    } catch {
      // A full or unavailable store must not take the caller's write down with
      // it -- the caller has already shown the user an "unsaved" message.
    }
  }

  return {
    async enqueue(kind: Kind, payload: Record<string, unknown>): Promise<QueuedOp<Kind>> {
      const op: QueuedOp<Kind> = {
        id: newId(),
        kind,
        enqueuedAt: Date.now(),
        attempts: 0,
        payload,
      };
      const queue = await load();
      queue.push(op);
      await save(queue);
      return op;
    },

    peek: load,

    async clear(): Promise<void> {
      await storage.removeItem(storageKey);
    },

    /**
     * Replay every entry in FIFO order.
     *
     *  - executor returns true  -> the op is removed.
     *  - returns false or throws -> `attempts` is bumped and the op is kept,
     *    in place, so a later write to the same row cannot overtake an earlier
     *    one (last-write-wins only holds if order does).
     *  - past MAX_RETRIES        -> the op is dropped and counted, so the
     *    caller can tell the user rather than losing it silently.
     */
    async drain(
      executor: (op: QueuedOp<Kind>) => Promise<boolean>,
    ): Promise<DrainResult> {
      const initial = await load();
      if (initial.length === 0) return { succeeded: 0, failed: 0, dropped: 0 };

      const remaining: QueuedOp<Kind>[] = [];
      let succeeded = 0;
      let failed = 0;
      let dropped = 0;

      for (const op of initial) {
        let ok = false;
        try {
          ok = await executor(op);
        } catch {
          ok = false;
        }
        if (ok) {
          succeeded++;
          continue;
        }
        const next = { ...op, attempts: op.attempts + 1 };
        if (next.attempts >= MAX_RETRIES) {
          dropped++;
          continue;
        }
        failed++;
        remaining.push(next);
      }

      await save(remaining);
      return { succeeded, failed, dropped };
    },
  };
}

function isQueuedOp(value: unknown): value is QueuedOp {
  if (!value || typeof value !== "object") return false;
  const op = value as Partial<QueuedOp>;
  return (
    typeof op.id === "string" &&
    typeof op.kind === "string" &&
    typeof op.attempts === "number" &&
    typeof op.payload === "object" &&
    op.payload !== null
  );
}
