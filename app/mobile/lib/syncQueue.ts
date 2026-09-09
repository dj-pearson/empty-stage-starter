import { safeStorage } from '@/lib/platform';
import {
  createOfflineQueue,
  type DrainResult,
  type QueuedOp as GenericQueuedOp,
} from '@/lib/offlineQueue';

/**
 * US-127: write-queue for offline mode, on native.
 *
 * The mechanism moved to src/lib/offlineQueue.ts in US-823 so the web app can
 * use the same one instead of growing a second. This file is what stays
 * mobile-specific: the storage binding, the storage key, and the op vocabulary.
 * Every export below keeps the signature its callers already use.
 *
 * WHAT CHANGED IN BEHAVIOUR, deliberately: drainQueue no longer opens with
 * `if (platformOS() === 'web') return zeros`. That check read Platform.OS
 * through a require() that THROWS under vitest and was caught into 'web', so it
 * fired in every test and the drain was never exercised -- deleting the whole
 * drain body kept src/lib/syncQueue.test.ts green. The only caller,
 * useOfflineSyncDriver, already refuses to drain on web with a real
 * `Platform.OS === 'web'` check, so nothing on any platform drains that did not
 * drain before.
 */

const STORAGE_KEY = 'eatpal.mobile.syncQueue';

export type QueuedOpKind =
  | 'grocery.toggle'
  | 'grocery.insert'
  | 'plan.insert'
  | 'plan.update'
  | 'plan.delete'
  | 'food.update'
  | 'kid.insert'
  // US-609: exposure-ladder writes. `ladder.attempt` carries the INTENT of a
  // quick log (which rung, what outcome), not the resulting row, so the replay
  // can recompute against whatever the server holds by then. `ladder.patch` is
  // a direct parent edit (pause, resume, skip) and is an absolute set.
  //
  // NEITHER IS EXECUTABLE YET. useOfflineSyncDriver's switch handles the seven
  // kinds above and sends these two to `default: return false`, so anything
  // enqueued under them retries five times and is then dropped. Nothing
  // enqueues them today (src/lib/ladderSyncOps.ts is the spec, with no runtime
  // caller), so this is a trap rather than a live loss -- but wiring an
  // enqueue without adding the replay arm would make it one.
  | 'ladder.attempt'
  | 'ladder.patch';

export type QueuedOp = GenericQueuedOp<QueuedOpKind>;
export type { DrainResult };

const queue = createOfflineQueue<QueuedOpKind>(safeStorage, STORAGE_KEY);

/**
 * Enqueue a write operation. Caller decides when to invoke this -- typically
 * inside a `try/catch` that wraps the live Supabase call: optimistic update
 * + Supabase write; on failure, enqueue the op + show "saved offline" toast.
 */
export function enqueueOp(
  kind: QueuedOpKind,
  payload: Record<string, unknown>,
): Promise<QueuedOp> {
  return queue.enqueue(kind, payload);
}

export function peekQueue(): Promise<QueuedOp[]> {
  return queue.peek();
}

export function clearQueue(): Promise<void> {
  return queue.clear();
}

export function drainQueue(
  executor: (op: QueuedOp) => Promise<boolean>,
): Promise<DrainResult> {
  return queue.drain(executor);
}
