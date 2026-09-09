import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * US-127 / US-823: the mobile adapter over the shared queue.
 *
 * WHAT THIS FILE USED TO DO. It imported app/mobile/lib/syncQueue and called
 * drainQueue, which opened with `if (platformOS() === 'web') return zeros`.
 * platformOS() reads Platform.OS through a require('react-native') whose throw
 * is caught into 'web' -- which is what happens under vitest. So the drain
 * never ran, and both tests took an `if (all zeros) return` branch. Replacing
 * the entire drain body with `return {succeeded:0,failed:0,dropped:0}` left the
 * file green. It asserted nothing about replay, retry or drop.
 *
 * The replay contract now lives in src/lib/offlineQueue.test.ts, against the
 * shared mechanism, with no platform in the way. What is left here is what is
 * genuinely mobile: that the adapter binds the right storage under the right
 * key, and that its exports still behave for the callers that use them
 * (app/(tabs)/lists.tsx enqueues, useOfflineSyncDriver drains).
 */

const STORAGE_KEY = 'eatpal.mobile.syncQueue';

// The adapter binds safeStorage from @/lib/platform. Back it with a plain
// in-memory map so the assertions are about the queue, not about jsdom.
const store: Record<string, string> = {};
vi.mock('@/lib/platform', () => ({
  safeStorage: {
    getItem: async (k: string) => (k in store ? store[k] : null),
    setItem: async (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: async (k: string) => {
      delete store[k];
    },
  },
}));

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  vi.resetModules();
});

describe('mobile syncQueue adapter', () => {
  it('enqueues and drains through the shared queue', async () => {
    const { enqueueOp, drainQueue, peekQueue } = await import('../../app/mobile/lib/syncQueue');

    await enqueueOp('grocery.toggle', { id: 'a', checked: true });
    await enqueueOp('grocery.toggle', { id: 'b', checked: false });
    expect(await peekQueue()).toHaveLength(2);

    const seen: string[] = [];
    const result = await drainQueue(async (op) => {
      seen.push((op.payload as { id: string }).id);
      return true;
    });

    // The assertions the old file could not reach.
    expect(seen).toEqual(['a', 'b']);
    expect(result).toEqual({ succeeded: 2, failed: 0, dropped: 0 });
    expect(await peekQueue()).toHaveLength(0);
  });

  it('retains a failed op with a bumped attempts counter', async () => {
    const { enqueueOp, drainQueue, peekQueue } = await import('../../app/mobile/lib/syncQueue');

    await enqueueOp('plan.insert', { id: 'p1' });
    const result = await drainQueue(async () => false);

    expect(result.failed).toBe(1);
    const queue = await peekQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].attempts).toBe(1);
  });

  it('writes under the key the shipped app already reads', async () => {
    const { enqueueOp } = await import('../../app/mobile/lib/syncQueue');
    await enqueueOp('grocery.toggle', { id: 'a', checked: true });

    // A rename here would silently orphan every op queued by an installed
    // build, so the key is pinned rather than inferred.
    expect(Object.keys(store)).toEqual([STORAGE_KEY]);
    expect(JSON.parse(store[STORAGE_KEY])).toHaveLength(1);
  });

  it('clears the queue', async () => {
    const { enqueueOp, clearQueue, peekQueue } = await import('../../app/mobile/lib/syncQueue');
    await enqueueOp('grocery.toggle', { id: 'a', checked: true });
    await clearQueue();
    expect(await peekQueue()).toEqual([]);
  });
});
