import { test, expect, type Page } from '@playwright/test';
import { signIn } from '../helpers/auth';

/**
 * The global link, focus and contrast rules in index.css, measured in the
 * browser rather than read as text (src/lib/utilityHijack.test.ts does that).
 *
 * All three used to be written so a Tailwind class could not override them:
 * - `a:not([class*="button"])` underlined links at (0,2,1), so `no-underline`
 *   did nothing and every header, footer, logo and `<Button asChild>` link
 *   was underlined;
 * - `button:focus, a:focus, input:focus { outline: 2px solid #2563eb }` in
 *   styles/mobile-first.css beat `outline-none` and ignored the ring token;
 * - `@media (prefers-contrast: high) { body { color: #000 } }` would have put
 *   black text on the dark theme, and only never did because no browser
 *   matches `high`.
 *
 * Needs the fake-backend build, same as the other specs in this folder:
 *   node scripts/dev/fake-postgrest.mjs &
 *   VITE_SUPABASE_URL=http://127.0.0.1:54999 VITE_SUPABASE_ANON_KEY=<jwt-shaped> \
 *     npx vite build --outDir dist-e2e
 *   E2E_TARGET=dist E2E_DIST=dist-e2e npx playwright test tests/accessibility/
 */

async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page
    .locator('.animate-pulse')
    .first()
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => {
      // No skeleton, or it never mounted. Either is fine.
    });
  await page.waitForTimeout(500);
  expect(new URL(page.url()).pathname, `redirected to ${page.url()}`).not.toMatch(/^\/auth/);
}

/**
 * What the focused element draws: a non-transparent outline, or a box-shadow
 * layer with a non-zero spread and a non-transparent colour (Tailwind's ring).
 */
async function focusIndicator(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const alpha = (colour: string) => {
      const m = colour.match(/rgba?\(([^)]+)\)/);
      if (!m) return 1;
      const parts = m[1].split(/[\s,/]+/).filter(Boolean);
      return parts.length > 3 ? parseFloat(parts[3]) : 1;
    };
    const outline =
      cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && alpha(cs.outlineColor) > 0;
    const ring =
      cs.boxShadow !== 'none' &&
      cs.boxShadow.split(/,(?![^(]*\))/).some((layer) => {
        const colour = layer.match(/rgba?\([^)]*\)/)?.[0] ?? '';
        const lengths = layer.replace(colour, '').trim().split(/\s+/).map(parseFloat);
        return alpha(colour) > 0 && (lengths[3] ?? 0) > 0;
      });
    return {
      label: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)}"`,
      focusVisible: el.matches(':focus-visible'),
      drawn: outline || ring,
    };
  });
}

test.describe('global link, focus and contrast rules', () => {
  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test('a Tailwind class decides a link underline; running-text links keep theirs', async ({ page }) => {
    await open(page, '/dashboard/settings');

    const decoration = await page.evaluate(() => {
      const host = document.createElement('div');
      host.innerHTML =
        '<p>Read the <a id="t-plain" href="#">terms</a> and ' +
        '<a id="t-none" class="no-underline" href="#">privacy</a> pages.</p>' +
        '<a id="t-box" class="inline-flex" href="#">Upgrade</a>' +
        '<nav><a id="t-nav" href="#">Blog</a></nav>';
      document.querySelector('main')!.appendChild(host);
      const line = (id: string) => getComputedStyle(document.getElementById(id)!).textDecorationLine;
      const out = {
        plain: line('t-plain'),
        noUnderline: line('t-none'),
        box: line('t-box'),
        nav: line('t-nav'),
      };
      host.remove();
      return out;
    });
    expect(decoration).toEqual({ plain: 'underline', noUnderline: 'none', box: 'none', nav: 'none' });

    // The settings section nav is a column of flex rows, not words in a sentence.
    const settingsNav = page.getByRole('link', { name: 'Profile', exact: true });
    await expect(settingsNav).toHaveCSS('text-decoration-line', 'none');
  });

  test('every control reached by Tab on Grocery draws a focus indicator', async ({ page }) => {
    await open(page, '/dashboard/grocery');
    const missing: string[] = [];
    let reached = 0;
    for (let i = 0; i < 45; i++) {
      await page.keyboard.press('Tab');
      // Buttons animate box-shadow with transition-all; read the settled value.
      await page.waitForTimeout(250);
      const seen = await focusIndicator(page);
      if (!seen) continue;
      reached++;
      if (!seen.drawn) missing.push(seen.label);
    }
    expect(reached).toBeGreaterThan(20);
    expect(missing).toEqual([]);
  });

  test('a mouse click focuses a button without drawing a ring', async ({ page }) => {
    await open(page, '/dashboard/grocery');
    // The grouping toggle keeps focus where it is when clicked.
    const button = page.getByRole('button', { name: 'By category' });
    await button.click();
    await page.waitForTimeout(250);
    const seen = await focusIndicator(page);
    expect(seen?.label).toContain('By category');
    expect(seen?.focusVisible).toBe(false);
    expect(seen?.drawn).toBe(false);
  });

  test('prefers-contrast: more keeps theme text and strengthens secondary tokens', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', contrast: 'more' });
    await open(page, '/dashboard');
    const read = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement('span');
      probe.style.color = 'hsl(var(--foreground))';
      document.body.appendChild(probe);
      const foreground = getComputedStyle(probe).color;
      probe.remove();
      return {
        dark: document.documentElement.classList.contains('dark'),
        matches: matchMedia('(prefers-contrast: more)').matches,
        body: getComputedStyle(document.body).color,
        foreground,
        muted: root.getPropertyValue('--muted-foreground').trim(),
        border: root.getPropertyValue('--border').trim(),
      };
    });
    expect(read.dark, 'dark theme did not apply').toBe(true);
    expect(read.matches, 'contrast emulation did not apply').toBe(true);
    expect(read.body).toBe(read.foreground);
    expect(read.body).not.toBe('rgb(0, 0, 0)');
    expect(read.muted).toBe('215 20% 85%');
    expect(read.border).toBe('217 20% 60%');
  });
});
