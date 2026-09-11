import { test, expect, devices } from '@playwright/test';
import { signIn } from '../helpers/auth';

/**
 * US-865: a dashboard page mounts once.
 *
 * src/pages/Dashboard.tsx used to render BOTH shells -- a desktop one inside a
 * sidebar layout and a mobile one with a fixed header and bottom nav -- each
 * with its own <main> and its own <Outlet/>. The CSS hid one; React mounted
 * both. So every dashboard page ran twice: two React trees with their own
 * state, two of every query and every realtime subscription, two role="main"
 * landmarks carrying the same label, and two h1 elements.
 *
 * Measured on /dashboard/grocery before: 2 list pickers with 1 visible, 2 mains,
 * 2 h1s, and 4 GET /rest/v1/grocery_lists where one instance needs 2.
 *
 * This is the defect US-719 and US-766 describe between the route aliases and
 * the dashboard -- "two different React trees with their own state", a filter
 * set on one not existing on the other. It was sitting between the mobile and
 * desktop shells of a single route the whole time.
 *
 * Checked at BOTH WIDTHS, because the failure is asymmetric: a phone-only check
 * passes a build that mounts the desktop shell twice, and vice versa.
 */
const ROUTES = [
  '/dashboard',
  '/dashboard/grocery',
  '/dashboard/pantry',
  '/dashboard/planner',
  '/dashboard/kids',
  '/dashboard/settings',
];

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  phone: devices['iPhone 12'].viewport,
} as const;

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`${name} width`, () => {
    test.use({ viewport });

    for (const route of ROUTES) {
      test(`${route} mounts one shell`, async ({ page, context }) => {
        await signIn(context);
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        await page.locator('[role="main"]').first().waitFor({ state: 'visible' });
        await page
          .locator('.animate-pulse')
          .first()
          .waitFor({ state: 'detached', timeout: 10_000 })
          .catch(() => {
            // No skeleton here, or it never mounted.
          });
        await page.waitForTimeout(750);

        expect(new URL(page.url()).pathname, `redirected to ${page.url()}`).not.toMatch(/^\/auth/);

        const dom = await page.evaluate(() => ({
          // Counted in the whole document, not inside the first main: a second
          // tree is invisible to any query scoped to the first one, which is
          // how the heading gate missed this.
          mains: document.querySelectorAll('[role="main"]').length,
          h1s: Array.from(document.querySelectorAll('h1')).map((h) =>
            (h.textContent || '').trim().slice(0, 30)
          ),
          skipTargets: document.querySelectorAll('#main-content').length,
        }));

        expect(dom.mains, `${route} has ${dom.mains} main landmarks`).toBe(1);
        expect(dom.h1s, `${route} h1 elements: ${JSON.stringify(dom.h1s)}`).toHaveLength(1);
        // The skip link points at #main-content. The mobile shell used to call
        // its main "main-content-mobile", because two mounted shells cannot
        // share an id -- so on a phone the link had no target at all.
        expect(dom.skipTargets, `${route} has ${dom.skipTargets} #main-content`).toBe(1);
      });
    }
  });
}

test.describe('each shell still brings its own chrome', () => {
  test('desktop gets the sidebar and no bottom nav', async ({ page, context }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await signIn(context);
    await page.goto('/dashboard');
    await page.locator('[role="main"]').first().waitFor({ state: 'visible' });
    await expect(page.locator('nav[aria-label="Primary mobile navigation"]')).toHaveCount(0);
    // A one-shell change that renders the wrong shell would still pass the
    // counts above.
    await expect(page.locator('[data-sidebar]').first()).toBeAttached();
  });

  test('a phone gets the bottom nav and no sidebar', async ({ page, context }) => {
    await page.setViewportSize(VIEWPORTS.phone);
    await signIn(context);
    await page.goto('/dashboard');
    await page.locator('[role="main"]').first().waitFor({ state: 'visible' });
    await expect(page.locator('nav[aria-label="Primary mobile navigation"]')).toHaveCount(1);
    await expect(page.locator('[data-sidebar]')).toHaveCount(0);
  });
});
