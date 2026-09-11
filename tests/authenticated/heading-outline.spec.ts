import { test, expect } from '@playwright/test';
import { signIn } from '../helpers/auth';

/**
 * US-860: the heading outline of the signed-in app.
 *
 * US-849 measured this across the 29 prerendered public pages and fixed five.
 * Nothing had ever looked at the eighteen pages behind the login, and they were
 * worse: /dashboard rendered TWO h1 elements and opened its outline with an h3
 * -- the subscription banner's plan name, above the name of the page it sits on
 * -- and three routes had no h1 at all because a locked feature replaced the
 * whole page body with an h2.
 *
 * Jumping between headings is how many screen-reader users move through a page.
 * A second h1 means the page is named twice and differently; no h1 means it is
 * not named at all.
 *
 * TWO ASSERTIONS OF DIFFERENT STRENGTH, on purpose.
 *
 * The h1 count is exact and applies everywhere -- it is true today and there is
 * no reason to let it stop being true.
 *
 * The skipped levels are a per-route ratchet. Twelve routes jump h1 -> h3, and
 * nearly all of them for the same reason: shadcn's CardTitle renders an h3 and
 * src/components/ui/ is out of bounds per CLAUDE.md, so the level has to be
 * supplied from page code, one page at a time. Failing all twelve on day one
 * would get this file deleted rather than the pages fixed. The recorded number
 * may only go DOWN.
 *
 * Requires a build against the fake backend; see tests/authenticated/no-route-crash.spec.ts.
 */

/**
 * Skipped-level count per route, measured 2026-09-11 against the fixtures in
 * scripts/dev/fake-postgrest.mjs. MAY ONLY DECREASE. A route missing from this
 * map must have none.
 */
const KNOWN_SKIPS: Record<string, number> = {
  '/dashboard/planner': 1,
  '/dashboard/pantry': 1,
  '/dashboard/recipes': 1,
  '/dashboard/kids': 1,
  '/dashboard/settings': 1,
  '/dashboard/insights': 1,
  '/dashboard/analytics': 1,
  '/dashboard/food-tracker': 1,
  '/dashboard/billing': 1,
  '/dashboard/household': 1,
  '/dashboard/accessibility-settings': 1,
  '/dashboard/progress': 0,
  '/dashboard/grocery': 0,
  '/dashboard': 0,
};

const ROUTES = Object.keys(KNOWN_SKIPS);

async function settle(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle');
  await page.locator('main, [role="main"]').first().waitFor({ state: 'visible' });
  await page
    .locator('.animate-pulse')
    .first()
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => {
      // No skeleton here, or it never mounted.
    });
  await page.waitForTimeout(750);
}

/** Headings inside the page's own main region, in document order. */
async function outline(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main, [role="main"]') ?? document.body;
    const all = Array.from(main.querySelectorAll('h1,h2,h3,h4,h5,h6')) as HTMLElement[];
    // offsetParent is null for display:none, which is not in the accessibility
    // tree either. sr-only text IS, and is positioned out of flow, so it has to
    // be kept explicitly or every sr-only heading reads as absent.
    const rendered = all.filter((h) => h.offsetParent !== null || h.className.includes('sr-only'));
    return rendered.map((h) => ({
      level: Number(h.tagName[1]),
      text: (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
    }));
  });
}

test.describe('signed-in heading outline', () => {
  test('the route list covers the navigation', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(12);
    expect(ROUTES).toContain('/dashboard');
  });

  for (const route of ROUTES) {
    test(`${route} has exactly one h1`, async ({ page, context }) => {
      await signIn(context);
      await page.goto(route);
      await settle(page);
      expect(new URL(page.url()).pathname, `redirected to ${page.url()}`).not.toMatch(/^\/auth/);

      const headings = await outline(page);
      const h1s = headings.filter((h) => h.level === 1);
      expect(
        h1s.length,
        `${route} h1 elements: ${JSON.stringify(h1s.map((h) => h.text))}`
      ).toBe(1);

      // And it comes first: a heading above the page's own heading puts a
      // reader inside a section before they have been told where they are.
      expect(headings[0]?.level, `${route} opens with h${headings[0]?.level} "${headings[0]?.text}"`).toBe(1);
    });

    test(`${route} skips no more heading levels than recorded`, async ({ page, context }) => {
      await signIn(context);
      await page.goto(route);
      await settle(page);

      const headings = await outline(page);
      const jumps: string[] = [];
      for (let i = 1; i < headings.length; i += 1) {
        if (headings[i].level > headings[i - 1].level + 1) {
          jumps.push(`h${headings[i - 1].level} -> h${headings[i].level} at "${headings[i].text}"`);
        }
      }
      // Distinct jumps, not every occurrence: a list of twenty food cards all
      // sitting at h3 under an h1 is one defect, not twenty.
      const distinct = [...new Set(jumps.map((j) => j.slice(0, j.indexOf(' at '))))];
      expect(
        distinct.length,
        `${route} skips:\n${jumps.join('\n')}`
      ).toBeLessThanOrEqual(KNOWN_SKIPS[route]);
    });
  }
});
