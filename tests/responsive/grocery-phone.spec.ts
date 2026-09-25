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
        let r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue; // not rendered
        // A stretched button: its ::after is absolutely positioned over the
        // nearest positioned ancestor, and that box is what a finger hits.
        // GroceryRow's item name is one (a 24px line of text whose ::after
        // covers the 44px row body). getBoundingClientRect never includes a
        // pseudo-element, so measure the box the ::after fills instead.
        const after = getComputedStyle(el, '::after');
        const host = (el as HTMLElement).offsetParent;
        if (after.position === 'absolute' && after.content !== 'none' && host) {
          r = host.getBoundingClientRect();
        }
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

/**
 * US-767 AC1: dialogs are bottom sheets at phone width.
 *
 * A centred modal on a 390px screen is the wrong shape twice over -- its
 * controls float in the middle of the display, away from a thumb wrapped
 * around the phone, and its close button sits at the top right, the furthest
 * point from that thumb. src/components/ResponsiveDialog.tsx picks a Sheet
 * below `md:` and a Dialog above it; both are thin wrappers over the same
 * Radix primitive, so nothing in src/components/ui/ changed.
 */
test.describe('Grocery dialogs are bottom sheets at phone width', () => {
  test.beforeEach(async ({ context, page }) => {
    await signIn(context);
    await page.goto('/dashboard/grocery');
    await page.waitForLoadState('networkidle');
  });

  /**
   * By accessible name, not by `[role="dialog"]`. The cookie consent banner is
   * a legitimate non-modal dialog (role="dialog" aria-modal="false") pinned to
   * the bottom edge at full width -- so an unnamed locator picks IT, and at
   * phone width that happens to satisfy every "anchored to the bottom, full
   * width" assertion below while testing nothing.
   */
  async function openAddItem(page: import('@playwright/test').Page) {
    // Add is a menu now (item, recipe, receipt); the full form is its first entry.
    await page.getByRole('button', { name: /^Add$/ }).first().click();
    await page.getByRole('menuitem', { name: /Add an item/i }).click();
    const panel = page.getByRole("dialog", { name: /Add Grocery Item/i });
    await expect(panel).toBeVisible();
    return panel;
  }

  test('the add-item panel is anchored to the bottom edge, full width', async ({ page }) => {
    const panel = await openAddItem(page);
    const box = (await panel.boundingBox())!;
    const viewport = page.viewportSize()!;

    // Anchored to the bottom: its lower edge is the viewport's.
    expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(viewport.height - 2);
    // Full width, rather than a centred card with a gutter either side.
    expect(Math.round(box.width)).toBe(viewport.width);
    // And it does not swallow the whole screen.
    expect(box.height).toBeLessThan(viewport.height);
  });

  test('opening it does not make the page pan sideways', async ({ page }) => {
    await openAddItem(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `the sheet overflows by ${overflow}px`).toBeLessThanOrEqual(0);
  });

  test('a desktop still gets a centred dialog', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(300);
    const panel = await openAddItem(page);
    const box = (await panel.boundingBox())!;

    // Centred with a gutter, not edge to edge.
    expect(box.width).toBeLessThan(1280);
    expect(box.y).toBeGreaterThan(0);
    expect(Math.round(box.y + box.height)).toBeLessThan(900);
  });
});

/**
 * US-767 AC1: the list picker and the add bar stay put while the list scrolls.
 *
 * Standing in the frozen aisle with the list scrolled down, both the control
 * that says WHICH list you are on and the button that adds the thing you just
 * remembered were off the top of the screen. Getting either back was a scroll
 * up and a scroll back, one-handed, over a trolley.
 *
 * The first version of this stuck the bar at `top-0` and every assertion about
 * it passed -- it WAS at y=0 and it WAS on screen by the DOM's reckoning. A
 * screenshot showed it parked underneath Dashboard's fixed mobile <nav>, which
 * is z-50 and, at this viewport, 97px tall rather than the 56 the shell
 * reserves for it. Hence the offset test below: "stuck at the top" has to mean
 * "stuck below the thing that is already there".
 */
test.describe('The grocery list picker and add bar stay put while scrolling', () => {
  const PICKER = '[aria-label="Grocery list"]';

  test.beforeEach(async ({ context, page }) => {
    await signIn(context);
    await page.goto('/dashboard/grocery');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(750);
  });

  /** Far enough that both controls would be well off-screen without sticky. */
  async function scrollDown(page: import('@playwright/test').Page) {
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.scrollY), 'the page did not scroll').toBeGreaterThan(300);
  }

  test('the picker is still on screen after scrolling the list', async ({ page }) => {
    const before = (await page.locator(PICKER).boundingBox())!;
    expect(before.y).toBeGreaterThan(100);
    await scrollDown(page);

    const after = (await page.locator(PICKER).boundingBox())!;
    // Without position:sticky this would be a large negative number.
    expect(after.y).toBeGreaterThan(0);
    expect(after.y).toBeLessThan(before.y);
  });

  test('Add is still on screen after scrolling the list', async ({ page }) => {
    await scrollDown(page);
    const add = page.getByRole('button', { name: /^Add$/ }).first();
    const box = (await add.boundingBox())!;
    const viewport = page.viewportSize()!;

    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    // And it still opens the sheet from where it is stuck.
    await add.click();
    await page.getByRole('menuitem', { name: /Add an item/i }).click();
    await expect(page.getByRole('dialog', { name: /Add Grocery Item/i })).toBeVisible();
  });

  test('the stuck bar sits below the mobile header, not behind it', async ({ page }) => {
    await scrollDown(page);
    const gap = await page.evaluate((sel) => {
      const picker = document.querySelector(sel)!;
      let bar = picker.parentElement as HTMLElement;
      while (bar && getComputedStyle(bar).position !== 'sticky') bar = bar.parentElement as HTMLElement;
      const nav = document.querySelector('header:has(~ main#main-content)')!;
      return Math.round(bar.getBoundingClientRect().top - nav.getBoundingClientRect().bottom);
    }, PICKER);

    // This is what pins the offset to something real. A `top-0` bar reports
    // gap = -97 here and passes every other test in this block.
    //
    // -1 rather than 0 is the nav's 1px bottom border: the bar sticks at
    // top-14, the same 56px the shell reserves with `main`'s pt-14, and the
    // nav draws its border into the first pixel of that. `main`'s own content
    // sits under the same pixel. The nav is z-50 and the bar z-30, so the
    // border stays visible.
    expect(gap, `the sticky bar is ${gap}px from the header's bottom edge`).toBeGreaterThanOrEqual(-1);
    expect(gap).toBeLessThanOrEqual(4);
  });

  test('the bar does not eat the screen', async ({ page }) => {
    await scrollDown(page);
    const share = await page.evaluate((sel) => {
      const picker = document.querySelector(sel)!;
      let bar = picker.parentElement as HTMLElement;
      while (bar && getComputedStyle(bar).position !== 'sticky') bar = bar.parentElement as HTMLElement;
      const nav = document.querySelector('header:has(~ main#main-content)')!;
      return (bar.getBoundingClientRect().height + nav.getBoundingClientRect().height) / window.innerHeight;
    }, PICKER);

    // The bar was two rows (picker, then a full-width Add Item), 120px pinned:
    // 33% of a 664px screen with the header. It is one row now, picker + Add +
    // overflow, about 56px. The ceiling is here so that a second row added to
    // the bar later fails rather than creeps.
    expect(share, `header plus sticky bar is ${Math.round(share * 100)}% of the viewport`).toBeLessThan(0.26);
  });

  test('scrolling with the bar stuck still does not pan the page sideways', async ({ page }) => {
    await scrollDown(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    // The bar bleeds -mx-4 to span the gutter, and the picker's own row is
    // 352px of content in a 270px box: without min-w-0 it pushed the page 38px
    // wide, which is a sideways pan on every screen of the list.
    expect(overflow, `the page pans sideways by ${overflow}px`).toBeLessThanOrEqual(0);
  });

  test('a desktop gets no sticky bar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(300);
    const position = await page.evaluate((sel) => {
      const picker = document.querySelector(sel)!;
      let el = picker.parentElement as HTMLElement;
      while (el && el.tagName !== 'MAIN' && el.tagName !== 'BODY') {
        if (getComputedStyle(el).position === 'sticky') return 'sticky';
        el = el.parentElement as HTMLElement;
      }
      return 'static';
    }, PICKER);

    expect(position, 'the picker is pinned on a screen with room to spare').toBe('static');
  });

  test('the mobile header is still the only thing above it', async ({ page }) => {
    // Guards the assumption the offset is built on: one fixed bar at the top.
    const fixedAtTop = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('*'))
        .filter((el) => {
          const cs = getComputedStyle(el as HTMLElement);
          const r = el.getBoundingClientRect();
          return cs.position === 'fixed' && r.height > 0 && r.top <= 0 && r.bottom > 0;
        })
        .map((el) => el.getAttribute('aria-label') ?? el.tagName);
    });

    // The shell's header is a plain <header> (no links, so not a nav) and
    // carries no label, so it reads back as its tag.
    expect(fixedAtTop).toEqual(['HEADER']);
  });
});

/**
 * The phone budget: the list itself has to start on the first screen.
 *
 * The page used to stack a header, a subtitle naming a kid, a two-row sticky
 * bar, a progress block and a row of four quick-action buttons above the
 * first item, and at 390x664 the first checkbox sat below the fold. One
 * toolbar row, the progress bar on its bottom edge and the quick actions in
 * the Add menu is what brings it up.
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

/** Serve `count` unchecked rows across six aisles instead of the fixture's eight. */
async function seedGroceryItems(page: import('@playwright/test').Page, count: number) {
  const aisles = ['Produce', 'Dairy', 'Meat & Deli', 'Frozen Vegetables', 'Rice & Grains', 'Condiments & Sauces'];
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `dddddddd-0000-4000-8000-${String(i).padStart(12, '0')}`,
    name: `Seeded item ${i + 1}`,
    category: 'snack',
    aisle: aisles[i % aisles.length],
    quantity: 1,
    unit: 'count',
    checked: false,
    created_at: `2026-09-01T00:00:${String(i % 60).padStart(2, '0')}.000Z`,
  }));
  await page.route('**/rest/v1/grocery_items**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS_HEADERS });
    if (route.request().method() !== 'GET') return route.fulfill({ status: 204, headers: CORS_HEADERS });
    return route.fulfill({ status: 200, headers: CORS_HEADERS, contentType: 'application/json', body: JSON.stringify(rows) });
  });
}

const VISIBLE_CHECKBOX = '[role="checkbox"]:visible, input[type="checkbox"]:visible';

test.describe('Grocery list fits the first phone screen', () => {
  test.use({ viewport: { width: 390, height: 664 } });

  test('with five items, the first checkbox is fully on screen', async ({ context, page }) => {
    await signIn(context);
    await seedGroceryItems(page, 5);
    await page.goto('/dashboard/grocery');
    await page.waitForLoadState('networkidle');

    const first = page.locator(VISIBLE_CHECKBOX).first();
    await expect(first).toBeVisible();
    const box = (await first.boundingBox())!;
    expect(box.y, 'the first checkbox starts above the top edge').toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, `the first checkbox ends at ${Math.round(box.y + box.height)}px`).toBeLessThanOrEqual(664);
  });

  test('the item name gets at least 150px of the row', async ({ context, page }) => {
    await signIn(context);
    await page.goto('/dashboard/grocery');
    await page.waitForLoadState('networkidle');

    // Bananas, not Whole milk: on a phone only the first aisle starts open,
    // and Produce is first.
    const name = page.getByRole('button', { name: 'Bananas', exact: true }).first();
    const box = (await name.boundingBox())!;
    expect(box.width, `the name box is ${Math.round(box.width)}px wide`).toBeGreaterThanOrEqual(150);
  });

  test('the checkout bar does not cover the last row at the bottom of the page', async ({ context, page }) => {
    await signIn(context);
    await page.goto('/dashboard/grocery');
    await page.waitForLoadState('networkidle');

    // Something has to be bought for the bar to show.
    await page.locator(VISIBLE_CHECKBOX).first().click();
    const bar = page.getByTestId('grocery-checkout-bar');
    await expect(bar).toBeVisible();

    // Open every aisle, then scroll to the very bottom.
    const folded = page.locator('button[aria-controls^="grocery-group-"][aria-expanded="false"]');
    for (let guard = 0; guard < 20 && (await folded.count()) > 0; guard++) await folded.first().click();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(400);

    const lastRow = page.locator('[id^="grocery-group-"]:visible [data-checked]').last();
    const rowBox = (await lastRow.boundingBox())!;
    const barBox = (await bar.boundingBox())!;
    expect(
      rowBox.y + rowBox.height,
      `the last row ends at ${Math.round(rowBox.y + rowBox.height)}px, under the bar at ${Math.round(barBox.y)}px`,
    ).toBeLessThanOrEqual(barBox.y + 1);
  });

  test('aisles still fold with 60 items, past the old virtualization cap', async ({ context, page }) => {
    await signIn(context);
    await seedGroceryItems(page, 61);
    await page.goto('/dashboard/grocery');
    await page.waitForLoadState('networkidle');

    // Above 60 rows the list is window-virtualized. The fold used to exist
    // only below 50: past it every aisle rendered open in a 70vh box.
    const headers = page.locator('button[aria-expanded]').filter({ hasText: /Produce|Dairy|Meat|Frozen|Rice|Condiments/ });
    await expect(headers.first()).toBeVisible();
    await expect(headers.first()).toHaveAttribute('aria-expanded', 'true');
    const second = headers.nth(1);
    await expect(second).toHaveAttribute('aria-expanded', 'false');

    const before = await page.locator(VISIBLE_CHECKBOX).count();
    await second.click();
    await expect(second).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => page.locator(VISIBLE_CHECKBOX).count()).toBeGreaterThan(before);
  });
});

/**
 * Option a (2026-09-25): on a phone the kid filter, grouping, store picker and
 * In-store mode moved out of the page and into More options, which is what
 * brought the first checkbox onto the first screen. Moving them must not lose
 * them: each is still reachable, and a filter that is on says so on the page.
 */
test.describe('Grocery list view controls live in More options on a phone', () => {
  test.beforeEach(async ({ context, page }) => {
    await signIn(context);
    await page.goto('/dashboard/grocery');
    await page.waitForLoadState('networkidle');
  });

  async function openMore(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'More options' }).click();
  }

  test('nothing above the list but the toolbar, quick add and the one-line plan banner', async ({ page }) => {
    await expect(page.getByRole('group', { name: 'Group items by' })).toHaveCount(0);
    await expect(page.getByTestId('grocery-in-store-open')).toHaveCount(0);
    await expect(page.getByTestId('grocery-view-indicator')).toHaveCount(0);

    const banner = page.getByTestId('grocery-plan-banner');
    if (await banner.count()) {
      const box = (await banner.boundingBox())!;
      expect(box.height, `the plan banner is ${Math.round(box.height)}px tall`).toBeLessThanOrEqual(48);
    }
  });

  test('In-store mode is one tap from the menu', async ({ page }) => {
    await openMore(page);
    await page.getByRole('menuitem', { name: 'In-store mode' }).click();
    await expect(page.getByTestId('in-store-mode')).toBeVisible();
  });

  test('a kid filter set in the sheet is named on the page, and clears from there', async ({ page }) => {
    await openMore(page);
    await page.getByRole('menuitem', { name: 'Filter, group and store' }).click();
    const sheet = page.getByRole('dialog', { name: 'List view' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('group', { name: 'Group items by' })).toBeVisible();

    const kidToggle = sheet.getByRole('button', { name: /^Only .+'s items$/ }).first();
    await kidToggle.click();
    await expect(kidToggle).toHaveAttribute('aria-pressed', 'true');
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();

    const indicator = page.getByTestId('grocery-view-indicator');
    await expect(indicator).toBeVisible();
    await expect(indicator).toContainText("'s items");
    await indicator.getByRole('button', { name: "Show everyone's items" }).click();
    await expect(indicator).toHaveCount(0);
  });

  test('grouping by category from the sheet is named on the page', async ({ page }) => {
    await openMore(page);
    await page.getByRole('menuitem', { name: 'Filter, group and store' }).click();
    const sheet = page.getByRole('dialog', { name: 'List view' });
    await sheet.getByRole('button', { name: 'By category' }).click();
    await sheet.getByRole('button', { name: 'Done' }).click();

    const indicator = page.getByTestId('grocery-view-indicator');
    await expect(indicator).toContainText('By category');
    await indicator.getByRole('button', { name: 'Group by aisle again' }).click();
    await expect(indicator).toHaveCount(0);
  });

  test('a desktop keeps the controls above the list and no sheet entry', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('group', { name: 'Group items by' })).toBeVisible();
    await expect(page.getByTestId('grocery-in-store-open')).toBeVisible();
    await openMore(page);
    await expect(page.getByRole('menuitem', { name: 'Filter, group and store' })).toHaveCount(0);
  });
});
