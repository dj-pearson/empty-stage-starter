import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  sharedQuery,
  invalidateSharedQueries,
  sharedQueryStats,
  installSharedQueryInvalidation,
  __setSharedQueryClock,
  SHARED_TTL_MS,
} from './sharedQuery';

/**
 * US-866. The case this exists for is concurrent: AppSidebar and Dashboard both
 * mount useNavEntitlements in the same tick, so the two callers have to meet on
 * one request. The TTL is the lesser half.
 */
let clock = 0;

beforeEach(() => {
  clock = 0;
  __setSharedQueryClock(() => clock);
  invalidateSharedQueries();
});

/** A fetcher that resolves when the test says so. */
function gated<T>(value: T) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const fn = vi.fn(async () => {
    await gate;
    return value;
  });
  return { fn, release };
}

describe('sharedQuery', () => {
  it('answers concurrent callers of the same key with one request', async () => {
    const { fn, release } = gated('sub');
    const all = Promise.all([sharedQuery('k', fn), sharedQuery('k', fn), sharedQuery('k', fn)]);
    release();
    expect(await all).toEqual(['sub', 'sub', 'sub']);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('keeps different keys apart', async () => {
    const a = gated('a');
    const b = gated('b');
    const both = Promise.all([sharedQuery('a', a.fn), sharedQuery('b', b.fn)]);
    a.release();
    b.release();
    expect(await both).toEqual(['a', 'b']);
    expect(a.fn).toHaveBeenCalledTimes(1);
    expect(b.fn).toHaveBeenCalledTimes(1);
  });

  it('serves a later caller from memory, then goes back once the TTL passes', async () => {
    const { fn, release } = gated('v');
    const first = sharedQuery('k', fn);
    release();
    await first;

    clock = SHARED_TTL_MS - 1;
    await sharedQuery('k', fn);
    expect(fn).toHaveBeenCalledTimes(1);

    clock = SHARED_TTL_MS;
    await sharedQuery('k', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('never answers across an auth change', async () => {
    const { fn, release } = gated('mine');
    const first = sharedQuery('k', fn);
    release();
    await first;

    // Anything surviving this is one account's roles answering another's
    // question, which is a leak and not a stale render.
    invalidateSharedQueries();
    await sharedQuery('k', fn);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sharedQueryStats().cached).toBe(1);
  });

  it('does not cache a rejection, and does not wedge the key', async () => {
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(sharedQuery('k', failing)).rejects.toThrow('offline');
    expect(sharedQueryStats().inFlight).toBe(0);

    // One failed request must not become 30 seconds of a page that believes the
    // user has no subscription.
    await expect(sharedQuery('k', failing)).rejects.toThrow('offline');
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it('installs invalidation against whatever subscribe function it is handed', () => {
    let registered: (() => void) | null = null;
    installSharedQueryInvalidation((cb) => { registered = cb; });
    expect(registered).toBeTypeOf('function');
  });

  it('survives a client with no auth rather than failing the page', () => {
    expect(() =>
      installSharedQueryInvalidation(() => {
        throw new Error('no auth on the mock client');
      })
    ).not.toThrow();
  });
});
