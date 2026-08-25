import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * public/robots.txt is the only thing standing between a crawler and the app's
 * private surface, and it is easy to get wrong in a way that reads correctly.
 *
 * Under RFC 9309 a crawler picks the ONE most specific group matching its
 * user-agent and ignores every other group, "User-agent: *" included. A named
 * group therefore replaces the wildcard group rather than extending it.
 *
 * Before US-645 every private-path Disallow lived under "*" while 19 named
 * groups carried "Allow: /" and nothing else, so Googlebot, Bingbot, GPTBot,
 * ClaudeBot, PerplexityBot and Applebot were all explicitly permitted to crawl
 * /admin, /dashboard, /seo-dashboard, /search-traffic, /join and the faceted
 * query URLs. These assertions resolve rules the way a crawler does, so the
 * duplication in the file cannot be tidied away without failing here.
 */
const robots = readFileSync(path.resolve(__dirname, '../../public/robots.txt'), 'utf8');

interface Group {
  agents: string[];
  rules: Array<{ allow: boolean; pattern: string }>;
}

/** Parse into groups. Consecutive User-agent lines share one rule set. */
function parse(source: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let acceptingAgents = false;

  for (const raw of source.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      if (!current || !acceptingAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
        acceptingAgents = true;
      }
      current.agents.push(value.toLowerCase());
    } else if (key === 'allow' || key === 'disallow') {
      if (!current) continue;
      acceptingAgents = false;
      // An empty Disallow means "nothing is disallowed" and carries no pattern.
      if (key === 'disallow' && value === '') continue;
      current.rules.push({ allow: key === 'allow', pattern: value });
    }
  }
  return groups;
}

const groups = parse(robots);

/** The single group a crawler calling itself `agent` would obey. */
function groupFor(agent: string): Group {
  const needle = agent.toLowerCase();
  const named = groups.find((g) => g.agents.includes(needle));
  if (named) return named;
  const wildcard = groups.find((g) => g.agents.includes('*'));
  if (!wildcard) throw new Error('robots.txt has no wildcard group');
  return wildcard;
}

/** Turn a robots pattern into a regex: `*` is any run, `$` anchors the end. */
function toRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\\\$$/, '$');
  return new RegExp('^' + escaped);
}

/** Longest matching pattern wins; Allow wins an exact-length tie (RFC 9309). */
function isAllowed(group: Group, url: string): boolean {
  let best: { allow: boolean; length: number } | null = null;
  for (const { allow, pattern } of group.rules) {
    if (!toRegExp(pattern).test(url)) continue;
    if (!best || pattern.length > best.length || (pattern.length === best.length && allow)) {
      best = { allow, length: pattern.length };
    }
  }
  return best ? best.allow : true;
}

/**
 * Every crawler that indexes. Each must resolve to a group that blocks the
 * private surface -- not to the wildcard group it never reads.
 */
const INDEXERS = [
  'Googlebot',
  'Googlebot-Image',
  'Googlebot-Mobile',
  'Bingbot',
  'BingPreview',
  'DuckDuckBot',
  'Slurp',
  'YandexBot',
  'Baiduspider',
  'Google-Extended',
  'GPTBot',
  'OAI-SearchBot',
  'ClaudeBot',
  'PerplexityBot',
  'Applebot',
  'FacebookBot',
  'AhrefsBot',
  'SemrushBot',
  'ia_archiver',
];

/**
 * Routes that must never be crawled. Written without a trailing slash because
 * that is how src/App.tsx declares them, which is exactly what the old
 * "Disallow: /admin/" failed to match.
 */
const PRIVATE_URLS = [
  '/admin',
  '/admin/agents',
  '/admin-dashboard',
  '/dashboard',
  '/dashboard/settings',
  '/auth',
  '/auth/callback',
  '/auth/reset-password',
  '/oauth/callback',
  '/seo-dashboard',
  '/search-traffic',
  '/checkout/success',
  '/share',
  '/join',
];

const PUBLIC_URLS = [
  '/',
  '/pricing',
  '/blog',
  '/blog/some-post',
  '/guides',
  '/faq',
  '/picky-eater-quiz',
];

describe('robots.txt group resolution (US-645)', () => {
  it.each(INDEXERS)('%s resolves to a group of its own, not the wildcard', (agent) => {
    expect(groupFor(agent).agents).toContain(agent.toLowerCase());
  });

  it.each(INDEXERS)('%s is blocked from every private route', (agent) => {
    const group = groupFor(agent);
    for (const url of PRIVATE_URLS) {
      expect(isAllowed(group, url), `${agent} should not crawl ${url}`).toBe(false);
    }
  });

  it.each(INDEXERS)('%s can still crawl the public pages', (agent) => {
    const group = groupFor(agent);
    for (const url of PUBLIC_URLS) {
      expect(isAllowed(group, url), `${agent} should be able to crawl ${url}`).toBe(true);
    }
  });

  it('blocks the faceted query URLs that would burn crawl budget', () => {
    for (const agent of ['Googlebot', 'Bingbot', '*']) {
      const group = groupFor(agent);
      for (const url of ['/blog?sort=new', '/recipes?filter=quick', '/blog?page=4']) {
        expect(isAllowed(group, url), `${agent} should not crawl ${url}`).toBe(false);
      }
    }
  });

  it('still blocks the private routes for an unnamed crawler', () => {
    const wildcard = groupFor('SomeCrawlerWeHaveNeverHeardOf');
    expect(wildcard.agents).toContain('*');
    for (const url of PRIVATE_URLS) {
      expect(isAllowed(wildcard, url)).toBe(false);
    }
  });
});

describe('robots.txt allow and block lists (US-645)', () => {
  /**
   * These fetch a URL a person deliberately shared and render a card. They do
   * not crawl, so the private-path block is deliberately absent: an invite link
   * has to unfurl in a chat app.
   */
  it.each([
    'ChatGPT-User',
    'facebookexternalhit',
    'Twitterbot',
    'LinkedInBot',
    'Pinterestbot',
    'WhatsApp',
    'TelegramBot',
  ])('%s can still render a preview for a shared invite link', (agent) => {
    expect(isAllowed(groupFor(agent), '/join')).toBe(true);
  });

  it.each([
    'CCBot',
    'anthropic-ai',
    'cohere-ai',
    'Bytespider',
    'Amazonbot',
    'MJ12bot',
    'DataForSeoBot',
  ])('%s is blocked from the whole site', (agent) => {
    const group = groupFor(agent);
    expect(group.agents).toContain(agent.toLowerCase());
    for (const url of ['/', ...PUBLIC_URLS, ...PRIVATE_URLS]) {
      expect(isAllowed(group, url), `${agent} should not crawl ${url}`).toBe(false);
    }
  });

  it('lets the SEO tools we use crawl the site so our own audits have data', () => {
    // Blocking these never hid the backlink profile -- that comes from crawling
    // other people's sites -- it only kept tryeatpal.com out of their link
    // graphs and left our own site audits empty.
    for (const agent of ['AhrefsBot', 'SemrushBot']) {
      expect(isAllowed(groupFor(agent), '/pricing'), `${agent} should reach public pages`).toBe(
        true
      );
    }
  });

  it('declares the sitemap and the preferred host', () => {
    expect(robots).toMatch(/^Sitemap: https:\/\/tryeatpal\.com\/sitemap\.xml$/m);
    expect(robots).toMatch(/^Host: https:\/\/tryeatpal\.com$/m);
  });

  it('has no group that allows crawling without the private-path block', () => {
    const previewOnly = new Set([
      'chatgpt-user',
      'applebot-extended',
      'facebookexternalhit',
      'twitterbot',
      'linkedinbot',
      'pinterestbot',
      'whatsapp',
      'telegrambot',
    ]);
    for (const group of groups) {
      if (group.agents.every((a) => previewOnly.has(a))) continue;
      const blocksAdmin = !isAllowed(group, '/admin');
      expect(blocksAdmin, `group [${group.agents.join(', ')}] does not block /admin`).toBe(true);
    }
  });
});
