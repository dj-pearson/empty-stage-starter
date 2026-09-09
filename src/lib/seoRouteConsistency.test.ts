import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseRobots, groupForAgent, isAllowedByGroup } from './robotsTxt';

/**
 * US-832: three lists have to agree, and nothing made them.
 *
 *   scripts/prerender-routes.json   what gets static HTML at build time
 *   functions/sitemap.xml.ts        the fallback sitemap when the edge fn fails
 *   public/robots.txt               what a crawler is allowed to fetch
 *   src/App.tsx                     what actually exists
 *
 * They are in four formats in four directories and were kept in step by hand.
 * The expensive failure is quiet: add a marketing page, put it in the sitemap,
 * forget the prerender list, and Google indexes an empty SPA shell for a page
 * you are actively promoting. The reverse wastes build time producing static
 * HTML for a page robots.txt tells crawlers to ignore.
 *
 * They were consistent when this was written -- 29 routes on both sides,
 * nothing blocked, nothing missing. This keeps them that way.
 */

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const prerendered: string[] = JSON.parse(read('scripts/prerender-routes.json')).static;

const sitemapFallback = [
  ...read('functions/sitemap.xml.ts').matchAll(/<loc>https:\/\/tryeatpal\.com(\/[^<]*)<\/loc>/g),
].map((m) => (m[1].length > 1 ? m[1].replace(/\/$/, '') : '/'));

const appRoutes = [...read('src/App.tsx').matchAll(/path="([^"]*)"/g)].map((m) => m[1]);

/** Does a concrete URL match any route pattern App.tsx declares? */
function isRealRoute(url: string): boolean {
  return appRoutes.some((pattern) => {
    if (pattern === url) return true;
    const rx = '^' + pattern.replace(/:[^/]+/g, '[^/]+').replace(/\*/g, '.*') + '$';
    return new RegExp(rx).test(url);
  });
}

describe('the SEO route lists agree', () => {
  it('found all four lists', () => {
    // Assert the instrument. A format change that stopped matching would turn
    // every comparison below into an empty-set tautology.
    expect(prerendered.length).toBeGreaterThanOrEqual(25);
    expect(sitemapFallback.length).toBeGreaterThanOrEqual(25);
    expect(appRoutes.length).toBeGreaterThanOrEqual(40);
  });

  it('prerenders every route the fallback sitemap advertises', () => {
    // Missing here means Google is pointed at a page that serves an empty shell.
    expect(sitemapFallback.filter((u) => !prerendered.includes(u))).toEqual([]);
  });

  it('advertises every route it prerenders', () => {
    expect(prerendered.filter((u) => !sitemapFallback.includes(u))).toEqual([]);
  });

  it('prerenders nothing that is not a real route', () => {
    expect(prerendered.filter((u) => !isRealRoute(u))).toEqual([]);
  });

  it('advertises nothing that is not a real route', () => {
    expect(sitemapFallback.filter((u) => !isRealRoute(u))).toEqual([]);
  });
});

describe('robots.txt lets crawlers reach what we publish', () => {
  const groups = parseRobots(read('public/robots.txt'));

  // Resolved per agent, because a named group REPLACES the wildcard group --
  // checking only "*" would miss a rule that blocks Googlebot specifically.
  it.each(['Googlebot', 'Bingbot', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Applebot', '*'])(
    '%s may fetch every prerendered route',
    (agent) => {
      const group = groupForAgent(groups, agent);
      const blocked = prerendered.filter((url) => !isAllowedByGroup(group, url));
      expect(blocked).toEqual([]);
    },
  );

  it('still blocks the private surface, so this is not passing by being permissive', () => {
    // Without this, deleting every Disallow would make the block above pass.
    const google = groupForAgent(groups, 'Googlebot');
    for (const url of ['/admin', '/dashboard', '/seo-dashboard', '/join']) {
      expect(isAllowedByGroup(google, url)).toBe(false);
    }
  });
});
