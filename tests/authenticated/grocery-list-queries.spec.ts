import { test, expect } from '@playwright/test';
import { signIn } from '../helpers/auth';

/**
 * US-864: the list picker does not re-fetch because of its own side effect.
 *
 * GroceryListSelector's effect had `selectedListId` in its dependency array and
 * changed it -- it auto-selects the default list -- so every mount fetched the
 * lists, selected one, and fetched them again because the selection had moved.
 * Measured on the built grocery page: 6 x GET /rest/v1/grocery_lists per load.
 * After: 4.
 *
 * WHY THE BUDGET IS 4 AND NOT 1. Two things account for the rest, and only one
 * of them is waste.
 *
 *   - The household resolves after mount, and a household-scoped query returns
 *     a different set of lists, so the second fetch per instance is real work.
 *     The prop cannot tell "not resolved yet" from "no household".
 *   - The page mounts the selector TWICE -- a mobile tree and a desktop one,
 *     with one of them hidden. Measured: 2 comboboxes, 1 visible. That doubles
 *     every query and every realtime channel on this page and is US-865.
 *
 * So 4 = 2 instances x 2 fetches. When the duplicate tree goes, this drops to 2.
 */
const MAX_LIST_QUERIES = 4;

test.describe('grocery list picker', () => {
  test(`loads its lists in at most ${MAX_LIST_QUERIES} queries`, async ({ page, context }) => {
    await signIn(context);

    const queries: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/rest/v1/grocery_lists') {
        queries.push(request.method());
      }
    });

    await page.goto('/dashboard/grocery');
    await page.waitForLoadState('networkidle');
    await page.locator('main, [role="main"]').first().waitFor({ state: 'visible' });
    await page.waitForTimeout(3500);

    expect(new URL(page.url()).pathname, `redirected to ${page.url()}`).not.toMatch(/^\/auth/);

    // The floor: a picker that never rendered makes no queries and would
    // otherwise pass a budget.
    const picker = page.locator('[role="combobox"]:visible').first();
    await expect(picker).toContainText(/\w/);

    expect(
      queries.length,
      `${queries.length} grocery_lists queries; the picker is re-fetching on its own selection again`
    ).toBeLessThanOrEqual(MAX_LIST_QUERIES);
  });

  test('the page mounts the picker twice, which is US-865 and not fixed here', async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.goto('/dashboard/grocery');
    await page.waitForLoadState('networkidle');
    await page.locator('main, [role="main"]').first().waitFor({ state: 'visible' });
    await page.waitForTimeout(2000);

    const total = await page.locator('[role="combobox"]').count();
    const visible = await page.locator('[role="combobox"]:visible').count();

    // Recorded rather than asserted away: when the duplicate tree goes this
    // fails, and MAX_LIST_QUERIES above comes down with it.
    expect(visible).toBe(1);
    expect(total, 'the duplicate tree is gone -- lower MAX_LIST_QUERIES to 2').toBe(2);
  });
});
