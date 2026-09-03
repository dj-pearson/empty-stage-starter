import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isServiceWorkerEnabled,
  unregisterServiceWorkers,
  FLAG_CACHE_KEY,
  SW_FLAG_KEY,
  SW_DEVICE_DISABLE_KEY,
} from './swRegistration';

/**
 * The kill switch, pinned (US-765).
 *
 * A service worker outlives the page that installed it, so "stop registering
 * it" is not a rollback -- every browser that already has one keeps serving
 * from it. These tests exist to hold two properties that are easy to break by
 * tidying the code: off is sticky and never expires back on, and disabling
 * actively unregisters rather than merely declining.
 */

const storageWith = (value: Record<string, string>) => ({
  getItem: (k: string) => (k in value ? value[k] : null),
});

const flagStorage = (flags: Record<string, unknown>, timestamp = Date.now()) =>
  storageWith({ [FLAG_CACHE_KEY]: JSON.stringify({ flags, timestamp }) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isServiceWorkerEnabled', () => {
  it('defaults to on when nothing has been cached', () => {
    expect(isServiceWorkerEnabled(storageWith({}))).toBe(true);
  });

  it('is off when the flag is explicitly false', () => {
    expect(isServiceWorkerEnabled(flagStorage({ [SW_FLAG_KEY]: false }))).toBe(false);
  });

  it('is on when the flag is explicitly true', () => {
    expect(isServiceWorkerEnabled(flagStorage({ [SW_FLAG_KEY]: true }))).toBe(true);
  });

  it('stays off for a cache older than the useFeatureFlag TTL', () => {
    // useFeatureFlag expires its cache after five minutes and falls back to the
    // default. That is right for a feature flag and wrong for a kill switch: an
    // off that turns back on by itself five minutes later has not killed
    // anything. Ignoring the timestamp here is the whole point.
    const sixDaysAgo = Date.now() - 6 * 24 * 60 * 60 * 1000;
    expect(isServiceWorkerEnabled(flagStorage({ [SW_FLAG_KEY]: false }, sixDaysAgo))).toBe(false);
  });

  it('is off when the device escape hatch is set', () => {
    expect(isServiceWorkerEnabled(storageWith({ [SW_DEVICE_DISABLE_KEY]: 'true' }))).toBe(false);
  });

  it('ignores an unrelated flag', () => {
    expect(isServiceWorkerEnabled(flagStorage({ some_other_flag: false }))).toBe(true);
  });

  it('fails open on malformed JSON rather than taking the PWA down', () => {
    expect(isServiceWorkerEnabled(storageWith({ [FLAG_CACHE_KEY]: '{not json' }))).toBe(true);
  });

  it('fails open when storage throws (private mode)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(isServiceWorkerEnabled(throwing)).toBe(true);
  });

  it('fails open when there is no storage at all', () => {
    expect(isServiceWorkerEnabled(null)).toBe(true);
  });

  it('treats a non-boolean value as unset', () => {
    expect(isServiceWorkerEnabled(flagStorage({ [SW_FLAG_KEY]: 'false' }))).toBe(true);
  });
});

describe('unregisterServiceWorkers', () => {
  it('unregisters every registration and drops only the versioned app caches', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }, { unregister }]) },
    });
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      keys: vi.fn().mockResolvedValue(['tryeatpal-abc123', 'tryeatpal-def456', 'share-target-cache']),
      delete: vi.fn(async (name: string) => {
        deleted.push(name);
        return true;
      }),
    });

    const removed = await unregisterServiceWorkers();

    expect(removed).toBe(2);
    expect(unregister).toHaveBeenCalledTimes(2);
    // The share cache holds a share the user just made, mid-handoff to
    // ShareTarget. Turning the worker off must not eat it.
    expect(deleted.sort()).toEqual(['tryeatpal-abc123', 'tryeatpal-def456']);
  });

  it('reports zero when there is nothing registered', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([]) },
    });
    vi.stubGlobal('caches', { keys: vi.fn().mockResolvedValue([]), delete: vi.fn() });

    await expect(unregisterServiceWorkers()).resolves.toBe(0);
  });

  it('resolves rather than throwing when the browser has no service worker support', async () => {
    vi.stubGlobal('navigator', {});
    await expect(unregisterServiceWorkers()).resolves.toBe(0);
  });

  it('still unregisters when the Cache API is unavailable', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', {
      serviceWorker: { getRegistrations: vi.fn().mockResolvedValue([{ unregister }]) },
    });
    vi.stubGlobal('caches', undefined);

    await expect(unregisterServiceWorkers()).resolves.toBe(1);
    expect(unregister).toHaveBeenCalledOnce();
  });
});
