import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { solutionPages, solutionPath } from '@/lib/solutions-content';

/**
 * US-649, mirroring src/lib/comparison-discovery.test.ts. A page nothing links
 * to and nothing prerenders is a page that does not exist as far as search is
 * concerned, and this cluster has the extra problem that its URLs were
 * advertised in llms.txt and then 301'd away for months. Adding a fourth
 * situation page fails here until it is also submitted, prerendered and linked.
 *
 * The sitemap lives in two places for two runtimes -- the Supabase Deno function
 * that generates it and the hardcoded fallback the Cloudflare Pages Function
 * serves when that call fails -- so they cannot share an import and are pinned
 * to each other instead.
 */
const repo = (rel: string) => readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');

const sitemapFn = repo('supabase/functions/generate-sitemap/index.ts');
const fallbackFn = repo('functions/sitemap.xml.ts');
const prerenderRoutes = JSON.parse(repo('scripts/prerender-routes.json')) as { static: string[] };
const robotsTxt = repo('public/robots.txt');
const redirects = repo('public/_redirects');

const expectedPaths = ['/solutions', ...solutionPages.map((p) => solutionPath(p.slug))];

describe('solutions pages are submitted and prerendered (US-649)', () => {
  it.each(expectedPaths)('%s is in the generated sitemap', (route) => {
    expect(sitemapFn).toContain(`path: '${route}'`);
  });

  it.each(expectedPaths)('%s is in the fallback sitemap', (route) => {
    expect(fallbackFn).toContain(`https://tryeatpal.com${route}<`);
  });

  it.each(expectedPaths)('%s is prerendered', (route) => {
    expect(prerenderRoutes.static).toContain(route);
  });
});

describe('the /solutions catch-all redirect is retired (US-649)', () => {
  it('no longer sends the whole namespace to /guides', () => {
    // This is the line the story exists to remove: while it was there, every
    // URL under /solutions/ 301'd to a guides index that did not answer the
    // query, including the one public/llms.txt advertised by name.
    expect(redirects).not.toMatch(/^\/solutions\/\*/m);
  });

  it('points the advertised ARFID URL at the page that was built for it', () => {
    expect(redirects).toMatch(/^\/solutions\/arfid-meal-planning \/solutions\/arfid 301$/m);
  });

  it('leaves the /features/* redirects alone', () => {
    // A separate decision, explicitly out of scope for this story.
    expect(redirects).toMatch(/^\/features\/\* \/guides 301$/m);
    expect(redirects).toMatch(/^\/features\/kids-meal-planning \/guides 301$/m);
  });

  it('keeps no redirect that would shadow a published page', () => {
    for (const page of solutionPages) {
      const shadow = new RegExp(`^${solutionPath(page.slug)}\\s`, 'm');
      expect(redirects).not.toMatch(shadow);
    }
  });
});

describe('solutions pages are reachable by a crawler (US-649)', () => {
  it('is not blocked by robots.txt for any indexing crawler', () => {
    // US-645 restructured robots.txt so every allowed group is "Allow: /" plus a
    // private-path denylist. /solutions is not on that denylist, so it is
    // already crawlable and an explicit Allow line would be a no-op repeated in
    // 20 groups. What matters is that nobody later adds it to the denylist.
    expect(robotsTxt).not.toMatch(/^Disallow: \/solutions/m);
  });

  it.each([
    ['the footer', 'src/components/Footer.tsx'],
    ['the guides index', 'src/pages/pseo/GuidesIndex.tsx'],
  ])('is linked from %s', (_label, file) => {
    expect(repo(file)).toMatch(/to="\/solutions"/);
  });

  it('links the guides index to /solutions outside the empty state', () => {
    // Same trap as US-647: the pre-existing cross-links on that page sit inside
    // the "no guides loaded" branch, which stops rendering once the library
    // populates. A crawl path that disappears on success is not a crawl path.
    const source = repo('src/pages/pseo/GuidesIndex.tsx');
    const header = source.slice(source.indexOf('<header'), source.indexOf('</header>'));
    expect(header).toMatch(/to="\/solutions"/);
  });

  it('routes both /solutions and /solutions/:slug in the app', () => {
    const app = repo('src/App.tsx');
    expect(app).toMatch(/path="\/solutions"/);
    expect(app).toMatch(/path="\/solutions\/:slug"/);
  });
});
