/**
 * Unit tests for SEO audit logic (US-505).
 * Run with: `deno test functions/_shared/seo-audit-logic_test.ts`
 */

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  parseSitemapUrls,
  extractMeta,
  auditPage,
  detectDuplicates,
  dedupeAgainstPrior,
  fingerprint,
  isSameHost,
} from './seo-audit-logic.ts';

Deno.test('parseSitemapUrls', () => {
  const xml = `<urlset><url><loc>https://tryeatpal.com/</loc></url><url><loc> https://tryeatpal.com/blog </loc></url></urlset>`;
  assertEquals(parseSitemapUrls(xml), ['https://tryeatpal.com/', 'https://tryeatpal.com/blog']);
});

Deno.test('extractMeta: title/description/canonical/jsonld/links', () => {
  const html = `<html><head><title>Home</title>
    <meta name="description" content="Best app">
    <link rel="canonical" href="https://tryeatpal.com/">
    <script type="application/ld+json">{}</script></head>
    <body><a href="/blog">Blog</a><a href="https://external.com/x">ext</a></body></html>`;
  const m = extractMeta('https://tryeatpal.com/', html);
  assertEquals(m.title, 'Home');
  assertEquals(m.description, 'Best app');
  assertEquals(m.canonical, 'https://tryeatpal.com/');
  assertEquals(m.hasJsonLd, true);
  assertEquals(m.internalLinks, ['/blog']); // external dropped
});

Deno.test('auditPage: flags missing fields + missing JSON-LD on blog', () => {
  const findings = auditPage({
    url: 'https://tryeatpal.com/blog/post-1',
    title: null,
    description: null,
    canonical: null,
    hasJsonLd: false,
    internalLinks: [],
  });
  const issues = findings.map((f) => f.issue);
  assertEquals(issues.includes('missing title'), true);
  assertEquals(issues.includes('missing meta description'), true);
  assertEquals(issues.includes('missing canonical'), true);
  assertEquals(issues.includes('missing JSON-LD'), true);
});

Deno.test('auditPage: no JSON-LD finding on a non-blog page', () => {
  const findings = auditPage({
    url: 'https://tryeatpal.com/pricing',
    title: 'Pricing',
    description: 'Plans',
    canonical: 'https://tryeatpal.com/pricing',
    hasJsonLd: false,
    internalLinks: [],
  });
  assertEquals(findings.length, 0);
});

Deno.test('detectDuplicates: shared title flagged on both pages', () => {
  const pages = [
    { url: 'https://x/a', title: 'Same', description: 'd1', canonical: null, hasJsonLd: false, internalLinks: [] },
    { url: 'https://x/b', title: 'Same', description: 'd2', canonical: null, hasJsonLd: false, internalLinks: [] },
    { url: 'https://x/c', title: 'Unique', description: 'd3', canonical: null, hasJsonLd: false, internalLinks: [] },
  ];
  const dups = detectDuplicates(pages).filter((f) => f.issue.startsWith('duplicate title'));
  assertEquals(dups.map((f) => f.url).sort(), ['https://x/a', 'https://x/b']);
});

Deno.test('dedupeAgainstPrior: drops findings already open', () => {
  const findings = [
    { url: 'https://x/a', issue: 'missing title' },
    { url: 'https://x/b', issue: 'missing canonical' },
  ];
  const prior = new Set([fingerprint({ url: 'https://x/a', issue: 'missing title' })]);
  assertEquals(dedupeAgainstPrior(findings, prior), [{ url: 'https://x/b', issue: 'missing canonical' }]);
});

Deno.test('isSameHost', () => {
  assertEquals(isSameHost('https://tryeatpal.com/blog', 'https://tryeatpal.com'), true);
  assertEquals(isSameHost('https://evil.com/x', 'https://tryeatpal.com'), false);
});
