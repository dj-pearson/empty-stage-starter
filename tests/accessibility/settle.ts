import type { Page } from '@playwright/test';

/**
 * Wait until no element on the page is still mid-animation.
 *
 * US-817. `networkidle` says the network went quiet, not that the page stopped
 * moving, and a fixed sleep is a guess that is either too short or wasted. Both
 * a11y scans were sampling the DOM while entrance animations were in flight,
 * and axe faithfully reported the composited colours of a frame nobody ever
 * sees:
 *
 *   - Landing, 375px: a `.animate-item` grid caught at opacity 0.4434 turned
 *     its white CTA label into #f7ece5 on #b35617 and failed at 4.24:1. The
 *     same button measures 5.63:1 a second later.
 *   - Pantry, signed in: cards caught at opacity ~0.71 reported 61 nodes --
 *     white-on-#579f70 for badges that are really white on #117937 (5.51:1),
 *     and #818fa3 for text that is really --muted-foreground #4d6280. Every
 *     colour in that run was the real one washed 29% toward the page
 *     background.
 *
 * Polling for stability rather than for a particular value keeps this honest:
 * elements that are permanently translucent (an `opacity-50` disabled control,
 * a decorative overlay) settle immediately and are not waited on, and nothing
 * here can hide a violation that persists.
 */
export async function settleAnimations(page: Page, timeoutMs = 5000): Promise<void> {
  const sample = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .map((el) => getComputedStyle(el).opacity)
        .filter((opacity) => opacity !== '1')
        .join(','),
    );

  const deadline = Date.now() + timeoutMs;
  let previous = await sample();
  while (Date.now() < deadline) {
    await page.waitForTimeout(150);
    const current = await sample();
    if (current === previous) return;
    previous = current;
  }
}
