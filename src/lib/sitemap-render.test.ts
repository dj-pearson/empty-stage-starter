import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  escapeXml,
  isoDate,
  renderSitemap,
  type SitemapEntry,
} from '../../supabase/functions/generate-sitemap/render';

const repoRoot = resolve(__dirname, '../..');

const staticEntry: SitemapEntry = { path: '/pricing', changefreq: 'weekly', priority: '0.9' };

describe('renderSitemap', () => {
  it('omits lastmod for a URL whose modification date we do not know', () => {
    const xml = renderSitemap([staticEntry]);

    expect(xml).toContain('<loc>https://tryeatpal.com/pricing</loc>');
    expect(xml).not.toContain('<lastmod>');
  });

  it('emits lastmod for a URL that has a real one', () => {
    const xml = renderSitemap([
      { path: '/blog/a-post', changefreq: 'monthly', priority: '0.7', lastmod: '2026-03-04' },
    ]);

    expect(xml).toContain('<lastmod>2026-03-04</lastmod>');
  });

  it('never dates the whole sitemap from the clock', () => {
    // The regression this pins: every entry used to fall back to the request date, so
    // /privacy and /terms told crawlers they changed this morning, and again tomorrow.
    const today = new Date().toISOString().split('T')[0];
    const xml = renderSitemap([staticEntry, { ...staticEntry, path: '/terms' }]);

    expect(xml).not.toContain(today);
  });

  it('stays well-formed with mixed known and unknown dates', () => {
    const xml = renderSitemap([
      staticEntry,
      { path: '/guides/x', changefreq: 'monthly', priority: '0.6', lastmod: '2026-01-02' },
    ]);

    expect(xml.match(/<url>/g)).toHaveLength(2);
    expect(xml.match(/<\/url>/g)).toHaveLength(2);
    expect(xml).not.toMatch(/\n\s*\n/);
  });

  it('escapes slugs that would otherwise break the document', () => {
    expect(escapeXml('/blog/rice&beans')).toBe('/blog/rice&amp;beans');
    expect(renderSitemap([{ ...staticEntry, path: '/blog/rice&beans' }])).toContain('&amp;');
  });
});

describe('isoDate', () => {
  it('returns the calendar day of a real timestamp', () => {
    expect(isoDate('2026-03-04T18:30:00.000Z')).toBe('2026-03-04');
  });

  it('returns undefined rather than inventing today', () => {
    expect(isoDate(null)).toBeUndefined();
    expect(isoDate(undefined)).toBeUndefined();
    expect(isoDate('')).toBeUndefined();
    expect(isoDate('not a date')).toBeUndefined();
  });
});

describe('the Cloudflare Pages fallback sitemap', () => {
  // functions/sitemap.xml.ts serves this when the edge function is unreachable. It is a
  // template literal, not importable here, so assert on the source.
  const source = readFileSync(resolve(repoRoot, 'functions/sitemap.xml.ts'), 'utf8');

  const fallback = source.slice(source.indexOf('const fallbackSitemap'));

  it('carries no lastmod at all', () => {
    expect(fallback).toContain('<loc>https://tryeatpal.com/</loc>');
    expect(fallback).not.toContain('<lastmod>');
  });

  it('does not stamp the response with the request date', () => {
    expect(fallback).not.toContain('new Date()');
  });
});
