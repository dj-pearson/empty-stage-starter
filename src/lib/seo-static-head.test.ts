import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { seoConfig } from './seo-config';

/**
 * index.html is the document every non-JS client reads: AI crawlers (GPTBot,
 * PerplexityBot, ClaudeBot), Bingbot's first pass, and every social scraper. It is also
 * the SPA fallback for routes that are not prerendered.
 *
 * Before this test, index.html advertised "EatPal - The Operating System for Feeding
 * Therapy" (B2B) while the runtime <SEOHead> on the same page rendered "EatPal: ARFID &
 * Picky Eater Meal Planner" (consumer). Everything that does not execute JavaScript saw
 * the first one, and the two sat in the DOM together as duplicate og:title tags.
 *
 * These assertions pin the two together so they cannot drift apart again.
 */
const html = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

/** Decode only the entities we deliberately escape in the HTML source. */
const decode = (value: string) =>
  value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function metaContent(selector: 'name' | 'property', key: string): string | null {
  const pattern = new RegExp(`<meta[^>]*\\b${selector}="${key}"[^>]*>`, 'i');
  const tag = html.match(pattern)?.[0];
  if (!tag) return null;
  return decode(tag.match(/content="([^"]*)"/i)?.[1] ?? '');
}

describe('index.html static head', () => {
  const home = seoConfig.home;

  it('title matches seoConfig.home', () => {
    const title = decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '');
    expect(title).toBe(home.title);
  });

  it('description matches seoConfig.home', () => {
    expect(metaContent('name', 'description')).toBe(home.description);
  });

  it('og:title and og:description match seoConfig.home', () => {
    expect(metaContent('property', 'og:title')).toBe(home.title);
    expect(metaContent('property', 'og:description')).toBe(home.description);
  });

  it('twitter:title and twitter:description match seoConfig.home', () => {
    expect(metaContent('name', 'twitter:title')).toBe(home.title);
    expect(metaContent('name', 'twitter:description')).toBe(home.description);
  });

  it('canonical matches seoConfig.home', () => {
    const href = html.match(/<link[^>]*rel="canonical"[^>]*>/i)?.[0];
    expect(href).toBeTruthy();
    expect(href!.match(/href="([^"]*)"/i)?.[1]).toBe(home.canonicalUrl);
  });

  it('every tag SEOHead also emits is marked data-rh so Helmet replaces it', () => {
    // react-helmet-async only removes tags carrying data-rh. Any per-page tag left
    // unmarked survives alongside Helmet's version, and scrapers read the stale first
    // copy. Tags whose value never varies by page (og:image, twitter:card, favicons)
    // are intentionally not in this list.
    const mustBeClaimed = [
      /<title[^>]*>/i,
      /<meta[^>]*name="description"[^>]*>/i,
      /<meta[^>]*name="robots"[^>]*>/i,
      /<meta[^>]*property="og:title"[^>]*>/i,
      /<meta[^>]*property="og:description"[^>]*>/i,
      /<meta[^>]*property="og:url"[^>]*>/i,
      /<meta[^>]*name="twitter:title"[^>]*>/i,
      /<meta[^>]*name="twitter:description"[^>]*>/i,
      /<link[^>]*rel="canonical"[^>]*>/i,
    ];

    for (const pattern of mustBeClaimed) {
      const tag = html.match(pattern)?.[0];
      expect(tag, `missing tag for ${pattern}`).toBeTruthy();
      expect(tag, `${tag} must carry data-rh="true"`).toContain('data-rh="true"');
    }
  });

  it('carries no self-serving review or rating structured data', () => {
    // Google treats review/aggregateRating markup a site publishes about its own
    // product as self-serving: ineligible for rich results and a manual-action risk
    // when the numbers are invented (this page used to claim 4.8 from 2847 reviews).
    expect(html).not.toMatch(/aggregateRating/i);
    expect(html).not.toMatch(/"@type"\s*:\s*"Review"/i);
  });

  it('does not advertise a sitelinks searchbox for a route that does not exist', () => {
    // The WebSite node used to declare a SearchAction targeting /search?q=, but the app
    // has no /search route — the target 404s.
    expect(html).not.toMatch(/SearchAction/i);
  });
});

describe('og:image dimensions match the real file', () => {
  /** Minimal WebP header parse — enough for the VP8X/VP8 shapes sharp emits. */
  function webpSize(buffer: Buffer): { width: number; height: number } {
    const fourCC = buffer.subarray(12, 16).toString('ascii');
    if (fourCC === 'VP8X') {
      return {
        width: buffer.readUIntLE(24, 3) + 1,
        height: buffer.readUIntLE(27, 3) + 1,
      };
    }
    if (fourCC === 'VP8 ') {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    throw new Error(`unsupported WebP chunk: ${fourCC}`);
  }

  it('declares the actual pixel size of public/Cover.webp', () => {
    // og:image:width/height are hints scrapers lay the card out from BEFORE fetching the
    // file. These said 1200x630 (the conventional OG size) while the file is 1536x1024,
    // so every social preview was laid out against the wrong box.
    const cover = readFileSync(path.resolve(__dirname, '../../public/Cover.webp'));
    const { width, height } = webpSize(cover);

    expect(metaContent('property', 'og:image:width')).toBe(String(width));
    expect(metaContent('property', 'og:image:height')).toBe(String(height));
  });
});
