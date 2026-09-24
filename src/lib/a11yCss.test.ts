/**
 * The accessibility classes in index.css must help the people who turn them
 * on, not break the page for them.
 *
 * - Screen reader mode used to hide every [aria-hidden="true"] element. That
 *   is every icon, which aria-hidden already keeps from a screen reader, so the
 *   rule did nothing for screen reader users and blanked the UI for everyone
 *   else using the mode.
 * - The dyslexia font set line-height on `*`, which stretched buttons, badges
 *   and inputs, and swapped the font on code and icons too.
 * - Simplified UI removed background-image on `*`, which also took out images
 *   drawn as backgrounds, not just gradients.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule {
  selectors: string[];
  body: string;
}

/** Innermost rules only (selector { declarations }), which is all these checks need. */
const rules: Rule[] = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selectors: m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
  body: m[2],
}));

const rulesFor = (pred: (selector: string) => boolean) => rules.filter((r) => r.selectors.some(pred));

describe('index.css accessibility modes', () => {
  it('parses rules, so the checks below are not vacuous', () => {
    expect(rules.length).toBeGreaterThan(50);
    expect(rulesFor((s) => s.startsWith('.dyslexia-font')).length).toBeGreaterThan(0);
  });

  it('never hides [aria-hidden] elements', () => {
    const hiding = rulesFor((s) => s.includes('[aria-hidden')).filter((r) => /display\s*:\s*none/.test(r.body));
    expect(hiding.map((r) => r.selectors.join(', '))).toEqual([]);
  });

  it('has no .screen-reader-optimized rule that hides anything', () => {
    const hiding = rulesFor((s) => s.includes('.screen-reader-optimized')).filter((r) =>
      /display\s*:\s*none|visibility\s*:\s*hidden/.test(r.body)
    );
    expect(hiding).toEqual([]);
  });

  it('dyslexia mode sets line-height on text blocks, never on *', () => {
    const star = rulesFor((s) => s.startsWith('.dyslexia-font') && /\*/.test(s)).filter((r) =>
      /line-height\s*:/.test(r.body)
    );
    expect(star.map((r) => r.selectors.join(', '))).toEqual([]);

    const lineHeight = rulesFor((s) => s.startsWith('.dyslexia-font')).filter((r) => /line-height\s*:/.test(r.body));
    const targets = lineHeight.flatMap((r) => r.selectors);
    for (const el of ['body', 'p', 'li', 'label', 'dd']) {
      expect(targets, `no dyslexia line-height for ${el}`).toContain(`.dyslexia-font ${el}`);
    }
  });

  it('dyslexia mode leaves code, kbd, pre and svg in their own font', () => {
    const fontRules = rulesFor((s) => s.startsWith('.dyslexia-font')).filter((r) => /font-family\s*:/.test(r.body));
    expect(fontRules.length).toBeGreaterThan(0);
    for (const r of fontRules) {
      for (const sel of r.selectors.filter((s) => s.includes('*'))) {
        for (const tag of ['code', 'kbd', 'pre', 'svg']) {
          expect(sel, `${sel} does not exclude ${tag}`).toContain(`:not(${tag})`);
        }
      }
    }
  });

  it('simplified UI is scoped to shadows and gradients, not *', () => {
    const star = rulesFor((s) => s === '.simplified-ui *' || s === '.simplified-ui');
    expect(star.map((r) => r.selectors.join(', '))).toEqual([]);
    const bgNone = rulesFor((s) => s.startsWith('.simplified-ui')).filter((r) => /background-image\s*:\s*none/.test(r.body));
    expect(bgNone.length).toBeGreaterThan(0);
    for (const r of bgNone) {
      expect(r.selectors.every((s) => s.includes('gradient'))).toBe(true);
    }
  });
});
