import { describe, it, expect } from 'vitest';
import path from 'node:path';

import { outputPathFor } from '../../scripts/prerender.mjs';

const rel = (route: string) => {
  const full = outputPathFor(route);
  const dist = full.slice(0, full.indexOf(`${path.sep}dist${path.sep}`) + 6);
  return full.slice(dist.length).split(path.sep).join('/');
};

/**
 * Cloudflare Pages serves a directory's index.html at the trailing-slash URL and 308s
 * the bare one to it. Writing dist/pricing/index.html therefore made /pricing a
 * redirect, while the sitemap submitted /pricing and every page declared /pricing as
 * its canonical -- so the sitemap was 180 redirects, each landing on a page naming the
 * URL that had just redirected as its canonical.
 *
 * Confirmed against production on 2026-09-10: every sitemap route except "/" answered
 * 308, and /arfid/what-is-arfid/ served canonical /arfid/what-is-arfid.
 */
describe('prerender output layout', () => {
  it('writes a flat file, not a directory index', () => {
    expect(rel('/pricing')).toBe('pricing.html');
    expect(rel('/faq')).toBe('faq.html');
  });

  it('keeps the homepage at dist/index.html', () => {
    expect(rel('/')).toBe('index.html');
  });

  it('nests without turning a parent route into a directory index', () => {
    // dist/compare.html and dist/compare/ coexist: a file and a directory of the same
    // stem are not in conflict.
    expect(rel('/compare')).toBe('compare.html');
    expect(rel('/compare/eatpal-vs-mealime')).toBe('compare/eatpal-vs-mealime.html');
    expect(rel('/arfid/what-is-arfid')).toBe('arfid/what-is-arfid.html');
    expect(rel('/accessibility/vpat')).toBe('accessibility/vpat.html');
  });

  it('writes blog posts and guides beside their hub', () => {
    expect(rel('/blog')).toBe('blog.html');
    expect(rel('/blog/safe-foods-that-travel')).toBe('blog/safe-foods-that-travel.html');
    expect(rel('/guides')).toBe('guides.html');
    expect(rel('/guides/foods/chicken-nuggets')).toBe('guides/foods/chicken-nuggets.html');
  });

  it('never writes an index.html below the root', () => {
    for (const route of ['/pricing', '/compare/eatpal-vs-mealime', '/blog/a-post']) {
      expect(rel(route)).not.toContain('index.html');
    }
  });
});
