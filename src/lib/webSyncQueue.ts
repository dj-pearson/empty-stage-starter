import {
  createOfflineQueue,
  type QueueStorage,
  type QueuedOp,
} from "@/lib/offlineQueue";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

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
