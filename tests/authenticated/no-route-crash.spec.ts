import { test, expect } from '@playwright/test';
import { signIn } from '../helpers/auth';

/**
 * US-856: no signed-in route throws its way into the error boundary.
 *
 * Nothing watched the browser console behind the login. Sweeping it found
 * /dashboard/pantry dead: `ReferenceError: t is not defined`, twice, and
 * RouteErrorBoundary rendering in place of the page. The cause was
 * EmptyPantryState calling t('pantry.emptyTitle') without its own
 * useTranslation() -- so the crash only happened when the pantry was EMPTY,
 * which is to say on every new account, on one of the six screens the primary
 * navigation offers.
 *
 * Two gates came out of it. scripts/ci/typecheck-ratchet.sh now holds TS2304 at
 * zero, which is where that particular bug was visible all along (inside an
 * 800-error backlog). This one is the behavioural half: it does not care why a
 * page threw.
 *
 * WHAT IS DELIBERATELY IGNORED. Against scripts/dev/fake-postgrest.mjs the
 * realtime websocket cannot connect and Sentry's ingest host is unreachable, so
 * both log console errors on every route. Asserting on all console.error output
 * would mean asserting on the fake backend's shape, and the gate would be
 * switched off the first time that changed. An uncaught exception and a
 * rendered error boundary are neither fake-backend artefacts nor debatable.
 *
 * Requires a build against the fake backend:
 *   node scripts/dev/fake-postgrest.mjs &
 *   VITE_SUPABASE_URL=http://127.0.0.1:54999 VITE_SUPABASE_ANON_KEY=<jwt-shaped> \
 *     npx vite build --outDir dist-e2e
 *   E2E_TARGET=dist E2E_DIST=dist-e2e npx playwright test tests/authenticated/
 */

/** Every signed-in route reachable from the dashboard navigation. */
const ROUTES = [
  '/dashboard',
  '/dashboard/planner',
  '/dashboard/grocery',
  '/dashboard/pantry',
  '/dashboard/recipes',
  '/dashboard/kids',
  '/dashboard/settings',
  '/dashboard/insights',
  '/dashboard/progress',
  '/dashboard/analytics',
  '/dashboard/food-tracker',
  '/dashboard/ai-coach',
  '/dashboard/meal-builder',
  '/dashboard/food-chaining',
  '/dashboard/sibling-meal-finder',
  '/dashboard/billing',
  '/dashboard/household',
  '/dashboard/accessibility-settings',
];

test.describe('signed-in routes render without throwing', () => {
  test('the route list covers the navigation, not one page', () => {
    // The pantry was the fourth item in the sidebar. A list trimmed to the
    // pages that happen to pass is how this went unseen.
    expect(ROUTES.length).toBeGreaterThanOrEqual(15);
    expect(ROUTES).toContain('/dashboard/pantry');
  });

  for (const route of ROUTES) {
    test(`${route} does not throw`, async ({ page, context }) => {
      await signIn(context);

      const thrown: string[] = [];
      page.on('pageerror', (error) => thrown.push(`${error.name}: ${error.message}`));
      page.on('console', (message) => {
        // RouteErrorBoundary logs this before rendering its fallback. Caught by
        // React, so it never reaches pageerror in production builds.
        if (message.text().includes('Route error at')) thrown.push(message.text().slice(0, 200));
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
      await page.waitForTimeout(750);

      // A redirect to /auth would make every assertion below pass on the login
      // screen.
      expect(new URL(page.url()).pathname, `redirected to ${page.url()}`).not.toMatch(/^\/auth/);

      expect(thrown, `${route} threw:\n${thrown.join('\n')}`).toEqual([]);

      // And the boundary's own copy, in case a future version stops logging.
      await expect(
        page.getByText('Something went wrong', { exact: false }),
      ).toHaveCount(0);
    });
  }
});
