import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { comparisonPages, comparisonPath } from '@/lib/comparison-content';

/**
 * US-647. A page nothing links to and nothing prerenders is a page that does not
 * exist as far as search is concerned. These assertions make adding a sixth
 * competitor to comparisonTargets fail loudly until it is also submitted,
 * prerendered and linked, instead of shipping as an orphan.
 *
 * The sitemap lives in two places for two runtimes -- the Supabase Deno function
 * that generates it, and the hardcoded fallback the Cloudflare Pages Function
 * serves when that call fails -- so they cannot share an import. They are pinned
 * to each other here instead.
 */
const repo = (rel: string) => readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');

const sitemapFn = repo('supabase/functions/generate-sitemap/index.ts');
const fallbackFn = repo('functions/sitemap.xml.ts');
const prerenderRoutes = JSON.parse(repo('scripts/prerender-routes.json')) as { static: string[] };
const robotsTxt = repo('public/robots.txt');

const expectedPaths = ['/compare', ...comparisonPages.map((p) => comparisonPath(p.slug))];

describe('comparison pages are submitted and prerendered (US-647)', () => {
  it.each(expectedPaths)('%s is in the generated sitemap', (route) => {
    expect(sitemapFn).toContain(`path: '${route}'`);
  });

  it.each(expectedPaths)('%s is in the fallback sitemap', (route) => {
    expect(fallbackFn).toContain(`https://tryeatpal.com${route}<`);
  });

  it.each(expectedPaths)('%s is prerendered', (route) => {
    expect(prerenderRoutes.static).toContain(route);
  });

  it('keeps the two sitemap sources agreeing on their static routes', () => {
    const generated = [...sitemapFn.matchAll(/\{ path: '([^']+)'/g)].map((m) => m[1]);
    const fallback = [...fallbackFn.matchAll(/<loc>https:\/\/tryeatpal\.com([^<]*)<\/loc>/g)].map(
      (m) => m[1] || '/'
    );
    expect(new Set(fallback)).toEqual(new Set(generated));
  });

  it('prerenders every route the sitemap declares as static', () => {
    const generated = [...sitemapFn.matchAll(/\{ path: '([^']+)'/g)].map((m) => m[1]);
    const missing = generated.filter((route) => !prerenderRoutes.static.includes(route));
    // /authors self-noindexes while blog_authors is empty, which the sitemap file
    // already documents; everything else must be prerendered.
    expect(missing).toEqual([]);
  });
});

describe('comparison pages are reachable by a crawler (US-647)', () => {
  it('is not blocked by robots.txt for any indexing crawler', () => {
    // US-645 restructured robots.txt so every allowed group is "Allow: /" plus a
    // private-path denylist. /compare is not on that denylist, so it is already
    // crawlable; an explicit Allow line would be a no-op repeated in 20 groups.
    // What matters is that nobody later adds it to the denylist.
    expect(robotsTxt).not.toMatch(/^Disallow: \/compare/m);
  });

  it.each([
    ['the footer', 'src/components/Footer.tsx'],
    ['the pricing page', 'src/pages/Pricing.tsx'],
    ['the guides index', 'src/pages/pseo/GuidesIndex.tsx'],
    // The homepage is the other page people are on while they are comparing, and it
    // was the one page in this list that never linked here. Six finished comparison
    // pages had earned two impressions between them.
    ['the homepage', 'src/pages/Landing.tsx'],
  ])('is linked from %s', (_label, file) => {
    expect(repo(file)).toMatch(/to="\/compare"/);
  });

  it('links the guides index to /compare outside the empty state', () => {
    // The pre-existing cross-links on that page sit inside the "no guides loaded"
    // branch, which does not render once the library is populated. A crawl path
    // that disappears on success is not a crawl path.
    const source = repo('src/pages/pseo/GuidesIndex.tsx');
    const header = source.slice(source.indexOf('<header'), source.indexOf('</header>'));
    expect(header).toMatch(/to="\/compare"/);
  });
});
