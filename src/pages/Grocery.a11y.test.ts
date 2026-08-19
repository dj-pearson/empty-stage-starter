import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * US-576: the grocery row controls (qty -/+, edit, delete) are hover-reveal.
 * Hover does not exist on touch, and jsdom applies neither media queries nor
 * layout, so these are source guards rather than rendered assertions -- the
 * same approach as src/lib/trialDisclosure.test.ts.
 *
 * The failure mode worth guarding is the quiet one: `pointer-coarse:` is a
 * custom variant registered in tailwind.config.ts, not a Tailwind 3 built-in.
 * Drop the plugin and every `pointer-coarse:*` class in the app compiles to
 * nothing, with no build error and no visible diff on a desktop browser.
 */

const read = (rel: string) =>
  readFileSync(path.resolve(__dirname, '../..', rel), 'utf-8');

describe('grocery hover-reveal controls (US-576)', () => {
  const source = read('src/pages/Grocery.tsx');

  /** Every className string on a control that starts hidden. */
  const hoverRevealClasses = (source.match(/className="[^"]*opacity-0[^"]*"/g) ?? []);

  it('has hover-reveal controls to check', () => {
    expect(hoverRevealClasses.length).toBeGreaterThan(0);
  });

  it.each([
    ['group-hover:opacity-100', 'mouse'],
    ['group-focus-within:opacity-100', 'keyboard tabbing into the row'],
    ['focus-visible:opacity-100', 'keyboard focus on the control itself'],
    ['pointer-coarse:opacity-100', 'touch, which has no hover'],
  ])('reveals every hidden control via %s (%s)', (cls) => {
    const missing = hoverRevealClasses.filter((c) => !c.includes(cls));
    expect(missing).toEqual([]);
  });
});

describe('touch target sizing (US-576 / US-043)', () => {
  it('registers the pointer-coarse variant, or the classes silently no-op', () => {
    const config = read('tailwind.config.ts');
    expect(config).toMatch(/addVariant\(\s*["']pointer-coarse["']\s*,\s*["']@media \(pointer: coarse\)["']\s*\)/);
  });

  it('still forces 44px minimum touch targets on coarse pointers', () => {
    const css = read('src/index.css');
    const coarseBlock = css.slice(css.indexOf('@media (pointer: coarse)'));

    expect(coarseBlock).toMatch(/min-height:\s*44px/);
    expect(coarseBlock).toMatch(/min-width:\s*44px/);
    // The grocery controls are plain <button> (no asChild), so the bare
    // `button` selector is what carries them to 44px despite their h-7 w-7.
    expect(coarseBlock.slice(0, coarseBlock.indexOf('}'))).toMatch(/\bbutton\b/);
  });

  it('leaves the grocery controls relying on that rule rather than a fixed height', () => {
    const source = read('src/pages/Grocery.tsx');
    // h-7 w-7 is 28px; min-height/min-width win over height/width, so the
    // rendered target is 44px on touch and stays compact on desktop. If these
    // ever gain an explicit pointer-coarse height, this test should be
    // rewritten rather than deleted.
    expect(source).not.toMatch(/pointer-coarse:h-\d/);
  });
});
