import { test, expect } from '@playwright/test';

/**
 * US-846: WCAG 1.4.10 Reflow, measured rather than asserted.
 *
 * src/pages/VPAT.tsx claims 1.4.10 "Supports -- Content reflows at 320px
 * width. No horizontal scrolling required." The only thing checking it was one
 * assertion in mobile-responsive.spec.ts that loaded `/` -- at iPhone 13 width,
 * not 320 -- and `/` was the page that passed. Two of the ten public routes
 * did not:
 *
 *   /pricing        339px, +19: the monthly/yearly billing toggle. Two
 *                   whitespace-nowrap buttons plus a "Save 20%" badge came to
 *                   274px and gap-3 pushed the group past the viewport. The
 *                   page where somebody decides to pay.
 *   /accessibility  321px, +1: the contact address. One unbreakable 213px word
 *                   in a flex child whose default min-width:auto refused to
 *                   shrink -- which is the case 1.4.10 exists for, on the
 *                   accessibility page.
 *
 * 320 CSS px is the width the criterion names, and it is a real phone: an
 * iPhone SE is 320pt wide in portrait.
 */

/** Every public route a visitor can land on directly. */
const ROUTES = [
  '/',
  '/pricing',
  '/faq',
  '/blog',
  '/auth',
  '/guides',
  '/contact',
  '/accessibility',
  '/vpat',
  '/compare',
];

test.describe('WCAG 1.4.10 Reflow at 320px', () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test('the route list is worth iterating', () => {
    // A list that shrinks to the one page that passes is how this went
    // unnoticed for as long as it did.
    expect(ROUTES.length).toBeGreaterThanOrEqual(8);
    expect(ROUTES).toContain('/pricing');
  });

  for (const route of ROUTES) {
    test(`${route} does not scroll horizontally`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' });

      const measured = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflow = doc.scrollWidth - doc.clientWidth;
        const culprits: string[] = [];
        if (overflow > 0) {
          for (const el of Array.from(document.querySelectorAll('body *'))) {
            const box = el.getBoundingClientRect();
            if (box.width === 0 || box.height === 0) continue;
            if (box.right <= doc.clientWidth + 0.2 && box.left >= -0.2) continue;
            // An element that scrolls itself, or sits inside one, is allowed
            // to be wider than the viewport -- a table or a code block. The
            // document is not.
            let scrollsItself = getComputedStyle(el).overflowX === 'auto' || getComputedStyle(el).overflowX === 'scroll';
            let ancestor = el.parentElement;
            while (ancestor && !scrollsItself) {
              const style = getComputedStyle(ancestor);
              scrollsItself = style.overflowX === 'auto' || style.overflowX === 'scroll';
              ancestor = ancestor.parentElement;
            }
            if (scrollsItself) continue;
            culprits.push(
              `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 60)}"> right=${Math.round(box.right)} width=${Math.round(box.width)} text="${(el.textContent ?? '').trim().slice(0, 40)}"`,
            );
          }
        }
        return { overflow, culprits: culprits.slice(0, 5) };
      });

      expect(
        measured.overflow,
        `${route} is ${measured.overflow}px wider than a 320px viewport:\n${measured.culprits.join('\n')}`,
      ).toBeLessThanOrEqual(0);
    });
  }
});
