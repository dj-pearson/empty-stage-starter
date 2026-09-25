import { test, expect, devices } from '@playwright/test';
import { signIn } from '../helpers/auth';

/**
 * The dashboard's fixed chrome is the size the shell reserves for it (US-869).
 *
 * `src/pages/Dashboard.tsx` pins a header at the top and a tab bar at the
 * bottom, and pays for them with `pt-14 pb-20` on `main`. Both navs carry
 * `bg-card`, and `src/styles/mobile-first.css` gave `[class*="card"]` 20px of
 * padding below 768px -- an attribute SUBSTRING match, so it hit every element
 * carrying the card colour token and not only cards. Measured before the fix:
 * the header rendered 97px against 56px reserved, and the tab bar 101px
 * against 80px, so the top 41px and the bottom 21px of every dashboard screen
 * were behind chrome.
 *
 * Nothing pointed at it. It looks like a design choice until you measure it,
 * and the app is usable with it -- which is why it needs a number rather than
 * a screenshot.
 */

test.use({ viewport: devices['iPhone 12'].viewport });

/** The nav's own border is allowed to sit in the first reserved pixel. */
const BORDER_SLACK_PX = 2;

const ROUTES = ['/dashboard', '/dashboard/grocery', '/dashboard/pantry', '/dashboard/settings'];

test.describe('dashboard chrome fits the space reserved for it', () => {
  for (const route of ROUTES) {
    test(`${route} header and tab bar match main's padding`, async ({ context, page }) => {
      await signIn(context);
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      const m = await page.evaluate(() => {
        // The fixed <header> that precedes main (it holds the logo and the kid
        // picker, no links, so it is not a nav), and the "Primary" tab bar.
        const header = document.querySelector('header:has(~ main#main-content)');
        const tabs = document.querySelector('nav[aria-label="Primary"]');
        const main = document.querySelector('main#main-content');
        if (!header || !tabs || !main) return null;
        const style = getComputedStyle(main as HTMLElement);
        return {
          headerH: header.getBoundingClientRect().height,
          tabsH: tabs.getBoundingClientRect().height,
          reservedTop: parseFloat(style.paddingTop),
          reservedBottom: parseFloat(style.paddingBottom),
        };
      });

      expect(m, 'the mobile dashboard shell did not render').not.toBeNull();
      expect(
        m!.headerH,
        `header is ${m!.headerH}px against ${m!.reservedTop}px reserved`,
      ).toBeLessThanOrEqual(m!.reservedTop + BORDER_SLACK_PX);
      expect(
        m!.tabsH,
        `tab bar is ${m!.tabsH}px against ${m!.reservedBottom}px reserved`,
      ).toBeLessThanOrEqual(m!.reservedBottom + BORDER_SLACK_PX);
    });
  }

  test('cards still get their mobile padding', async ({ context, page }) => {
    // The fix scopes the rule to `main` rather than deleting it. Deleting it
    // would take 20px of padding off every card on every phone screen, which
    // is a redesign, not a bug fix.
    //
    // WHICH PAGE, AND WHEN, is what made this flaky. It used to read Recipes
    // 500ms after networkidle. Against the fake backend Recipes has no recipes,
    // so at rest it is an empty state with ONE card; for about a second before
    // that it shows six skeleton cards. The count ("> 3") only passed when the
    // measurement landed inside the skeleton window, so a pass was measuring
    // placeholders and a fail was the page telling the truth.
    //
    // The planner's day view renders one card per meal slot (Breakfast, Lunch,
    // Dinner, Snack 1, Snack 2) whether or not anything is planned, so the
    // count does not depend on fixture data. And the wait is for that settled
    // state -- the last slot rendered and no skeleton left -- not for a clock.
    await signIn(context);
    await page.goto('/dashboard/planner');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main .animate-pulse')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator('main [class*="card"]').filter({ hasText: 'Snack 2' }).first()).toBeVisible();

    const padded = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('main [class*="card"]')) as HTMLElement[];
      return {
        count: cards.length,
        unpadded: cards
          .filter((el) => parseFloat(getComputedStyle(el).paddingTop) < 20)
          .map((el) => (el.textContent || '').trim().slice(0, 30)),
      };
    });

    expect(padded.count, 'no cards rendered, so this asserts nothing').toBeGreaterThan(3);
    expect(padded.unpadded, 'cards without the 20px mobile padding').toEqual([]);
  });

  test('the chrome is not padded, on either side of the fix', async ({ context, page }) => {
    // Straight at the cause: the navs must not match the card rule any more.
    await signIn(context);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const padding = await page.evaluate(() =>
      Array.from(document.querySelectorAll('nav[class*="card"]')).map((el) => {
        const style = getComputedStyle(el as HTMLElement);
        return {
          label: el.getAttribute('aria-label'),
          top: style.paddingTop,
          left: style.paddingLeft,
        };
      }),
    );

    // They still carry bg-card; what changed is that the rule no longer
    // reaches them, because they are chrome and live outside <main>.
    //
    // Top and left rather than the shorthand: the tab bar sets its own
    // padding-bottom for the home-indicator inset, and that is its business.
    // The card rule set all four sides to 20px, so either of these catches it.
    expect(padding.length, 'the navs stopped carrying bg-card, so this tests nothing').toBeGreaterThan(0);
    for (const nav of padding) {
      expect(nav.top, `${nav.label} is padded by the card rule`).toBe('0px');
      expect(nav.left, `${nav.label} is padded by the card rule`).toBe('0px');
    }
  });
});
