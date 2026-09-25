import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * US-817: stylesheets imported after Tailwind must not colour Tailwind's own
 * utilities.
 *
 * `src/main.tsx` imports `index.css` (which emits every Tailwind utility) and
 * then `styles/mobile-first.css`. Anything the second file declares therefore
 * lands later in the bundle and beats the first at equal specificity -- no
 * !important needed. That is fine for the classes mobile-first.css owns
 * (`.text-muted`, `.text-small`, `.text-readable`), and a silent trap for the
 * ones Tailwind owns.
 *
 * It cost three WCAG failures. `small, .text-small, .text-xs` set
 * `color: hsl(var(--foreground))`, and `text-xs` is in the shadcn Badge's base
 * class list -- so every `<Badge variant="secondary">` and
 * `<Badge variant="default">` rendered slate #0f1729 on its own brand fill
 * instead of the white `text-secondary-foreground` / `text-primary-foreground`
 * asked for (3.24:1 and 3.17:1), and the ~490 `text-xs text-muted-foreground`
 * helper labels across src/ were flattened to full foreground. One selector
 * further down, `.text-secondary` was forced to `--muted-foreground` with
 * !important, greying out the four call sites that wanted the brand green.
 *
 * The rule this pins: in a post-Tailwind stylesheet, a selector naming a
 * font-size utility (`text-xs` … `text-9xl`) or a semantic-token colour
 * utility (`text-primary`, `text-secondary-foreground`, …) may not declare
 * `color`. Size utilities get size, colour utilities get colour.
 */

const POST_TAILWIND_STYLESHEETS = ['src/styles/mobile-first.css'];

const FONT_SIZE_UTILITIES = [
  'text-xs',
  'text-sm',
  'text-base',
  'text-lg',
  'text-xl',
  'text-2xl',
  'text-3xl',
  'text-4xl',
  'text-5xl',
  'text-6xl',
  'text-7xl',
  'text-8xl',
  'text-9xl',
];

/** The semantic tokens declared on :root in src/index.css. */
const TOKENS = [
  'background',
  'foreground',
  'card',
  'popover',
  'primary',
  'secondary',
  'muted',
  'accent',
  'destructive',
  'border',
  'input',
  'ring',
];

const TOKEN_COLOUR_UTILITIES = TOKENS.flatMap((token) => [
  `text-${token}`,
  `text-${token}-foreground`,
]).filter(
  // `.text-muted` is mobile-first.css's own class, not a Tailwind utility:
  // Tailwind emits `text-muted-foreground` for that token, never `text-muted`.
  (name) => name !== 'text-muted',
);

const PROTECTED = [...FONT_SIZE_UTILITIES, ...TOKEN_COLOUR_UTILITIES];

/**
 * Split a stylesheet into { selector, declarations } pairs. Comments are
 * stripped first so a class name mentioned in prose (this file's own rationale
 * comments do exactly that) is never read as a selector.
 */
function rules(css: string): Array<{ selector: string; body: string }> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Array<{ selector: string; body: string }> = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(withoutComments)) !== null) {
    out.push({ selector: match[1].trim(), body: match[2] });
  }
  return out;
}

/** Selector lists are comma-separated; each part may be a compound selector. */
function classesIn(selector: string): Set<string> {
  return new Set(
    [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]),
  );
}

function declaresColour(body: string): boolean {
  return /(^|;)\s*color\s*:/.test(body);
}

describe('post-Tailwind stylesheets do not hijack Tailwind utilities', () => {
  for (const file of POST_TAILWIND_STYLESHEETS) {
    const css = readFileSync(path.resolve(process.cwd(), file), 'utf8');
    const parsed = rules(css);

    it(`${file} parses into rules`, () => {
      expect(parsed.length).toBeGreaterThan(20);
    });

    it(`${file} sets no colour on a Tailwind font-size or token utility`, () => {
      const offenders: string[] = [];
      for (const { selector, body } of parsed) {
        if (!declaresColour(body)) continue;
        const named = classesIn(selector);
        for (const utility of PROTECTED) {
          if (named.has(utility)) offenders.push(`${selector} -> .${utility}`);
        }
      }
      expect(offenders).toEqual([]);
    });

    it(`${file} still owns its own classes`, () => {
      // Guards against "fixing" the rule above by deleting the file's purpose.
      const selectors = parsed.map((r) => r.selector).join(' | ');
      expect(selectors).toContain('.text-small');
      expect(selectors).toContain('.text-muted');
    });
  }
});

/**
 * Layout, not colour: the same load order let mobile-first.css re-space the
 * whole app on phones.
 *
 * `[class*="back"]` was meant for back buttons and matched `bg-background`
 * and every shadcn Button (`ring-offset-background`), padding them 12px 20px
 * at utility specificity: a grocery row measured 86px instead of 62px at
 * 390px. A bare `section { padding: 32px 16px }` below 768px turned Sonner's
 * empty toast container into a 64px block above every dashboard page, and
 * `h1`-`h4` / `p` bottom margins stacked on every `gap-*` and `space-y-*`.
 * The Grocery page carried `max-md:!pt-0` and `max-md:mb-0` to undo them.
 */

/** Split a selector list on top-level commas, so `:where(a, b)` stays whole. */
function selectorParts(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of selector) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}

/** A part that is only a type selector (`section`, `h1`, `p`), no class or :where. */
const BARE_ELEMENT = /^[a-z][a-z0-9]*$/;

function declaresBoxSpacing(body: string): boolean {
  return /(^|;)\s*(margin|padding)(-(top|right|bottom|left|block|inline)(-(start|end))?)?\s*:/.test(body);
}

describe('post-Tailwind stylesheets do not re-space Tailwind layouts', () => {
  for (const file of POST_TAILWIND_STYLESHEETS) {
    const css = readFileSync(path.resolve(process.cwd(), file), 'utf8');
    const parsed = rules(css);

    it(`${file} has no class-attribute substring selectors`, () => {
      // [class*=], [class^=], [class$=], [class~=], [class|=]: in a Tailwind
      // tree these match colour tokens, not components. Opt in with a class.
      const offenders = parsed
        .map((r) => r.selector)
        .filter((selector) => /\[\s*class\s*[*^$~|]=/.test(selector));
      expect(offenders).toEqual([]);
    });

    it(`${file} gives no bare element a margin or padding`, () => {
      const offenders: string[] = [];
      for (const { selector, body } of parsed) {
        if (!declaresBoxSpacing(body)) continue;
        for (const part of selectorParts(selector)) {
          if (BARE_ELEMENT.test(part)) offenders.push(`${part} { ${body.trim()} }`);
        }
      }
      expect(offenders).toEqual([]);
    });

    it(`${file} does not pad <section>`, () => {
      // Named on its own because it is the one that moved every dashboard
      // page: Sonner renders an empty <section> inside #root.
      const padded = parsed.filter(
        ({ selector, body }) =>
          declaresBoxSpacing(body) &&
          selectorParts(selector).some((part) => /(^|[\s>+~(])section(?![\w-])/.test(part)),
      );
      expect(padded).toEqual([]);
    });

    it(`${file} does not redefine a Tailwind class`, () => {
      // Later in the bundle, a copy beats Tailwind's own variants: a local
      // `.sr-only` kept `md:not-sr-only` labels hidden on desktop, and a local
      // `.container { padding: 16px }` replaced the `py-*` next to it.
      const redefined = parsed
        .map((r) => r.selector)
        .filter((selector) =>
          selectorParts(selector).some((part) => /^\.(sr-only|container|pb-safe|pt-safe)$/.test(part)),
        );
      expect(redefined).toEqual([]);
    });

    it(`${file} keeps the opt-in classes that replaced the substring rules`, () => {
      const selectors = parsed.map((r) => r.selector).join(' | ');
      expect(selectors).toContain('.back-button');
      expect(selectors).toContain('.logo');
    });
  }
});

describe('the Badge base class list is why this matters', () => {
  it('shadcn Badge still carries text-xs, so a colour on it would leak again', () => {
    const badge = readFileSync(
      path.resolve(process.cwd(), 'src/components/ui/badge.tsx'),
      'utf8',
    );
    expect(badge).toContain('text-xs');
    expect(badge).toContain('bg-secondary text-secondary-foreground');
    expect(badge).toContain('bg-primary text-primary-foreground');
  });
});
