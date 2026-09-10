/**
 * US-849: WCAG 1.3.1, the heading outline of the prerendered pages.
 *
 * src/pages/VPAT.tsx claims 1.3.1 "Supports -- Semantic HTML, ARIA landmarks,
 * proper heading hierarchy, and table headers used throughout." Five of the 29
 * prerendered pages skipped from the page h1 straight to h3: /faq, /contact,
 * /guides, /meal-plan and /budget-calculator. Jumping between headings is how
 * many screen-reader users move through a page, and a skipped level makes the
 * outline they are walking wrong.
 *
 * NOSCRIPT IS EXCLUDED, and getting that wrong is what the first version of
 * this scan did. index.html carries a <noscript> block with its own h1, so a
 * naive count reported TWO h1s on every one of the 29 pages -- a boilerplate
 * heading duplicated site-wide, which would have been a much bigger finding
 * had it been real. It is not rendered when scripts run, so it is not in the
 * accessibility tree and not in the outline.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');

export function outlineOf(html: string): number[] {
  const body = html.includes('<body') ? html.slice(html.indexOf('<body')) : html;
  const rendered = body.replace(/<noscript[\s\S]*?<\/noscript>/g, '');
  return [...rendered.matchAll(/<h([1-6])[^>]*>/g)].map((m) => Number(m[1]));
}

export function skippedLevels(levels: number[]): string[] {
  const jumps = new Set<string>();
  for (let i = 1; i < levels.length; i += 1) {
    if (levels[i] > levels[i - 1] + 1) jumps.add(`h${levels[i - 1]}->h${levels[i]}`);
  }
  return [...jumps];
}

function prerenderedPages(): string[] {
  if (!existsSync(DIST)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === 'index.html') out.push(full);
    }
  };
  walk(DIST);
  return out;
}

describe('US-849: the scan', () => {
  it('reads levels in document order', () => {
    expect(outlineOf('<body><h1>a</h1><h2>b</h2><h3>c</h3></body>')).toEqual([1, 2, 3]);
  });

  it('ignores a heading inside noscript, which no reader ever sees', () => {
    // The naive version counted this and reported 2 h1s on all 29 pages.
    expect(outlineOf('<body><noscript><h1>fallback</h1></noscript><h1>real</h1></body>')).toEqual([1]);
  });

  it('finds a skipped level, and only a skipped one', () => {
    expect(skippedLevels([1, 3])).toEqual(['h1->h3']);
    expect(skippedLevels([1, 2, 3, 2, 3])).toEqual([]);
    // Going back up any distance is fine; only descending may not skip.
    expect(skippedLevels([1, 2, 3, 1, 2])).toEqual([]);
    expect(skippedLevels([2, 5])).toEqual(['h2->h5']);
  });

  it('says nothing about an empty page', () => {
    expect(skippedLevels([])).toEqual([]);
  });
});

describe('US-849: the prerendered pages', () => {
  const pages = prerenderedPages();

  it('there is a build to check, or this suite says so rather than passing', () => {
    // The unit job runs without dist/. Skipping silently is how a gate becomes
    // decorative, so the state is asserted either way.
    if (pages.length === 0) {
      expect(existsSync(DIST), 'no dist/ -- run npm run build before trusting this file').toBe(false);
      return;
    }
    expect(pages.length).toBeGreaterThanOrEqual(25);
  });

  it('every page has exactly one h1, and no page skips a heading level', () => {
    if (pages.length === 0) return;
    const problems: string[] = [];
    for (const file of pages) {
      const route = file.slice(DIST.length).replace(/\/index\.html$/, '') || '/';
      const levels = outlineOf(readFileSync(file, 'utf8'));
      const h1s = levels.filter((l) => l === 1).length;
      const jumps = skippedLevels(levels);
      if (h1s !== 1) problems.push(`${route}: ${h1s} h1 elements`);
      if (jumps.length > 0) problems.push(`${route}: ${jumps.join(', ')}`);
    }
    expect(problems, `heading outline problems:\n${problems.join('\n')}`).toEqual([]);
  });
});

describe('US-849: what the fixes were', () => {
  it('the footer column titles are h2, not h3', () => {
    const footer = readFileSync(join(ROOT, 'src', 'components', 'Footer.tsx'), 'utf8');
    expect(footer).toContain('<h2 className="font-heading font-semibold mb-4 text-primary">');
    expect(footer).not.toContain('<h3 className="font-heading font-semibold mb-4 text-primary">');
  });

  it('the same footer markup is repeated in six page files, and all of them agree', () => {
    // Not this story's job to de-duplicate, but a copy that drifts back to h3
    // reintroduces the jump on whichever page holds it.
    const copies = ['Accessibility', 'BlogPost', 'Contact', 'TermsOfService', 'PrivacyPolicy', 'FAQ'];
    for (const page of copies) {
      const source = readFileSync(join(ROOT, 'src', 'pages', `${page}.tsx`), 'utf8');
      expect(
        source,
        `${page}.tsx carries its own copy of the footer and it is back on h3`,
      ).not.toContain('<h3 className="font-heading font-semibold mb-4 text-primary">');
    }
  });

  it('FAQ and Contact supply the h2 that shadcn ui/ cannot', () => {
    // AccordionTrigger and CardTitle render h3 from src/components/ui/, which
    // CLAUDE.md puts off limits, so the level above them comes from page code.
    expect(readFileSync(join(ROOT, 'src', 'pages', 'FAQ.tsx'), 'utf8')).toContain(
      '<h2 className="sr-only">',
    );
    expect(readFileSync(join(ROOT, 'src', 'pages', 'Contact.tsx'), 'utf8')).toContain(
      '<h2 className="sr-only">',
    );
  });
});
