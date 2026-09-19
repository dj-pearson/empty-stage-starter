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
 *
 * US-772 replaced GSAP here with a CSS transition driven by an
 * IntersectionObserver (src/lib/scrollReveal.ts). The assertions below are
 * unchanged in intent -- every grid has something to animate, nothing is left
 * unreadable -- and the GSAP-warning check is now a console check, because the
 * warning it watched for cannot be emitted by a page that does not load GSAP.
 */

/** Anything GSAP says it could not find. Substring, not exact: the message
 *  embeds whatever was passed, so the empty-NodeList and empty-array forms
 *  differ in text and both have to be caught. */
const GSAP_MISS = 'GSAP target';

/**
 * Scroll to the true bottom, not to the height measured at the top.
 *
 * The page grows while you scroll it -- lazy sections mount, images get their
 * intrinsic size -- so a height read once at y=0 stops short. Measured: the
 * closing CTA sat 200px below the last position this reached and was reported
 * as an element the animation had failed to reveal.
 */
async function scrollThrough(page: import('@playwright/test').Page) {
  let y = 0;
  for (let guard = 0; guard < 100; guard++) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    if (y >= height) break;
    y += 500;
    await page.evaluate((to) => window.scrollTo(0, to), y);
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  // Long enough for the last 700ms transition, plus its stagger, to finish.
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

  test('the landing page never loads GSAP', async ({ page }) => {
    // The point of US-772: gsap is reachable from the planner and nowhere
    // else. A static import added back to Landing, EnhancedHero or
    // ParallaxBackground puts a 40 kB gz chunk on the marketing page again,
    // and nothing else would notice.
    const gsapRequests: string[] = [];
    page.on('request', (request) => {
      if (/vendor-gsap|\/gsap/.test(request.url())) gsapRequests.push(request.url());
    });

    await page.goto('/', { waitUntil: 'networkidle' });
    await scrollThrough(page);

    expect(gsapRequests, gsapRequests.join('\n')).toEqual([]);
  });

  test('a reduced-motion visitor reads the page, animation or not', async ({ browser }) => {
    // The hidden state is a class the script adds, precisely so this holds.
    // With it in the base stylesheet, every section on a prerendered page
    // would sit at opacity 0 for anyone whose OS asked for less motion.
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'networkidle' });

    const faded = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.animate-section, .animate-item'))
        .filter((el) => parseFloat(getComputedStyle(el).opacity) < 0.95)
        .map((el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)),
    );

    await context.close();
    expect(faded, `hidden from a reduced-motion visitor: ${JSON.stringify(faded)}`).toEqual([]);
  });

  test('no animated element is left invisible once it has been scrolled past', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await scrollThrough(page);

    // The start state is opacity 0. A reveal that never fires leaves real copy
    // unreadable -- the failure mode that matters more than the missing
    // animation does.
    //
    // Polled rather than read once after a fixed wait. The page grows while it
    // is scrolled -- lazy sections mount, images get their intrinsic size --
    // so the last elements come into view during the settle, and a single read
    // caught ten of them mid-transition. What this test is about is the state
    // the page comes to rest in, so it waits for rest.
    await expect
      .poll(
        async () =>
          page.evaluate(() =>
            Array.from(document.querySelectorAll('.animate-section, .animate-item'))
              .filter((el) => parseFloat(getComputedStyle(el).opacity) < 0.95)
              .map((el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)),
          ),
        { timeout: 15_000, message: 'elements still at opacity 0 after the page settled' },
      )
      .toEqual([]);
  });
});
