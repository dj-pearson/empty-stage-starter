import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

/**
 * US-834: the worker must never keep an authenticated API response.
 *
 * Cache Storage matches on URL. `Authorization` is a request HEADER, and
 * cache.match() ignores headers unless the stored response carries a matching
 * `Vary`, which PostgREST does not send. So a cached GET /rest/v1/kids?... is
 * returned for ANY user asking for that URL. On a shared family tablet, user B
 * losing their connection got user A's children.
 *
 * public/sw.js is a browser artifact and is not part of the bundle, so this
 * EVALUATES the shipped file against stubbed service-worker globals and drives
 * its real fetch handler -- rather than asserting that the source contains
 * particular words, which would pass on a file that no longer does the thing.
 */

const SW_SOURCE = readFileSync(
  path.resolve(__dirname, '../../public/sw.js'),
  'utf8',
).replace('__SW_BUILD_ID__', 'test-build');

interface FakeCache {
  store: Map<string, unknown>;
  put: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  addAll: ReturnType<typeof vi.fn>;
}

function loadWorker(fetchImpl: (req: { url: string; method: string; mode?: string }) => unknown) {
  const listeners = new Map<string, (event: unknown) => void>();
  const caches_: Record<string, FakeCache> = {};

  /**
   * US-848: keys are normalised to absolute URLs, because the real Cache API
   * does. `cache.match('/index.html')` resolves the path against the worker's
   * scope; the first version of this double compared the raw string and
   * returned undefined, so the shell fallback looked broken when it was the
   * double that was wrong.
   */
  const SCOPE = 'https://tryeatpal.com';
  const keyOf = (req: string | { url: string }) =>
    new URL(typeof req === 'string' ? req : req.url, SCOPE).href;

  const makeCache = (): FakeCache => {
    const store = new Map<string, unknown>();
    return {
      store,
      put: vi.fn(async (req: { url: string }, res: unknown) => {
        store.set(keyOf(req), res);
      }),
      match: vi.fn(async (req: { url: string }) => store.get(keyOf(req))),
      keys: vi.fn(async () => [...store.keys()].map((url) => ({ url }))),
      delete: vi.fn(async (req: { url: string }) => store.delete(keyOf(req))),
      addAll: vi.fn(async () => {}),
    };
  };

  const sandbox = {
    self: {
      addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
      skipWaiting: vi.fn(async () => {}),
      clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => []) },
      registration: { showNotification: vi.fn() },
    },
    caches: {
      open: vi.fn(async (name: string) => (caches_[name] ??= makeCache())),
      keys: vi.fn(async () => Object.keys(caches_)),
      delete: vi.fn(async (name: string) => delete caches_[name]),
    },
    fetch: vi.fn(fetchImpl),
    console: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
    URL,
    Response: class {
      constructor(public body?: unknown, public init?: unknown) {}
      static redirect = vi.fn();
      clone() { return this; }
    },
    Request: class { constructor(public url: string) {} },
  };

  vm.createContext(sandbox);
  vm.runInContext(SW_SOURCE, sandbox);
  return { listeners, caches_, sandbox };
}

/** Drive the worker's fetch handler and wait for whatever it responded with. */
async function handleFetch(
  listeners: Map<string, (e: unknown) => void>,
  request: { url: string; method: string; mode?: string },
) {
  let responded: unknown;
  listeners.get('fetch')!({ request, respondWith: (p: unknown) => (responded = p) });
  return responded ? await responded : undefined;
}

const OK = { status: 200, clone() { return this; } };

let ctx: ReturnType<typeof loadWorker>;
beforeEach(() => {
  ctx = loadWorker(async () => OK);
});

describe('authenticated API responses are never cached', () => {
  it('loaded the real worker', () => {
    // Assert the instrument: if the file stopped registering a fetch handler,
    // every assertion below would be checking nothing.
    expect(ctx.listeners.has('fetch')).toBe(true);
    expect(ctx.listeners.has('activate')).toBe(true);
  });

  it.each([
    'https://api.tryeatpal.com/rest/v1/kids?select=*',
    'https://api.tryeatpal.com/auth/v1/user',
    'https://functions.tryeatpal.com/functions/v1/ai-meal-plan',
  ])('does not store %s', async (url) => {
    await handleFetch(ctx.listeners, { url, method: 'GET' });
    const stored = Object.values(ctx.caches_).flatMap((c) => [...c.store.keys()]);
    expect(stored).not.toContain(url);
  });

  it('still caches a static asset, so this is not passing by caching nothing', async () => {
    const url = 'https://tryeatpal.com/assets/index-abc123.js';
    await handleFetch(ctx.listeners, { url, method: 'GET' });
    const stored = Object.values(ctx.caches_).flatMap((c) => [...c.store.keys()]);
    expect(stored).toContain(url);
  });

  it('never reads a cached API response when the network fails', async () => {
    const url = 'https://api.tryeatpal.com/rest/v1/kids?select=*';
    // Plant one, as an earlier version of the worker would have left behind.
    const cache = await ctx.sandbox.caches.open('tryeatpal-test-build');
    cache.store.set(url, { body: "another user's children" });

    const offline = loadWorker(async () => {
      throw new TypeError('Failed to fetch');
    });
    const planted = await offline.sandbox.caches.open('tryeatpal-test-build');
    planted.store.set(url, { body: "another user's children" });

    await expect(
      handleFetch(offline.listeners, { url, method: 'GET' }),
    ).resolves.toMatchObject({ body: 'Network error' });
  });
});

describe('activation clears what an older worker stored', () => {
  it('deletes cached API entries and keeps the assets', async () => {
    const cache = await ctx.sandbox.caches.open('tryeatpal-test-build');
    cache.store.set('https://api.tryeatpal.com/rest/v1/kids?select=*', OK);
    cache.store.set('https://tryeatpal.com/assets/index-abc123.js', OK);

    let settled: unknown;
    ctx.listeners.get('activate')!({ waitUntil: (p: unknown) => (settled = p) });
    await settled;

    expect([...cache.store.keys()]).toEqual(['https://tryeatpal.com/assets/index-abc123.js']);
  });
});

/**
 * US-848: an offline navigation must use what the worker already cached.
 *
 * The fallback went straight to offline.html and never read the cache -- not
 * the shell precached at install, not the 70 JS/CSS chunks, not the navigation
 * responses this very function stores on the success path two lines above.
 * Measured in Chromium against the real build: EVERY offline navigation got
 * the static page, including reloading the page you were already on.
 *
 * Which made offline.html's own copy false. It promises "View your saved meal
 * plans" and "Check your grocery list", and a dead-end static page can do
 * neither.
 */
describe('US-848: an offline navigation serves the app, not a dead end', () => {
  const CACHE = 'tryeatpal-test-build';
  const navigate = (url: string) => ({ url, method: 'GET', mode: 'navigate' });

  /** A worker whose network is down, with `seed` already in its cache. */
  async function offlineWorkerWith(seed: Record<string, unknown>) {
    const worker = loadWorker(async () => {
      throw new Error('offline');
    });
    const cache = await worker.sandbox.caches.open(CACHE);
    for (const [url, body] of Object.entries(seed)) cache.store.set(url, body);
    return worker;
  }

  it('serves the exact page when that page is cached', async () => {
    const page = { status: 200, tag: 'cached /faq' };
    const worker = await offlineWorkerWith({
      'https://tryeatpal.com/faq': page,
      'https://tryeatpal.com/index.html': { status: 200, tag: 'shell' },
      'https://tryeatpal.com/offline.html': { status: 200, tag: 'offline page' },
    });
    const res = await handleFetch(worker.listeners, navigate('https://tryeatpal.com/faq'));
    expect(res).toBe(page);
  });

  it('falls back to the app shell for a route it has never cached', async () => {
    // The case that matters most: the user taps a link to a page they have not
    // visited. The shell boots and client-side routing renders it.
    const shell = { status: 200, tag: 'shell' };
    const worker = await offlineWorkerWith({
      'https://tryeatpal.com/index.html': shell,
      'https://tryeatpal.com/offline.html': { status: 200, tag: 'offline page' },
    });
    const res = await handleFetch(worker.listeners, navigate('https://tryeatpal.com/pricing'));
    expect(res).toBe(shell);
  });

  it("accepts '/' as the shell, since that is the same document in this build", async () => {
    const root = { status: 200, tag: 'root' };
    const worker = await offlineWorkerWith({
      'https://tryeatpal.com/': root,
      'https://tryeatpal.com/offline.html': { status: 200, tag: 'offline page' },
    });
    const res = await handleFetch(worker.listeners, navigate('https://tryeatpal.com/pricing'));
    expect(res).toBe(root);
  });

  it('still shows the offline page when there is no shell at all', async () => {
    // Not a scrub-everything change: with nothing cached, the static page is
    // exactly right, and this is what stops the test above passing vacuously.
    const offlinePage = { status: 200, tag: 'offline page' };
    const worker = await offlineWorkerWith({ 'https://tryeatpal.com/offline.html': offlinePage });
    const res = await handleFetch(worker.listeners, navigate('https://tryeatpal.com/pricing'));
    expect(res).toBe(offlinePage);
  });

  it('prefers the exact page over the shell', async () => {
    const page = { status: 200, tag: 'cached /faq' };
    const worker = await offlineWorkerWith({
      'https://tryeatpal.com/faq': page,
      'https://tryeatpal.com/index.html': { status: 200, tag: 'shell' },
    });
    const res = await handleFetch(worker.listeners, navigate('https://tryeatpal.com/faq'));
    expect(res).toBe(page);
  });

  it('leaves a successful navigation alone', async () => {
    const worker = loadWorker(async () => OK);
    const res = await handleFetch(worker.listeners, navigate('https://tryeatpal.com/faq'));
    expect(res).toBe(OK);
  });

  it("the offline page's promises are the ones the shell fallback makes true", () => {
    // If somebody rewrites offline.html to stop claiming the app works
    // offline, this fallback is still right -- but the claim is what made it
    // urgent, so it is pinned here rather than left as prose in a commit.
    const offline = readFileSync(path.resolve(__dirname, '../../public/offline.html'), 'utf8');
    expect(offline).toMatch(/meal plans/i);
    expect(offline).toMatch(/grocery list/i);
  });
});
