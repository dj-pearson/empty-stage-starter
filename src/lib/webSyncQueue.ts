import {
  createOfflineQueue,
  type QueueStorage,
  type QueuedOp,
} from "@/lib/offlineQueue";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import type { GroceryItem } from "@/types";

/**
 * US-823: the web app's offline write queue.
 *
 * The web app has shipped a full PWA -- service worker, offline.html, an
 * installable manifest -- while holding nothing for a write that failed. A
 * parent checking items off in a shop with no signal watched each tap revert.
 * OfflineIndicator even rendered a "<n> pending changes" badge over a queue
 * with no callers on either side.
 *
 * The mechanism is src/lib/offlineQueue.ts, shared with native (US-127). This
 * file is the web binding: which storage, which key, which ops, how to replay.
 *
 * WHAT IS QUEUED, AND WHY NOT INSERTS. Every op here addresses a row the server
 * already has, by id, so replaying it is a plain last-write-wins update that
 * needs no reconciliation. An offline INSERT is a different problem: the id is
 * assigned by the database (see groceryRow.ts -- "the database owns id"), so a
 * queued insert would replay under an id the optimistic row does not have and
 * arrive back over realtime as a second row. That wants a client-generated id
 * and is deliberately not bolted on here.
 *
 * SCOPING. The key carries the user id, so signing in as somebody else cannot
 * drain the previous account's writes into the new one's household. There is no
 * shared-key fallback on purpose: an op with no owner is an op we cannot place.
 */

export type WebQueuedOpKind =
  | "grocery.toggle"
  | "grocery.update"
  | "grocery.delete";

export type WebQueuedOp = QueuedOp<WebQueuedOpKind>;

export const WEB_QUEUE_KEY_PREFIX = "eatpal.web.syncQueue";

export function webQueueKey(userId: string): string {
  return `${WEB_QUEUE_KEY_PREFIX}.${userId}`;
}

/**
 * localStorage behind the async QueueStorage interface.
 *
 * Every accessor is guarded: a private window, cleared site data or a browser
 * set to block storage throws on access rather than returning null, and an
 * offline queue that throws on read would take down the write path it exists
 * to protect.
 */
const localQueueStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* full or unavailable; the caller has already told the user */
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to do */
    }
  },
};

/**
 * Forget the queues that belong to nobody who is going to come back (US-823).
 *
 * THIS IS NOT "clear on sign-out", and the difference is the point. AC5 asks
 * for the queue to be cleared when a user signs out, and the reason it gives is
 * that "a queue drained into the wrong household is worse than losing the
 * write". The per-user key already makes that impossible -- a drain only ever
 * reads `eatpal.web.syncQueue.<the signed-in user>` -- and clearing on sign-out
 * would destroy exactly what this story exists to protect: a parent who adds
 * items in a shop with no signal, signs out on a shared tablet, and signs back
 * in later would lose them. src/lib/signOutScrub.ts records the same decision
 * and keeps the key.
 *
 * What is left over is growth. A queue belonging to an account that never
 * returns sits in localStorage forever. So on sign-in, drop every OTHER user's
 * queue and keep the current one: the owner's writes survive a sign-out, and a
 * shared device does not accumulate one queue per person who ever used it.
 *
 * Household scoping does not apply. Every op the web queue accepts addresses a
 * row the server already has, by id (grocery.toggle, grocery.update,
 * grocery.delete) -- a row id names its own household, and RLS refuses a user
 * who is not a member. There is no "drain into the wrong household" to prevent.
 */
export function purgeForeignQueues(
  currentUserId: string,
  keys: readonly string[]
): string[] {
  const keep = webQueueKey(currentUserId);
  return keys.filter((key) => key.startsWith(`${WEB_QUEUE_KEY_PREFIX}.`) && key !== keep);
}

/**
 * Apply purgeForeignQueues to localStorage. Never throws: a browser blocking
 * storage must not break sign-in.
 */
export function purgeForeignQueuesFromBrowser(currentUserId: string): string[] {
  const keys: string[] = [];
  try {
    // length/key(i), not Object.keys. Enumerating a Storage with Object.keys
    // happens to work in a browser, where the stored entries are own
    // enumerable properties of the proxy, and returns the METHOD NAMES against
    // anything that merely implements the interface -- which is what the test
    // environment gives us, so the purge was unprovable and would break on any
    // other Storage implementation. The indexed accessors are the actual Web
    // Storage API. Read them all before deleting anything: removing an entry
    // renumbers the ones behind it.
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null) keys.push(key);
    }
  } catch {
    return [];
  }
  const doomed = purgeForeignQueues(currentUserId, keys);
  for (const key of doomed) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* blocked; nothing to do */
    }
  }
  return doomed;
}

export function createWebSyncQueue(userId: string, storage: QueueStorage = localQueueStorage) {
  return createOfflineQueue<WebQueuedOpKind>(storage, webQueueKey(userId));
}

/**
 * Replay one op. Returns true when the write landed (the op is removed), false
 * to keep it for another attempt.
 *
 * A rejection the SERVER issued is not retried into oblivion: it comes back
 * false like any other failure and the shared drain drops it after MAX_RETRIES
 * rather than replaying a forbidden write forever. What matters is that a
 * transport failure and a 403 are told apart in the log, so a queue that is
 * quietly shedding ops is visible.
 */
export function createGroceryExecutor(client: typeof supabase = supabase) {
  return async function executeOp(op: WebQueuedOp): Promise<boolean> {
    try {
      switch (op.kind) {
        case "grocery.toggle": {
          const { id, checked } = op.payload as { id: string; checked: boolean };
          const { error } = await client
            .from("grocery_items")
            .update({ checked })
            .eq("id", id);
          if (error) logger.warn("[webSyncQueue] toggle replay failed", error);
          return !error;
        }
        case "grocery.update": {
          const { id, updates } = op.payload as {
            id: string;
            updates: Record<string, unknown>;
          };
          const { error } = await client
            .from("grocery_items")
            .update(updates)
            .eq("id", id);
          if (error) logger.warn("[webSyncQueue] update replay failed", error);
          return !error;
        }
        case "grocery.delete": {
          const { id } = op.payload as { id: string };
          const { error } = await client.from("grocery_items").delete().eq("id", id);
          if (error) logger.warn("[webSyncQueue] delete replay failed", error);
          return !error;
        }
        default: {
          // An op kind this build does not know how to replay. Returning false
          // retries it a few times and then drops it, which is right: a newer
          // build wrote it, and guessing at the write would be worse than
          // losing it.
          logger.warn("[webSyncQueue] unknown op kind, will be dropped", op);
          return false;
        }
      }
    } catch (err) {
      logger.warn("[webSyncQueue] executor threw", err);
      return false;
    }
  };
}

/**
 * Re-apply the writes still waiting in the queue on top of a fresh server load
 * (US-823 AC4).
 *
 * The load-precedence contract in CLAUDE.md is that an authenticated load
 * REPLACES a slice wholesale -- `setGroceryItemsState(serverRows)`, no merge
 * with the cache. That is deliberate and it is what stops a stale local backup
 * resurrecting a deletion made on another device. It also means a write that
 * is sitting in the queue, unsent, is erased from the screen by the next load:
 * the shopper who ticked six items off in the aisle opens the tab at home,
 * watches the list arrive, and watches their six ticks disappear while the ops
 * are still in localStorage waiting to be sent.
 *
 * So the queue is folded over the loaded rows in FIFO order -- the same order
 * the drain will send them -- and the result is what the server will hold once
 * the drain finishes. This is a projection of pending work onto server truth,
 * not a merge of the cache into it: nothing here reads local storage's copy of
 * a row, only the ops.
 *
 * Every fold is idempotent, which is what makes racing the drain safe: setting
 * `checked` to a value the server already has, or filtering out a row already
 * deleted, both change nothing. An op naming a row the load did not return is
 * skipped rather than resurrected -- the row is gone, and the drain's own write
 * will be refused by the server for the same reason.
 *
 * Each op is applied defensively. A malformed payload written by some other
 * build must cost its own op, never the whole load.
 */
export function applyPendingOpsToGroceryItems(
  items: readonly GroceryItem[],
  ops: readonly WebQueuedOp[],
): GroceryItem[] {
  let next: GroceryItem[] = [...items];

  for (const op of ops) {
    try {
      switch (op.kind) {
        case "grocery.toggle": {
          const { id, checked } = op.payload as { id?: unknown; checked?: unknown };
          if (typeof id !== "string" || typeof checked !== "boolean") break;
          next = next.map((item) => (item.id === id ? { ...item, checked } : item));
          break;
        }
        case "grocery.update": {
          const { id, updates } = op.payload as { id?: unknown; updates?: unknown };
          if (typeof id !== "string") break;
          if (!updates || typeof updates !== "object" || Array.isArray(updates)) break;
          next = next.map((item) =>
            item.id === id
              // The same object the executor hands to `.update()`, so the two
              // agree by construction about what this op does to the row.
              ? ({ ...item, ...(updates as Partial<GroceryItem>) })
              : item,
          );
          break;
        }
        case "grocery.delete": {
          const { id } = op.payload as { id?: unknown };
          if (typeof id !== "string") break;
          next = next.filter((item) => item.id !== id);
          break;
        }
        default:
          // A kind this build cannot replay is also a kind it cannot project.
          // The drain logs and drops it; showing a guess would be worse.
          break;
      }
    } catch (err) {
      logger.warn("[webSyncQueue] could not project a queued op onto the load", err);
    }
  }

  return next;
}

/** The ops still waiting for this user, in FIFO order. Empty for a signed-out visitor. */
export async function pendingWebOps(
  userId: string | null | undefined,
  storage: QueueStorage = localQueueStorage,
): Promise<WebQueuedOp[]> {
  if (!userId) return [];
  try {
    return await createWebSyncQueue(userId, storage).peek();
  } catch {
    return [];
  }
}

/**
 * Queue one write for replay. Returns whether it was durably stored -- the
 * caller keeps its optimistic row only on a true, so a queue that could not
 * write must not claim it did.
 */
export async function queueWrite(
  userId: string | null | undefined,
  kind: WebQueuedOpKind,
  payload: Record<string, unknown>,
  storage: QueueStorage = localQueueStorage,
): Promise<boolean> {
  if (!userId) return false;
  try {
    const queue = createWebSyncQueue(userId, storage);
    await queue.enqueue(kind, payload);
    // enqueue swallows a storage failure so the caller's write survives, so
    // "did it land" is a separate question from "did enqueue throw".
    const held = await queue.peek();
    return held.some((op) => op.kind === kind);
  } catch {
    return false;
  }
}

/**
 * Queue the same op for several rows -- a bulk delete, or clearing everything
 * checked at the end of a shop. One op per row rather than one op per batch, so
 * a single row the server later refuses cannot take the rest of the batch with
 * it. Returns true only if every row was stored.
 */
export async function queueWrites(
  userId: string | null | undefined,
  kind: WebQueuedOpKind,
  payloads: Record<string, unknown>[],
  storage: QueueStorage = localQueueStorage,
): Promise<boolean> {
  if (!userId || payloads.length === 0) return false;
  try {
    const queue = createWebSyncQueue(userId, storage);
    for (const payload of payloads) await queue.enqueue(kind, payload);
    const held = await queue.peek();
    return held.filter((op) => op.kind === kind).length >= payloads.length;
  } catch {
    return false;
  }
}

/** How many writes are waiting for this user. Zero for a signed-out visitor. */
export async function pendingWriteCount(
  userId: string | null | undefined,
  storage: QueueStorage = localQueueStorage,
): Promise<number> {
  if (!userId) return 0;
  try {
    return (await createWebSyncQueue(userId, storage).peek()).length;
  } catch {
    return 0;
  }
}
