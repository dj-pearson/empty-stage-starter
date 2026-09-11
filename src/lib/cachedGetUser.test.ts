import { describe, it, expect, vi } from 'vitest';

import { createGetUserCache, CACHE_MS } from './cachedGetUser';

/**
 * US-861. The behaviour that matters is the concurrent one: the eighteen calls
 * on /dashboard are not spread out, they are a mount storm within a few hundred
 * milliseconds, so sharing one in-flight promise is what removes them. The time
 * window is only a backstop for the component that mounts a moment later.
 */
const USER = { data: { user: { id: 'u1' } }, error: null };

/** A getUser that resolves when the test says so, counting its calls. */
function deferredOriginal(result: unknown = USER) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const fn = vi.fn(async () => {
    await gate;
    return result;
  });
  return { fn, release };
}

describe('createGetUserCache', () => {
  it('answers concurrent callers with one network call', async () => {
    const { fn, release } = deferredOriginal();
    const cache = createGetUserCache(fn as never);

    const all = Promise.all(Array.from({ length: 18 }, () => cache.getUser()));
    release();
    const results = await all;

    expect(fn).toHaveBeenCalledTimes(1);
    expect(cache.networkCalls()).toBe(1);
    // Every caller still gets the answer, not undefined.
    expect(results.every((r) => r === USER)).toBe(true);
  });

  it('serves a later caller from memory inside the window', async () => {
    const { fn, release } = deferredOriginal();
    let clock = 0;
    const cache = createGetUserCache(fn as never, () => clock);

    const first = cache.getUser();
    release();
    await first;

    clock = CACHE_MS - 1;
    await cache.getUser();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('goes back to the network once the window has passed', async () => {
    const { fn, release } = deferredOriginal();
    let clock = 0;
    const cache = createGetUserCache(fn as never, () => clock);

    const first = cache.getUser();
    release();
    await first;

    clock = CACHE_MS;
    await cache.getUser();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('forgets everything when invalidated, which is what an auth event does', async () => {
    const { fn, release } = deferredOriginal();
    const cache = createGetUserCache(fn as never);

    const first = cache.getUser();
    release();
    await first;

    cache.invalidate();
    await cache.getUser();
    // Signing in as somebody else must never be answered with the last user.
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failure', async () => {
    const failure = { data: { user: null }, error: { message: 'network' } };
    const { fn, release } = deferredOriginal(failure);
    const cache = createGetUserCache(fn as never);

    const first = cache.getUser();
    release();
    expect(await first).toBe(failure);

    // A blip must not become 30 seconds of a signed-out-looking app.
    await cache.getUser();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('never answers a call that names a specific token', async () => {
    const { fn, release } = deferredOriginal();
    const cache = createGetUserCache(fn as never);

    const first = cache.getUser();
    release();
    await first;

    await cache.getUser('some.other.jwt');
    await cache.getUser('some.other.jwt');
    // getUser(jwt) asks about that token, not about the session.
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('a failed in-flight call does not wedge the cache', async () => {
    // inFlight has to be cleared on the error path too, or every later call
    // waits on a promise that already settled with an error.
    const failure = { data: { user: null }, error: { message: 'network' } };
    const first = deferredOriginal(failure);
    const cache = createGetUserCache(first.fn as never);
    const p = cache.getUser();
    first.release();
    await p;

    const second = await cache.getUser();
    expect(second).toBe(failure);
    expect(first.fn).toHaveBeenCalledTimes(2);
  });
});
