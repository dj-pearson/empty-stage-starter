import { test, expect } from '@playwright/test';
import { signIn } from '../helpers/auth';

/**
 * The pantry's food search reads the canonical catalog (US-799 AC2).
 *
 * AddFoodDialog searched the `nutrition` table. It now searches
 * grocery_product_catalog by name_normalized, which is the column the trigram
 * index and US-796's matcher are built on.
 *
 * This is here because a query that names a column the table does not have
 * fails SILENTLY in this app: PostgREST answers an error, the catch logs it,
 * and the dialog shows "no results" -- indistinguishable from a search that
 * genuinely matched nothing. scripts/dev/fake-postgrest.mjs answered [] for
 * every unknown table until this change, so a browser check could not tell
 * `nutrition` from `grocery_product_catalog` either.
 *
 * Two locator traps, both hit while writing this:
 *
 * `[role="dialog"]` picks the cookie consent banner, which is also a dialog and
 * is mounted first -- the same trap documented in tests/responsive/
 * grocery-phone.spec.ts. Scope by accessible name.
 *
 * `getByPlaceholder(/search/i)` matches the pantry PAGE's own "Search pantry
 * items..." box, not the dialog's. The page keeps rendering behind the overlay,
 * so `.first()` picks the wrong one and the dialog's search is never typed
 * into: no request to grocery_product_catalog is made at all, and the test
 * fails for a reason that has nothing to do with the query it means to check.
 */

/** The dialog's own search box. The exact string is AddFoodDialog's. */
const SEARCH_PLACEHOLDER = 'Type at least 2 characters...';

async function openAddFood(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/pantry');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^Add Food$/i }).first().click();

  const dialog = page.getByRole('dialog', { name: /Add New Food/i });
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  return dialog;
}

test.describe('pantry food search', () => {
  test('finds a catalog row and shows the serving as the packet states it', async ({ context, page }) => {
    await signIn(context);

    // Which table was queried, recorded rather than inferred. Without this the
    // test passes on any source that happens to contain "Chicken breast", which
    // is exactly the confusion the story is about.
    const catalogQueries: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/rest/v1/grocery_product_catalog')) {
        catalogQueries.push(request.url());
      }
    });

    const dialog = await openAddFood(page);

    await dialog.getByPlaceholder(SEARCH_PLACEHOLDER).fill('chick');

    // The dialog debounces 300ms and the fixture row is "Chicken breast".
    await expect(dialog.getByText('Chicken breast', { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });

    // serving_size_text, not the parsed grams: what is on the packet.
    await expect(dialog.getByText('6 oz (172g)')).toBeVisible();

    expect(
      catalogQueries.filter((url) => url.includes('name_normalized=ilike')),
      `searches of grocery_product_catalog: ${JSON.stringify(catalogQueries)}`,
    ).not.toEqual([]);
  });

  test('a search that matches nothing is not how a broken query looks', async ({ context, page }) => {
    // The floor under the test above. If the query were broken, both it and
    // this one would show "no results" and only this one would pass -- so the
    // pair is what says the first result means something.
    await signIn(context);
    const dialog = await openAddFood(page);

    await dialog.getByPlaceholder(SEARCH_PLACEHOLDER).fill('zzzznotathing');

    await expect(dialog.getByText('No foods found.')).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText('Chicken breast', { exact: true })).toHaveCount(0);
  });
});
