/**
 * US-839, WCAG 2.2.2 Pause, Stop, Hide.
 *
 * The VPAT recorded "Some JavaScript-driven (Framer Motion) animations are not
 * yet fully gated on prefers-reduced-motion; remediation in progress." Six
 * components do import framer-motion without touching a reduced-motion hook,
 * which is what that remark was presumably counting -- but they do not need
 * one: App.tsx wraps the whole tree in <MotionConfig reducedMotion={...}>, and
 * framer-motion applies that to every motion component beneath it.
 *
 * TWO SWITCHES, NOT ONE, and this is the part worth pinning. Motion can be
 * reduced by the operating system OR by the app's own toggle, and each needs
 * its own path through both engines:
 *
 *                        framer-motion            CSS
 *   OS preference        MotionConfig 'user'      @media (prefers-reduced-motion: reduce)
 *   in-app toggle        MotionConfig 'always'    html.reduce-motion
 *
 * Miss the bottom-right cell and the accessibility panel offers a control that
 * silently half-works: framer entrances stop, and every CSS `infinite`
 * animation on the page keeps running. That cell exists; this file is what
 * keeps it existing.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');

const STYLESHEETS = ['src/index.css', 'src/styles/mobile-first.css'];

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Does `css` contain a rule that kills animation for `scope` and every
 * descendant of it? `scope` is '' for a bare universal rule, or a class
 * selector like '.reduce-motion'.
 *
 * SELECTORS ARE COMPARED WHOLE, not by substring. The first version asked
 * `selector.includes('.reduce-motion')`, and a mutant that renamed the rule to
 * `.reduce-motion-disabled` sailed through it -- the class the app actually
 * puts on <html> had stopped matching anything and the gate still passed.
 */
function hasUniversalReduceRule(css: string, scope: string): boolean {
  const wanted = scope ? `${scope} *` : '*';
  for (const m of stripCssComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const parts = m[1].split(',').map((part) => part.trim().replace(/\s+/g, ' '));
    if (!parts.includes(wanted)) continue;
    const body = m[2];
    if (/animation-duration\s*:/.test(body) || /animation\s*:\s*none/.test(body)) return true;
  }
  return false;
}

/**
 * Every `@media (prefers-reduced-motion: reduce)` block in the sheet.
 *
 * Plural on purpose. index.css has three, and the first one is a narrow rule
 * for a single class. Reading only the first made this file report that the
 * stylesheet had no universal reduce rule while the universal rule sat 118
 * lines below it.
 */
function osPreferenceBlocks(css: string): string[] {
  const clean = stripCssComments(css);
  const blocks: string[] = [];
  const marker = '@media (prefers-reduced-motion: reduce)';
  let from = 0;
  for (;;) {
    const start = clean.indexOf(marker, from);
    if (start === -1) return blocks;
    const open = clean.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < clean.length; i += 1) {
      if (clean[i] === '{') depth += 1;
      else if (clean[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          blocks.push(clean.slice(open + 1, i));
          from = i;
          break;
        }
      }
    }
    if (from <= start) return blocks;
  }
}

const app = read('src', 'App.tsx');
const context = read('src', 'contexts', 'AccessibilityContext.tsx');

describe('US-839: framer-motion is gated once, at the root', () => {
  it('App.tsx wraps the tree in MotionConfig', () => {
    expect(app).toMatch(/<MotionConfig\b/);
    expect(app).toMatch(/<\/MotionConfig>/);
  });

  it('the in-app toggle forces reduction, and otherwise the OS decides', () => {
    // 'always' ignores the OS; 'user' defers to it. Both spellings must be
    // present or one of the two switches is dead.
    expect(app).toMatch(/reducedMotion=\{[^}]*reducedMotion[^}]*'always'[^}]*'user'[^}]*\}/);
  });

  it('the provider is mounted high enough to cover the routes', () => {
    const open = app.indexOf('<ReducedMotionProvider>');
    const close = app.indexOf('</ReducedMotionProvider>');
    const routes = app.indexOf('<Routes>');
    expect(open).toBeGreaterThan(-1);
    expect(routes).toBeGreaterThan(open);
    expect(close).toBeGreaterThan(routes);
  });
});

describe('US-839: CSS is gated for both switches', () => {
  it.each(STYLESHEETS)('%s kills animation under the OS preference', (sheet) => {
    const blocks = osPreferenceBlocks(read(sheet));
    expect(blocks.length, `${sheet} has no @media (prefers-reduced-motion: reduce) block`).toBeGreaterThan(0);
    expect(
      blocks.some((block) => hasUniversalReduceRule(block, '')),
      `${sheet} reduces motion for named selectors only, never for *`
    ).toBe(true);
  });

  it('the in-app toggle has a CSS path of its own, not just a framer one', () => {
    // The cell that is easy to miss: a user who turns the app's own switch on
    // while their OS preference is unset gets no media query at all.
    expect(hasUniversalReduceRule(read('src/index.css'), '.reduce-motion')).toBe(true);
  });

  it('AccessibilityContext is what puts that class on the document', () => {
    expect(context).toMatch(/classList\.add\('reduce-motion'\)/);
    expect(context).toMatch(/classList\.remove\('reduce-motion'\)/);
  });
});

describe('US-839: the instrument', () => {
  it('the rule matcher rejects a stylesheet that only names the selector', () => {
    expect(hasUniversalReduceRule('.reduce-motion, .reduce-motion * { color: red; }', '.reduce-motion')).toBe(false);
    // Scoped to the element itself, so nothing inside it is covered.
    expect(hasUniversalReduceRule('.reduce-motion { animation-duration: 0.01ms; }', '.reduce-motion')).toBe(false);
    expect(
      hasUniversalReduceRule('.reduce-motion, .reduce-motion * { animation-duration: 0.01ms !important; }', '.reduce-motion')
    ).toBe(true);
  });

  it('the rule matcher compares whole selectors, not substrings', () => {
    // A rename to .reduce-motion-disabled leaves html.reduce-motion matching
    // nothing. Substring matching called that a pass; it is the one mutant
    // that survived the first version of this file.
    const renamed = '.reduce-motion-disabled, .reduce-motion-disabled * { animation-duration: 0.01ms !important; }';
    expect(hasUniversalReduceRule(renamed, '.reduce-motion')).toBe(false);
    expect(hasUniversalReduceRule(renamed, '.reduce-motion-disabled')).toBe(true);
  });

  it('the media-block reader returns every block, not just the first', () => {
    const css =
      '@media (prefers-reduced-motion: reduce){.one{animation:none}}' +
      'a{color:red}' +
      '@media (prefers-reduced-motion: reduce){*{animation-duration:0.01ms}}' +
      'b{color:blue}';
    const blocks = osPreferenceBlocks(css);
    expect(blocks).toHaveLength(2);
    expect(blocks.join('')).not.toContain('color:blue');
    // Reading only blocks[0] -- the narrow one -- is the bug this replaced.
    expect(hasUniversalReduceRule(blocks[0], '')).toBe(false);
    expect(blocks.some((b) => hasUniversalReduceRule(b, ''))).toBe(true);
  });

  it('finds the infinite animations these rules exist to stop', () => {
    // If this drops to nothing, the assertions above are guarding an empty set.
    const infinite = STYLESHEETS.flatMap((sheet) =>
      [...stripCssComments(read(sheet)).matchAll(/animation:[^;]*\binfinite\b/g)].map((m) => m[0])
    );
    expect(infinite.length).toBeGreaterThanOrEqual(6);
  });
});
