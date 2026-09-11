import { test, expect } from '@playwright/test';

/**
 * US-854: the landing page's entrance animations, measured in a browser.
 *
 * src/pages/Landing.tsx animates two things on scroll: each `.animate-section`
 * fades up on its own, and each `.animate-grid` staggers its `.animate-item`
 * children. The pricing preview grid -- the last section before the footer, the
 * one carrying the three plan cards -- was never given the item class on its
 * Cards, so `grid.querySelectorAll('.animate-item')` returned an empty NodeList
 * and GSAP was handed nothing to tween. Measured on the built site: five
 * "GSAP target ... not found" warnings on every load of `/`, one naming the
 * empty NodeList and four more from the stagger timeline built on top of it,
 * and the plan cards sitting still while the five sections above them faded in.
 *
 * A console warning is the only signal this leaves. Nothing throws, nothing
 * renders wrong, the section is simply inert -- which is exactly the kind of
 * defect that survives a year of code review, so it needs a gate rather than a
 * comment.
 *
 * Runs against the built site (E2E_TARGET=dist), the same target the SEO and
 * reflow specs use, because the animation code only ships in the built chunk.
 */

/** Anything GSAP says it could not find. Substring, not exact: the message
 *  embeds whatever was passed, so the empty-NodeList and empty-array forms
 *  differ in text and both have to be caught. */
const GSAP_MISS = 'GSAP target';

async function scrollThrough(page: import('@playwright/test').Page) {
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(120);
  }
  // Long enough for the last ScrollTrigger to play out its 0.8s tween.
  await page.waitForTimeout(2000);
}

test.describe('landing page entrance animations', () => {
  test('every animated grid has something to animate', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const counts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.animate-grid')).map((grid) => ({
        items: grid.querySelectorAll('.animate-item').length,
        // Enough text to name the offending section in the failure message.
        label: (grid.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      }))
    );

    // A floor: "all of them have items" must not be true of an empty list.
    // Deleting the animation to pass this is then a visible change, not a quiet
    // one.
    expect(counts.length).toBeGreaterThanOrEqual(5);

    const empty = counts.filter((c) => c.items === 0);
    expect(empty, `grids with no .animate-item children: ${JSON.stringify(empty)}`).toEqual([]);
  });

  test('no GSAP target is missing during a full scroll', async ({ page }) => {
    const misses: string[] = [];
    page.on('console', (message) => {
      if (message.text().includes(GSAP_MISS)) misses.push(message.text());
    });

    await page.goto('/', { waitUntil: 'networkidle' });
    await scrollThrough(page);

    expect(misses, misses.join('\n')).toEqual([]);
  });

  test('no animated element is left invisible once it has been scrolled past', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await scrollThrough(page);

    // fromTo starts these at opacity 0. A ScrollTrigger that never fires, or a
    // tween that never completes, leaves real copy unreadable -- the failure
    // mode that matters more than the missing animation does.
    const faded = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.animate-section, .animate-item'))
        .filter((el) => parseFloat(getComputedStyle(el).opacity) < 0.95)
        .map((el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60))
    );

    expect(faded, `still faded: ${JSON.stringify(faded)}`).toEqual([]);
  });
});
