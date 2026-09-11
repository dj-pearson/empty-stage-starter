import { test, expect } from '@playwright/test';
import { signIn } from '../helpers/auth';

/**
 * US-862: opening a page is not an edit.
 *
 * AccessibilityContext's save effect depends on `preferences`, and three
 * separate things set that during one page load -- the system-preference probe,
 * the localStorage read and the Supabase read. Each one re-ran the effect.
 * Measured on the built app, on every authenticated route, before anything was
 * clicked:
 *
 *   3 x POST /rest/v1/user_accessibility_preferences   (an upsert)
 *
 * The third of those wrote the server's own answer straight back to it. Two
 * things were wrong with that beyond the requests: updated_at was bumped on
 * every page load, so the column recorded when the row was last READ; and
 * writing the merge back makes a load a write, so a stale local value the
 * server did not have was pushed up by whichever tab loaded last -- the
 * opposite of the server-authoritative contract the rest of the app follows
 * (US-341).
 *
 * BOTH HALVES ARE ASSERTED. A gate that only checked "no write on load" is
 * passed by a context that has stopped saving at all, which is a far worse bug
 * than the one being fixed.
 */
const ROUTES = ['/dashboard', '/dashboard/grocery', '/dashboard/pantry', '/dashboard/settings'];

const PREFERENCES_PATH = '/rest/v1/user_accessibility_preferences';

/** Non-GET calls to the preferences row, i.e. the upsert. */
function watchWrites(page: import('@playwright/test').Page): string[] {
  const writes: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === PREFERENCES_PATH && request.method() !== 'GET') {
      writes.push(`${request.method()} ${url.pathname}`);
    }
  });
  return writes;
}

async function settle(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle');
  await page.locator('main, [role="main"]').first().waitFor({ state: 'visible' });
  // Long enough for the localStorage read, the Supabase read and the debounce
  // that follows them -- the window the three writes used to land in.
  await page.waitForTimeout(3000);
}

test.describe('accessibility preferences are written when they change', () => {
  for (const route of ROUTES) {
    test(`${route} writes nothing on load`, async ({ page, context }) => {
      await signIn(context);
      const writes = watchWrites(page);

      await page.goto(route);
      await settle(page);
      expect(new URL(page.url()).pathname, `redirected to ${page.url()}`).not.toMatch(/^\/auth/);

      expect(writes, `${route} wrote the preferences row on a page view:\n${writes.join('\n')}`).toEqual([]);
    });
  }

  test('changing a preference does write it', async ({ page, context }) => {
    await signIn(context);
    const writes = watchWrites(page);

    await page.goto('/dashboard/accessibility-settings');
    await settle(page);

    const switches = page.locator('[role="switch"]');
    // The floor: with no switches found, the click below is a no-op and the
    // assertion after it would be measuring nothing.
    expect(await switches.count(), 'no preference switches on the settings page').toBeGreaterThan(5);

    expect(writes, 'the settings page itself wrote on load').toEqual([]);

    await switches.first().click();
    await page.waitForTimeout(2000);

    expect(writes.length, 'toggling a preference did not save it').toBeGreaterThanOrEqual(1);
  });
});
