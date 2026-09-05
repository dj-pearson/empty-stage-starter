import { test, expect } from '@playwright/test';

/**
 * The PWA layer, end to end (US-765).
 *
 * public/sw.js, public/offline.html and registerServiceWorker() were all
 * written and complete, and nothing ever called the last of them. The result
 * looked exactly like a working PWA in the source tree: a manifest advertising
 * a POST share target, a worker implementing it, an offline page for the
 * fallback -- none of it reachable, because no worker was ever installed.
 *
 * A unit test cannot catch that class of bug. Only a real browser installing a
 * real worker and then losing the network proves the pieces are connected, so
 * these run against a production build served over http rather than the dev
 * server (the registration is gated on import.meta.env.PROD).
 *
 * Wiring these into CI is US-764; until that lands this is run by hand with
 * `npx playwright test tests/pwa-offline.spec.ts`.
 */

async function waitForServiceWorker(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    async () => {
      if (!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return Boolean(reg?.active);
    },
    undefined,
    { timeout: 20_000 }
  );
}

/**
 * An active worker is not yet a controlling one.
 *
 * sw.js calls clients.claim() in activate, but that resolves asynchronously
 * after the worker becomes active, and until it lands the page's own fetches go
 * straight to the network. Waiting on reg.active alone made the share-target
 * test race the claim: the POST reached the static server, which answered it
 * with the SPA fallback, so the request "succeeded" and the worker never saw
 * it. Anything asserting that the worker intercepted a request has to wait for
 * navigator.serviceWorker.controller.
 */
async function waitForController(page: import('@playwright/test').Page) {
  await waitForServiceWorker(page);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, {
    timeout: 20_000,
  });
}

test.describe('service worker registration', () => {
  test('installs a worker and caches the offline page', async ({ page }) => {
    await page.goto('/');
    await waitForServiceWorker(page);

    const cacheNames: string[] = await page.evaluate(() => caches.keys());
    // The cache name carries the build id the stamp step wrote, so it is
    // tryeatpal-<hex> and never the old hardcoded tryeatpal-v1.
    expect(cacheNames.some((n) => /^tryeatpal-[a-f0-9]{12}$/.test(n))).toBe(true);
    expect(cacheNames).not.toContain('tryeatpal-v1');
  });

  test('serves the offline page when the network is gone', async ({ page, context }) => {
    await page.goto('/');
    // Must be controlling, not merely active: an uncontrolled page's
    // navigation goes to the network, and offline that lands on Chromium's own
    // error page (an empty body) rather than on the worker's fallback.
    await waitForController(page);

    await context.setOffline(true);
    const response = await page.goto('/pricing');

    // The worker answers from cache, so this is a real 200 rather than a
    // navigation failure -- that is the whole point of the fallback.
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(/offline/i);
    await expect(page.getByRole('heading', { name: /offline/i })).toBeVisible();

    await context.setOffline(false);
  });

  test('the kill switch removes an installed worker', async ({ page }) => {
    await page.goto('/');
    await waitForServiceWorker(page);

    // Turning the flag off is what an admin toggle writes into the shared
    // feature-flag cache. The next load must actively unregister, not merely
    // decline to register: the already-installed worker is the problem.
    await page.evaluate(() => {
      localStorage.setItem(
        'eatpal_feature_flags',
        JSON.stringify({ flags: { pwa_service_worker: false }, timestamp: Date.now() })
      );
    });
    await page.reload();

    // Both halves, in one wait. unregisterServiceWorkers() removes the
    // registrations first and drops the caches after, so polling only the
    // registration count reads the cache list mid-flight and sees caches that
    // are about to go.
    await page.waitForFunction(
      async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        const cacheNames = await caches.keys();
        return (
          registrations.length === 0 && cacheNames.every((n) => !n.startsWith('tryeatpal-'))
        );
      },
      undefined,
      { timeout: 20_000 }
    );
  });
});

test.describe('web share target', () => {
  test('a POST to /share is handled by the worker and lands on the share page', async ({
    page,
  }) => {
    await page.goto('/');
    await waitForController(page);

    // The manifest declares share_target as a multipart POST to /share. No CDN
    // serves a POST to a static SPA route, so if the worker is not installed
    // this is a hard failure rather than a redirect -- which is exactly what
    // shipped before this story.
    const landed = await page.evaluate(async () => {
      const body = new FormData();
      body.set('title', 'Sheet-pan chicken');
      body.set('url', 'https://example.com/recipe');
      const res = await fetch('/share', { method: 'POST', body });
      return { ok: res.ok, url: res.url };
    });

    expect(landed.ok).toBe(true);
    expect(landed.url).toContain('/share');

    const shared = await page.evaluate(async () => {
      const cache = await caches.open('share-target-cache');
      const hit = await cache.match(new Request('/share-data'));
      return hit ? await hit.json() : null;
    });

    expect(shared).toMatchObject({
      title: 'Sheet-pan chicken',
      url: 'https://example.com/recipe',
    });
  });

  test('activation drops the previous build cache but keeps a pending share', async ({
    page,
    context,
  }) => {
    // Seed both caches BEFORE any app code runs, so the worker's very first
    // activation is the thing under test. Driving a second activation from
    // inside the page is not available to a test -- registration.update() only
    // installs a new worker when the served sw.js bytes differ, which a browser
    // cannot arrange -- so the first install is the only real activation there
    // is, and seeding ahead of it is what makes this deterministic.
    await context.addInitScript(() => {
      void (async () => {
        const stale = await caches.open('tryeatpal-previousbuild');
        await stale.put(new Request('/stale-asset.js'), new Response('old'));
        const share = await caches.open('share-target-cache');
        await share.put(
          new Request('/share-data'),
          new Response(JSON.stringify({ title: 'pending' }), {
            headers: { 'Content-Type': 'application/json' },
          })
        );
      })();
    });

    await page.goto('/');
    await waitForController(page);

    await page.waitForFunction(
      async () => !(await caches.keys()).includes('tryeatpal-previousbuild'),
      undefined,
      { timeout: 20_000 }
    );

    // The cleanup used to delete every cache whose name differed from
    // CACHE_NAME, which took share-target-cache with it -- so a share arriving
    // around an activation was destroyed before ShareTarget could read it.
    // Versioned cache names make that fire on every single deploy.
    const survived = await page.evaluate(async () => {
      const cache = await caches.open('share-target-cache');
      return Boolean(await cache.match(new Request('/share-data')));
    });
    expect(survived).toBe(true);
  });
});
