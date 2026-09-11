import { test, expect } from '@playwright/test';
import { signIn } from '../helpers/auth';

/**
 * US-864: the list picker does not re-fetch because of its own side effect.
 *
 * GroceryListSelector's effect had `selectedListId` in its dependency array and
 * changed it -- it auto-selects the default list -- so every mount fetched the
 * lists, selected one, and fetched them again because the selection had moved.
 * Measured on the built grocery page: 6 x GET /rest/v1/grocery_lists per load,
 * then 4, and now 2.
 *
 * WHY THE BUDGET IS 2 AND NOT 1. The household resolves after mount, and a
 * household-scoped query returns a different set of lists, so the second fetch
 * is real work -- the prop cannot tell "not resolved yet" from "no household".
 *
 * THE 4 WAS THE DUPLICATE SHELL, and the first version of this file named the
 * cause wrong: it said the PAGE mounted the picker twice. It did not. Dashboard
 * rendered both its shells at once, each with its own <Outlet/>, so the whole
 * routed page mounted twice and every query on it doubled (US-865). Two
 * comboboxes on the page was the symptom; one page was the unit being
 * duplicated.
 */
const MAX_LIST_QUERIES = 2;

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

  test('the page mounts one picker, because it mounts one shell', async ({ page, context }) => {
    await signIn(context);
    await page.goto('/dashboard/grocery');
    await page.waitForLoadState('networkidle');
    await page.locator('[role="main"]').first().waitFor({ state: 'visible' });
    await page.waitForTimeout(2000);

    // Kept as the regression guard for the query budget above: if a second
    // shell ever comes back, this is the assertion that says why the count
    // doubled. tests/authenticated/one-shell.spec.ts covers the shells
    // themselves at both widths.
    expect(await page.locator('[aria-label="Grocery list"]').count()).toBe(1);
  });
});
