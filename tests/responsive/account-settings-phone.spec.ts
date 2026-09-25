import { test, expect, devices } from '@playwright/test';
import { signIn } from '../helpers/auth';

/**
 * The Settings hub at phone width.
 *
 * At 390px the hub is a grouped list: a Quick row, then one link per section.
 * Each section opens as its own history entry, so the phone's Back gesture
 * returns to the list. The five-tab strip this replaced (US-768) shipped
 * icon-only tabs with no accessible name at this width; the rows below are
 * held to the same standard, read with toHaveAccessibleName rather than
 * textContent, which reads through display:none and so passed the broken build.
 *
 * Requires a build against the fake backend:
 *   node scripts/dev/fake-postgrest.mjs &
 *   VITE_SUPABASE_URL=http://127.0.0.1:54999 VITE_SUPABASE_ANON_KEY=<jwt-shaped> \
 *     npx vite build --outDir dist-e2e
 *   E2E_TARGET=dist E2E_DIST=dist-e2e npx playwright test tests/responsive/
 */

/** Mirrors SETTINGS_SECTION_KEYS in src/lib/settingsSections.ts. */
const SECTIONS = ['profile', 'signin', 'privacy', 'notifications', 'planner', 'accessibility', 'plan', 'data'] as const;

// Viewport ONLY, not the whole device descriptor. Spreading
// devices['iPhone 12'] replaces the project's `use`, including the
// executablePath that playwright.config.ts resolves for this image -- every
// test then dies at browser launch, before an assertion runs.
test.use({ viewport: devices['iPhone 12'].viewport });

async function settle(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle');
  await page.locator('main, [role="main"]').first().waitFor({ state: 'visible' });
  await page
    .locator('.animate-pulse')
    .first()
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => {
      // No skeleton on this page, or it never mounted. Either is fine.
    });
  await page.waitForTimeout(250);
  expect(new URL(page.url()).pathname, `redirected to ${page.url()}`).not.toMatch(/^\/auth/);
}

/**
 * Ask the BROWSER to pan, rather than comparing scrollWidth to clientWidth:
 * Chromium folds content of deliberately scrollable strips into scrollWidth
 * even when nothing can actually be panned to.
 */
async function pansSideways(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const before = window.scrollX;
    window.scrollTo(9999, window.scrollY);
    const after = window.scrollX;
    window.scrollTo(before, window.scrollY);
    return after;
  });
}

test.describe('Settings hub at phone width', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test('the index lists every section as a named link', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await settle(page);

    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    for (const key of SECTIONS) {
      const row = page.locator(`a[data-settings-row="${key}"]`);
      await expect(row).toBeVisible();
      await expect(row).toHaveAttribute('href', `/dashboard/settings?section=${key}`);
      await expect(row).toHaveAccessibleName(/\S/);
      const box = await row.boundingBox();
      expect(box?.height ?? 0, `${key} row is under 44px tall`).toBeGreaterThanOrEqual(44);
    }
  });

  test('neither the index nor any section pans sideways', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await settle(page);
    expect(await pansSideways(page), 'index pans sideways').toBe(0);

    for (const key of SECTIONS) {
      await page.goto(`/dashboard/settings?section=${key}`);
      await settle(page);
      await expect(page.locator(`#settings-${key}`)).toBeVisible();
      const scrolled = await pansSideways(page);
      expect(scrolled, `?section=${key} pans sideways to x=${scrolled}`).toBe(0);
    }
  });

  test('every visible control in a section fits inside the viewport', async ({ page }) => {
    const width = page.viewportSize()!.width;
    for (const key of SECTIONS) {
      await page.goto(`/dashboard/settings?section=${key}`);
      await settle(page);
      const overflowing = await page.evaluate((w) => {
        const bad: string[] = [];
        for (const el of Array.from(document.querySelectorAll('button, a, [role="switch"]'))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          if (el.closest('[data-radix-scroll-area-viewport]')) continue;
          if (r.right > w + 1) bad.push(`${el.textContent?.trim().slice(0, 40)} (right=${Math.round(r.right)})`);
        }
        return bad;
      }, width);
      expect(overflowing, `?section=${key} has controls past the right edge`).toEqual([]);
    }
  });

  test('browser Back returns from a section to the index', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await settle(page);

    await page.locator('a[data-settings-row="accessibility"]').click();
    await expect(page).toHaveURL(/\?section=accessibility$/);
    await expect(page.locator('#settings-accessibility')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
    await expect(page.locator('a[data-settings-row="accessibility"]')).toBeVisible();
  });

  test('the in-page Back link does the same, without stacking history', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await settle(page);

    await page.locator('a[data-settings-row="planner"]').click();
    await expect(page.locator('#settings-planner')).toBeVisible();
    await page.getByRole('link', { name: 'All settings' }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
    // Focus goes back to the row the reader left from.
    await expect(page.locator('a[data-settings-row="planner"]')).toBeFocused();
  });

  test('an unknown section lands on the index', async ({ page }) => {
    await page.goto('/dashboard/settings?section=subscription');
    await settle(page);
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
    await expect(page.locator('a[data-settings-row="plan"]')).toBeVisible();
  });
});
