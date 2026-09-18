import { test, expect } from '@playwright/test';
import { signIn } from '../helpers/auth';

/**
 * US-821 AC1: with prefers-reduced-motion set, nothing on /dashboard carrying
 * content is left below full opacity once the page has settled.
 *
 * The story spent three iterations editing components on the theory that the
 * reduced-motion flag was evaluating false under Playwright. It is not: the
 * built app returns true for
 * matchMedia('(prefers-reduced-motion: reduce)').matches under emulation, and
 * this test asserts that before it asserts anything else -- a run where the
 * emulation silently failed would otherwise pass while measuring nothing.
 *
 * Two kinds of faded element are expected and allowed. `opacity-20` is a
 * static Tailwind class on decorative dividers, not an animation. The
 * `pointer-events-none` gradient overlay on each card starts invisible by
 * design and is the one deliberate exception recorded on the story. Neither
 * carries text, which is what the washed-out contrast readings were about.
 *
 * Needs the fake-backend build, same as the authenticated scan beside it:
 *   node scripts/dev/fake-postgrest.mjs &
 *   VITE_SUPABASE_URL=http://127.0.0.1:54999 VITE_SUPABASE_ANON_KEY=<jwt-shaped> \
 *     npx vite build --outDir dist-e2e
 *   E2E_TARGET=dist E2E_DIST=dist-e2e npx playwright test tests/accessibility/
 */

test('dashboard settles at full opacity under reduced motion', async ({ page, context }) => {
  await signIn(context);
  // test.use({ reducedMotion }) did not take on this config -- measured
  // flag=false -- so emulate on the page, where it is unambiguous.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  await page.locator('main, [role="main"]').first().waitFor({ state: 'visible' });
  await page.waitForTimeout(1500);

  expect(new URL(page.url()).pathname).not.toMatch(/^\/auth/);

  const report = await page.evaluate(() => {
    const faded: Array<{ tag: string; opacity: string; inline: string; cls: string; text: string }> = [];
    document.querySelectorAll('*').forEach((el) => {
      const inline = (el as HTMLElement).style?.opacity ?? '';
      const computed = getComputedStyle(el).opacity;
      if ((inline !== '' && parseFloat(inline) < 1) || parseFloat(computed) < 1) {
        faded.push({
          tag: el.tagName.toLowerCase(),
          opacity: computed,
          inline,
          cls: String((el as HTMLElement).className ?? '').slice(0, 90),
          text: (el.textContent ?? '').trim().slice(0, 50),
        });
      }
    });
    return {
      flag: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      count: document.querySelectorAll('*').length,
      faded,
    };
  });

  console.log(`[us821] flag=${report.flag} elements=${report.count} faded=${report.faded.length}`);
  for (const f of report.faded) {
    console.log(`[us821]   <${f.tag}> computed=${f.opacity} inline="${f.inline}" cls="${f.cls}" text="${f.text}"`);
  }

  // Assert the emulation first. A run where it silently failed would measure
  // the page with motion ON and report it as clean.
  expect(report.flag, 'reduced motion must actually be emulated').toBe(true);

  // Decorative and deliberate fades are allowed; anything carrying text is
  // the defect this story is about.
  const withText = report.faded.filter((f) => f.text.length > 0);
  expect(
    withText,
    'These carry content and are still faded under reduced motion. Gate the opacity on ' +
      'shouldReduceMotion in the variant AND the inline initial -- framer-motion reduces ' +
      'transforms for you but never opacity, deliberately, so a fade survives MotionConfig.'
  ).toEqual([]);

  const unexpected = report.faded.filter(
    (f) => !/opacity-20/.test(f.cls) && !/pointer-events-none/.test(f.cls)
  );
  expect(
    unexpected,
    'A new faded element that is neither the static opacity-20 decoration nor the ' +
      'pointer-events-none hover overlay. If it is deliberate, widen this allowance and say why.'
  ).toEqual([]);
});
