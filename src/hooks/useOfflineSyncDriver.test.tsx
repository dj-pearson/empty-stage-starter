import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act, cleanup } from '@testing-library/react';

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

/**
 * The executor is replaced wholesale rather than stubbing PostgREST, because
 * what this file is about is the DRIVER: when it drains, how often, and what it
 * says afterwards. createGroceryExecutor's own behaviour is covered in
 * src/lib/webSyncQueue.test.ts.
 */
let executorResult: (kind: string) => boolean = () => true;
const executorCalls: string[] = [];

vi.mock('@/lib/webSyncQueue', async () => {
  const actual = await vi.importActual<typeof import('@/lib/webSyncQueue')>('@/lib/webSyncQueue');
  return {
    ...actual,
    createGroceryExecutor: () => async (op: { kind: string }) => {
      executorCalls.push(op.kind);
      // A slow write, so a second drain triggered while this one is in flight
      // has something to overlap with.
      await new Promise((r) => setTimeout(r, 5));
      return executorResult(op.kind);
    },
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));

import { useOfflineSyncDriver } from './useOfflineSyncDriver';
import { queueWrite, pendingWriteCount, webQueueKey } from '@/lib/webSyncQueue';
import { MAX_RETRIES } from '@/lib/offlineQueue';

const ONLINE = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
}

beforeEach(() => {
  localStorage.clear();
  executorCalls.length = 0;
  executorResult = () => true;
  toastSuccess.mockClear();
  toastError.mockClear();
  setOnline(true);
});

afterEach(async () => {
  if (ONLINE) Object.defineProperty(window.navigator, 'onLine', ONLINE);
  // A drain that was still in flight when the test ended would otherwise run
  // against the NEXT test's freshly seeded queue and eat it. Unmounting sets
  // the cancel flag but cannot un-read a queue already loaded, so let the
  // stragglers finish before beforeEach clears storage.
  cleanup();
  await new Promise((r) => setTimeout(r, 25));
});

describe('useOfflineSyncDriver', () => {
  it('drains a queue written in a previous session, on mount', async () => {
    // The case no online/offline transition can ever catch: the tab was closed
    // in the aisle and reopened at home.
    await queueWrite('user-1', 'grocery.toggle', { id: 'g1', checked: true });

    renderHook(() => useOfflineSyncDriver('user-1'));

    await waitFor(() => expect(executorCalls).toEqual(['grocery.toggle']));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Synced 1 change made offline.'));
    expect(await pendingWriteCount('user-1')).toBe(0);
  });

  it('says how many landed when there is more than one', async () => {
    await queueWrite('user-1', 'grocery.toggle', { id: 'g1', checked: true });
    await queueWrite('user-1', 'grocery.delete', { id: 'g2' });

    renderHook(() => useOfflineSyncDriver('user-1'));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Synced 2 changes made offline.'));
  });

  /**
   * US-823 AC7. A dropped op is a change the user was told was saved. The
   * difference between this and losing it silently is the toast, so the toast
   * is the assertion.
   */
  it('tells the user when a write was refused often enough to be discarded', async () => {
    executorResult = () => false;
    // Seeded one attempt short of the cap, so a single drain is the failure
    // that drops it. How many failures it takes is offlineQueue's business and
    // is covered there; what is being asserted here is that the driver SAYS SO
    // when a drain comes back with dropped > 0.
    localStorage.setItem(
      webQueueKey('user-1'),
      JSON.stringify([
        {
          id: 'op-1',
          kind: 'grocery.toggle',
          enqueuedAt: Date.now(),
          attempts: MAX_RETRIES - 1,
          payload: { id: 'g1', checked: true },
        },
      ]),
    );

    renderHook(() => useOfflineSyncDriver('user-1'));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        "1 offline change couldn't be saved and was discarded.",
      ),
    );
    expect(await pendingWriteCount('user-1')).toBe(0);
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it('does not attempt a drain while the browser says it is offline', async () => {
    setOnline(false);
    await queueWrite('user-1', 'grocery.toggle', { id: 'g1', checked: true });

    renderHook(() => useOfflineSyncDriver('user-1'));

    await new Promise((r) => setTimeout(r, 30));
    expect(executorCalls).toEqual([]);
    // ...and the write is still there, waiting.
    expect(await pendingWriteCount('user-1')).toBe(1);
  });

  it('drains when the connection comes back to a tab that stayed open', async () => {
    setOnline(false);
    await queueWrite('user-1', 'grocery.toggle', { id: 'g1', checked: true });
    renderHook(() => useOfflineSyncDriver('user-1'));
    await new Promise((r) => setTimeout(r, 20));
    expect(executorCalls).toEqual([]);

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(executorCalls).toEqual(['grocery.toggle']));
  });

  it('never replays the same op twice when online fires during a drain', async () => {
    // Two writes for one tap is the failure this guards. The mount drain is
    // still in flight (the executor sleeps) when `online` arrives.
    await queueWrite('user-1', 'grocery.toggle', { id: 'g1', checked: true });

    renderHook(() => useOfflineSyncDriver('user-1'));
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(pendingWriteCount('user-1')).resolves.toBe(0));
    await new Promise((r) => setTimeout(r, 30));
    expect(executorCalls).toEqual(['grocery.toggle']);
  });

  it('drops the queues of other accounts on this device and keeps the current one', async () => {
    await queueWrite('user-1', 'grocery.toggle', { id: 'g1', checked: true });
    await queueWrite('someone-else', 'grocery.toggle', { id: 'g9', checked: true });
    localStorage.setItem('kid-meal-planner', 'not ours');

    renderHook(() => useOfflineSyncDriver('user-1'));

    await waitFor(() => expect(localStorage.getItem(webQueueKey('someone-else'))).toBeNull());
    expect(localStorage.getItem('kid-meal-planner')).toBe('not ours');
    // Only this user's op was replayed; the other account's never runs here.
    await waitFor(() => expect(executorCalls).toEqual(['grocery.toggle']));
  });

  it('does nothing at all for a signed-out visitor', async () => {
    await queueWrite('user-1', 'grocery.toggle', { id: 'g1', checked: true });

    renderHook(() => useOfflineSyncDriver(null));

    await new Promise((r) => setTimeout(r, 30));
    expect(executorCalls).toEqual([]);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(await pendingWriteCount('user-1')).toBe(1);
  });

  it('says nothing when there was nothing to send', async () => {
    renderHook(() => useOfflineSyncDriver('user-1'));

    await new Promise((r) => setTimeout(r, 30));
    expect(executorCalls).toEqual([]);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
