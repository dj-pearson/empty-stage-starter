import { test, expect, devices } from '@playwright/test';
import { signIn } from '../helpers/auth';

/**
 * The grocery list at phone width (US-767).
 *
 * This is the screen someone uses standing in an aisle, holding a phone in one
 * hand. It was measured at an iPhone viewport and had 35 controls below the
 * 44px touch floor -- every quantity, edit and delete button at 40px wide, and
 * the check-off control itself at 42 -- plus 7 check-off controls with no
 * accessible name at all, so a screen-reader user could not tell which item
 * they were ticking.
 *
 * THE FIRST RUN OF THIS PROBE FOUND NOTHING, and that is the more useful
 * lesson. scripts/dev/fake-postgrest.mjs answered every table with an empty
 * array, so the page rendered with no rows: no undersized targets, no unnamed
 * controls, no overflow, and a cookie banner as the only heading. It read
 * exactly like a page that passes. The fake backend now serves a household and
 * eight grocery items so a LIST screen is measured as a list. (The authenticated
 * a11y baselines were measured against those same empty screens, so grocery's
 * "3" is 3 violations on an empty list.)
 *
 * Requires a build against the fake backend:
 *   node scripts/dev/fake-postgrest.mjs &
 *   VITE_SUPABASE_URL=http://127.0.0.1:54999 VITE_SUPABASE_ANON_KEY=<jwt-shaped> \
 *     npx vite build --outDir dist-e2e
 *   E2E_TARGET=dist E2E_DIST=dist-e2e npx playwright test tests/responsive/
 */

/** Apple's HIG and Android's Material both land on 44-48px. */
const TOUCH_TARGET_PX = 44;

test.use({ viewport: devices['iPhone 12'].viewport });

test.describe('Grocery list at phone width', () => {
  test.beforeEach(async ({ context, page }) => {
    await signIn(context);
    await page.goto('/dashboard/grocery');
    await page.waitForLoadState('networkidle');
    await page
      .locator('.animate-pulse')
      .first()
      .waitFor({ state: 'detached', timeout: 10_000 })
      .catch(() => {
        // No skeleton, or it never mounted. Either is fine.
      });
    await page.waitForTimeout(750);
    expect(new URL(page.url()).pathname, `redirected to ${page.url()}`).not.toMatch(/^\/auth/);

    // US-767: the aisles fold at this width and only the first is open, so
    // every check below would otherwise measure one aisle instead of eight.
    // Opening them all is the stronger assertion anyway -- a control that is
    // 40px wide inside a folded aisle is still 40px wide when the shopper
    // opens it. The folding itself is asserted in its own describe below.
    const folded = page.locator('button[aria-controls^="grocery-group-"][aria-expanded="false"]');
    for (let guard = 0; guard < 20 && (await folded.count()) > 0; guard++) {
      await folded.first().click();
    }
  });

  test('the fixture actually rendered a list', async ({ page }) => {
    // Assert the setup before believing anything below it. An empty list passes
    // every other check in this file, which is how the first version of this
    // spec reported a clean page for a page with nothing on it.
    // `:visible` matters: this route renders a hidden duplicate tree (a mobile
    // shell and a desktop one), so half the checkboxes are 0x0. An unscoped
    // locator picks those, and a 0x0 element has an empty accessible name and
    // cannot be clicked -- which reads as a naming bug and a broken control
    // rather than as a query that matched the wrong half of the page.
    const checkboxes = page.locator('[role="checkbox"]:visible, input[type="checkbox"]:visible');
    expect(await checkboxes.count(), 'no check-off controls: the list is empty').toBeGreaterThan(4);
    // Through the check-off controls rather than the text: the item name
    // appears in both the visible tree and the hidden one, so a text locator
    // resolves to nine elements and .first() picks a hidden copy.
    const names = await checkboxes.evaluateAll((els) =>
      els.map((el) => el.getAttribute('aria-label') ?? '')
    );
    expect(names.join(' | ')).toContain('Whole milk');
    expect(names.join(' | ')).toContain('Frozen peas');
  });

  test('every control meets the 44px touch target', async ({ page }) => {
    const undersized = await page.evaluate((floor) => {
      const bad: string[] = [];
      const selector = 'button, a[role="button"], input[type="checkbox"], [role="checkbox"]';
      for (const el of Array.from(document.querySelectorAll(selector))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue; // not rendered
        if (r.width < floor || r.height < floor) {
          const label = (el.textContent || '').trim() || el.getAttribute('aria-label') || '(unnamed)';
          bad.push(`${label.slice(0, 30)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
      }
      return bad;
    }, TOUCH_TARGET_PX);

    expect(undersized, `${undersized.length} control(s) below ${TOUCH_TARGET_PX}px`).toEqual([]);
  });

  test('every check-off control says which item it checks off', async ({ page }) => {
    const boxes = page.locator('[role="checkbox"]:visible, input[type="checkbox"]:visible');
    const count = await boxes.count();
    expect(count).toBeGreaterThan(4);

    for (let i = 0; i < count; i++) {
      // "Checkbox" tells a screen-reader user nothing about which of eight
      // items they are about to tick off in a supermarket.
      await expect(boxes.nth(i)).toHaveAccessibleName(/.+/);
    }
  });

  test('checking an item off does not make the page pan sideways', async ({ page }) => {
    const first = page.locator('[role="checkbox"]:visible, input[type="checkbox"]:visible').first();
    await first.click();
    await page.waitForTimeout(500);

    const panned = await page.evaluate(() => {
      const before = window.scrollX;
      window.scrollTo(9999, window.scrollY);
      const after = window.scrollX;
      window.scrollTo(before, window.scrollY);
      return after;
    });

    expect(panned, `the list pans sideways to x=${panned}`).toBe(0);
  });
});

/**
 * US-767 AC2: the By Aisle grouping folds at phone width.
 *
 * Eleven aisle headers between a shopper and the aisle they are standing in is
 * eleven scrolls with one hand over a trolley. One group is open and the rest
 * are a tap away.
 *
 * Kept as its own describe because it asserts across TWO viewports: the whole
 * point is that a desktop is unchanged, and a collapsing control that also
 * appeared there would be a control in the way.
 */
test.describe('Grocery aisles fold at phone width', () => {
  const GROUP_BUTTON = 'button[aria-controls^="grocery-group-"]';

  test.beforeEach(async ({ context, page }) => {
    await signIn(context);
    await page.goto('/dashboard/grocery');
    await page.waitForLoadState('networkidle');
  });

  test('opens the first aisle and folds the rest', async ({ page }) => {
    const headers = page.locator(GROUP_BUTTON);
    // The fixture serves six aisles. One group would prove nothing, which is
    // what this measured before the fake backend carried an `aisle` at all.
    await expect(headers).toHaveCount(6);

    await expect(headers.first()).toHaveAttribute('aria-expanded', 'true');
    for (let i = 1; i < 6; i++) {
      await expect(headers.nth(i)).toHaveAttribute('aria-expanded', 'false');
    }
  });

  test('every header controls a panel that exists', async ({ page }) => {
    // US-778 fixed exactly this bug on this page: two toggles advertised
    // aria-controls for panel ids Radix had never rendered, and axe rates a
    // dangling aria-controls critical. So the panel stays mounted and is
    // hidden, rather than being removed.
    const dangling = await page.evaluate((sel) => {
      return [...document.querySelectorAll(sel)]
        .map((h) => h.getAttribute('aria-controls') || '')
        .filter((id) => !document.getElementById(id));
    }, GROUP_BUTTON);

    expect(dangling, `aria-controls pointing at nothing: ${dangling.join(', ')}`).toEqual([]);
  });

  test('a folded aisle opens on a tap, and its items appear', async ({ page }) => {
    const second = page.locator(GROUP_BUTTON).nth(1);
    const panelId = await second.getAttribute('aria-controls');

    await expect(page.locator(`#${panelId}`)).toBeHidden();
    await second.click();
    await expect(second).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(`#${panelId}`)).toBeVisible();
  });

  test('the header itself meets the touch floor', async ({ page }) => {
    const box = await page.locator(GROUP_BUTTON).first().boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
  });

  test('a desktop gets no collapsing control and nothing hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(300);

    await expect(page.locator(GROUP_BUTTON)).toHaveCount(0);
    const hidden = await page.evaluate(
      () => [...document.querySelectorAll('[id^="grocery-group-"]')].filter((p) => (p as HTMLElement).hidden).length,
    );
    expect(hidden).toBe(0);
  });
});
