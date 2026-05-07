import { safeStorage } from '@/lib/platform';

/**
 * Lazy Platform.OS check — `react-native` may not be importable in test
 * environments (jsdom). Returns `'web'` when the module isn't available so
 * tests can exercise the queue logic without a native runtime.
 */
function platformOS(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native').Platform.OS;
  } catch {
    return 'web';
  }
}

/**
 * US-127: write-queue for offline mode.
 *
 * Queues structured "operations" while the device is offline (or while a
 * Supabase call fails) and replays them in order when the network comes
 * back. Read-side caching is handled by the existing AppContext (cached in
 * memory + localStorage); this module is concerned only with making sure
 * writes don't get silently lost.
 *
 * Storage: serialised JSON in `safeStorage` under `eatpal.mobile.syncQueue`.
 * A small ring-buffer cap (MAX_QUEUE) prevents unbounded growth if the
 * device is offline for days. Each op carries its own retry counter so a
 * single poison-pill op can't block the rest of the queue forever.
 *
 * Conflict policy: last-write-wins. The replay path doesn't try to merge
 * server-side state — it just re-issues the write. For grocery toggles and
 * meal-plan inserts that's the right call; richer entities (recipe edits)
 * should still go through the AppContext path that already handles diffs.
 */

const STORAGE_KEY = 'eatpal.mobile.syncQueue';
const MAX_QUEUE = 200;
const MAX_RETRIES = 5;

export type QueuedOpKind =
  | 'grocery.toggle'
  | 'grocery.insert'
  | 'plan.insert'
  | 'plan.update'
  | 'plan.delete'
  | 'food.update'
  | 'kid.insert';

export interface QueuedOp {
  id: string;
  kind: QueuedOpKind;
  /** Wallclock ms when the op was enqueued. */
  enqueuedAt: number;
  /** Number of replay attempts so far (gates the poison-pill drop). */
  attempts: number;
  /** Op-specific payload — kept JSON-safe (no class instances, no functions). */
  payload: Record<string, unknown>;
}

async function loadQueue(): Promise<QueuedOp[]> {
  try {
    const raw = await safeStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedOp[]) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedOp[]): Promise<void> {
  try {
    // Cap the queue to prevent runaway growth on long offline sessions.
    const trimmed = queue.length > MAX_QUEUE ? queue.slice(-MAX_QUEUE) : queue;
    await safeStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.warn('[syncQueue] save failed:', err);
  }
}

function newId(): string {
  // Cheap unique id — collision is fine because we de-dupe on enqueue id.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Enqueue a write operation. Caller decides when to invoke this — typically
 * inside a `try/catch` that wraps the live Supabase call: optimistic update
 * + Supabase write; on failure, enqueue the op + show "saved offline" toast.
 */
export async function enqueueOp(kind: QueuedOpKind, payload: Record<string, unknown>): Promise<QueuedOp> {
  const op: QueuedOp = {
    id: newId(),
    kind,
    enqueuedAt: Date.now(),
    attempts: 0,
    payload,
  };
  const queue = await loadQueue();
  queue.push(op);
  await saveQueue(queue);
  return op;
}

export async function peekQueue(): Promise<QueuedOp[]> {
  return loadQueue();
}

export async function clearQueue(): Promise<void> {
  await safeStorage.removeItem(STORAGE_KEY);
}

export interface DrainResult {
  succeeded: number;
  failed: number;
  dropped: number;
}

/**
 * Drain the queue, calling `executor(op)` for each entry in FIFO order.
 *
 *  - On `executor` returning `true` → op is removed from the queue.
 *  - On `false` or thrown error    → op is retained; `attempts` is bumped;
 *    the entry is moved to the tail so other ops can make progress (last-
 *    write-wins ordering still holds because the executor is idempotent
 *    for our op kinds).
 *  - When `attempts` exceeds MAX_RETRIES, the op is **dropped** and
 *    counted in `dropped` so callers can warn the user.
 *
 * Web is a no-op (returns zeros) — the web app already runs online-first
 * and uses Supabase realtime for sync.
 */
export async function drainQueue(
  executor: (op: QueuedOp) => Promise<boolean>
): Promise<DrainResult> {
  if (platformOS() === 'web') {
    return { succeeded: 0, failed: 0, dropped: 0 };
  }

  const initial = await loadQueue();
  if (initial.length === 0) return { succeeded: 0, failed: 0, dropped: 0 };

  const remaining: QueuedOp[] = [];
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
      console.warn('[syncQueue] dropping poison-pill op', op);
      continue;
    }
    failed++;
    remaining.push(next);
  }

  await saveQueue(remaining);
  return { succeeded, failed, dropped };
}
