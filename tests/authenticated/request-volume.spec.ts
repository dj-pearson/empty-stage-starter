import { test, expect } from '@playwright/test';
import { signIn } from '../helpers/auth';

/**
 * US-861: how many times one page load asks the auth server who you are.
 *
 * supabase.auth.getUser() revalidates the token against GoTrue on every call --
 * that is the difference between it and getSession(), which reads localStorage.
 * 101 call sites in this app reach for it, almost all of them only to read
 * user.id, and they mount within a few hundred milliseconds of each other.
 * Measured on the built app before the fix:
 *
 *   /dashboard          18   /dashboard/grocery  12
 *   /dashboard/planner  10   /dashboard/pantry   10
 *
 * round trips, on every screen, before anything was clicked. After installing
 * the dedupe in src/lib/cachedGetUser.ts: one each.
 *
 * THE BUDGET IS 2, NOT 1. supabase-js can legitimately revalidate once more
 * during a load -- a token refresh on startup fires an auth event, which clears
 * the cache by design. Anything above that is the storm coming back.
 *
 * Deliberately narrow. A budget on TOTAL requests would be a budget on the
 * fixtures in scripts/dev/fake-postgrest.mjs, and would move whenever a screen
 * gained data. The number of times a page asks who you are should not depend on
 * what is on it.
 */
const ROUTES = [
  '/dashboard',
  '/dashboard/grocery',
  '/dashboard/pantry',
  '/dashboard/planner',
  '/dashboard/recipes',
  '/dashboard/kids',
  '/dashboard/settings',
];

const MAX_GET_USER = 2;

test.describe('signed-in pages do not re-ask who you are', () => {
  test('the route list is worth iterating', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(5);
    expect(ROUTES).toContain('/dashboard');
  });

  for (const route of ROUTES) {
    test(`${route} calls /auth/v1/user at most ${MAX_GET_USER} times`, async ({ page, context }) => {
      await signIn(context);

      const calls: string[] = [];
      page.on('request', (request) => {
        // endsWith rather than includes: /auth/v1/user is a prefix of nothing
        // else here, but a query string would still be this same call.
        const path = new URL(request.url()).pathname;
        if (path === '/auth/v1/user') calls.push(request.method());
      });

      await page.goto(route, { waitUntil: 'networkidle' });
      await page.locator('main, [role="main"]').first().waitFor({ state: 'visible' });
      await page
        .locator('.animate-pulse')
        .first()
        .waitFor({ state: 'detached', timeout: 10_000 })
        .catch(() => {
          // No skeleton here, or it never mounted.
        });
      // Long enough for the late-mounting components that made up the storm.
      await page.waitForTimeout(3000);

      expect(new URL(page.url()).pathname, `redirected to ${page.url()}`).not.toMatch(/^\/auth/);

      // At least one: zero would mean the page never resolved a user at all,
      // which is how this assertion would pass on a broken page.
      expect(calls.length, `${route} made no auth call at all`).toBeGreaterThanOrEqual(1);
      expect(
        calls.length,
        `${route} called /auth/v1/user ${calls.length} times; the dedupe in src/lib/cachedGetUser.ts is not doing its job`
      ).toBeLessThanOrEqual(MAX_GET_USER);
    });
  }
});
