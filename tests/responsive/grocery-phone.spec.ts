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
    await page.getByRole('button', { name: /^Add Item$/i }).first().click();
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

  test('Add Item is still on screen after scrolling the list', async ({ page }) => {
    await scrollDown(page);
    const add = page.getByRole('button', { name: /^Add Item$/i }).first();
    const box = (await add.boundingBox())!;
    const viewport = page.viewportSize()!;

    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    // And it still opens the sheet from where it is stuck.
    await add.click();
    await expect(page.getByRole('dialog', { name: /Add Grocery Item/i })).toBeVisible();
  });

  test('the stuck bar sits below the mobile header, not behind it', async ({ page }) => {
    await scrollDown(page);
    const gap = await page.evaluate((sel) => {
      const picker = document.querySelector(sel)!;
      let bar = picker.parentElement as HTMLElement;
      while (bar && getComputedStyle(bar).position !== 'sticky') bar = bar.parentElement as HTMLElement;
      const nav = document.querySelector('nav[aria-label="Mobile header navigation"]')!;
      return Math.round(bar.getBoundingClientRect().top - nav.getBoundingClientRect().bottom);
    }, PICKER);

    // This is what pins the 97px offset to something real. A `top-0` bar
    // reports gap = -97 here and passes every other test in this block.
    expect(gap, `the sticky bar is ${gap}px from the header's bottom edge`).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(4);
  });

  test('the bar does not eat the screen', async ({ page }) => {
    await scrollDown(page);
    const share = await page.evaluate((sel) => {
      const picker = document.querySelector(sel)!;
      let bar = picker.parentElement as HTMLElement;
      while (bar && getComputedStyle(bar).position !== 'sticky') bar = bar.parentElement as HTMLElement;
      const nav = document.querySelector('nav[aria-label="Mobile header navigation"]')!;
      return (bar.getBoundingClientRect().height + nav.getBoundingClientRect().height) / window.innerHeight;
    }, PICKER);

    // Measured: a 97px header and a 120px bar on a 664px viewport, 33%, which
    // leaves about 450px of list. The whole Quick Actions row was the obvious
    // thing to stick instead -- at 390px each of its four buttons takes a line,
    // 225px, and sticking it would have put this at 49%. The ceiling is here so
    // that a third row added to the bar later fails rather than creeps.
    expect(share, `header plus sticky bar is ${Math.round(share * 100)}% of the viewport`).toBeLessThan(0.36);
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

    expect(fixedAtTop).toEqual(['Mobile header navigation']);
  });
});
