import { test, expect, devices } from '@playwright/test';
import { signIn } from '../helpers/auth';

/**
 * Account settings at phone width (US-768).
 *
 * The five tabs were a `grid-cols-5` that fitted a phone by hiding every label
 * below 640px (`hidden sm:inline`), leaving five buttons whose only content was
 * an aria-hidden icon. So each tab had no accessible name at all on a phone --
 * a WCAG 4.1.2 failure -- and the authenticated a11y scan never caught it,
 * because that scan runs at desktop width where the labels are present. A gate
 * that only ever looks at one viewport is not looking at the phone.
 *
 * The fix is a scrollable strip that keeps its labels. This test runs at an
 * iPhone viewport because that is the only width where any of it is true.
 *
 * Requires a build against the fake backend:
 *   node scripts/dev/fake-postgrest.mjs &
 *   VITE_SUPABASE_URL=http://127.0.0.1:54999 VITE_SUPABASE_ANON_KEY=<jwt-shaped> \
 *     npx vite build --outDir dist-e2e
 *   E2E_TARGET=dist E2E_DIST=dist-e2e npx playwright test tests/responsive/
 */

const TABS = ['Profile', 'Subscription', 'Notifications', 'Security', 'Accessibility'] as const;

// Viewport ONLY, not the whole device descriptor. Spreading
// devices['iPhone 12'] replaces the project's `use`, including the
// executablePath that playwright.config.ts resolves for this image -- every
// test then dies at browser launch, before an assertion runs, which looks
// nothing like a layout failure.
test.use({ viewport: devices['iPhone 12'].viewport });

test.describe('Account settings at phone width', () => {
  test.beforeEach(async ({ context, page }) => {
    await signIn(context);
    await page.goto('/dashboard/settings');
    await page.waitForLoadState('networkidle');
    // Anchor on the tablist, not on `main`. This route renders two <main>
    // elements and the first is display:none, so the copied-from-elsewhere
    // `main` wait times out after 30s without ever reaching an assertion.
    await page.getByRole('tablist').first().waitFor({ state: 'visible' });
    await page
      .locator('.animate-pulse')
      .first()
      .waitFor({ state: 'detached', timeout: 10_000 })
      .catch(() => {
        // No skeleton on this page, or it never mounted. Either is fine.
      });
    expect(new URL(page.url()).pathname, `redirected to ${page.url()}`).not.toMatch(/^\/auth/);
  });

  test('every tab has an accessible name', async ({ page }) => {
    // The defect this story exists to fix. An icon-only tab is not something
    // anybody using a screen reader can choose between.
    //
    // toHaveAccessibleName, NOT textContent. The first version of this test
    // used getByRole('tab', { name }) and allTextContents(), both of which
    // read text through `display: none` -- so it passed against the broken
    // build, where the label span was computed display:none at 390px and the
    // accessible name was empty. A test for a hidden-label bug that reads
    // hidden labels measures nothing.
    for (const label of TABS) {
      const tab = page.getByRole('tab').filter({ hasText: label }).first();
      await expect(tab).toHaveAccessibleName(new RegExp(label, 'i'));
      await expect(tab.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('the page never scrolls horizontally, on any tab', async ({ page }) => {
    for (const label of TABS) {
      await page.getByRole('tab').filter({ hasText: label }).first().click();
      await page.waitForTimeout(250);

      // Ask the BROWSER to pan, rather than comparing scrollWidth to
      // clientWidth. On this page documentElement.scrollWidth reads 400 against
      // a 390 viewport even though no unclipped element exceeds the viewport
      // and nothing can actually be panned to -- the tab strip is a horizontal
      // scroller by design and Chromium folds some of its content into that
      // number. Asserting the metric would have failed a page that is correct,
      // then been "fixed" by widening a tolerance until it measured nothing.
      // What a reader cares about is whether the page moves sideways.
      const scrolled = await page.evaluate(() => {
        const before = window.scrollX;
        window.scrollTo(9999, window.scrollY);
        const after = window.scrollX;
        window.scrollTo(before, window.scrollY);
        return after;
      });

      expect(scrolled, `${label} tab pans sideways to x=${scrolled}`).toBe(0);
    }
  });

  test('every visible control fits inside the viewport', async ({ page }) => {
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();

    for (const label of TABS) {
      await page.getByRole('tab').filter({ hasText: label }).first().click();
      await page.waitForTimeout(250);

      const overflowing = await page.evaluate((width) => {
        const bad: string[] = [];
        for (const el of Array.from(document.querySelectorAll('button, a[role="button"]'))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue; // not rendered
          // Inside a deliberately scrollable strip, sitting off-screen is the
          // point; only complain about controls the PAGE pushes out.
          if (el.closest('[role="tablist"], [data-radix-scroll-area-viewport]')) continue;
          if (r.right > width + 1) {
            bad.push(`${el.textContent?.trim().slice(0, 40)} (right=${Math.round(r.right)})`);
          }
        }
        return bad;
      }, viewport!.width);

      expect(overflowing, `${label} tab has controls past the right edge`).toEqual([]);
    }
  });
});
