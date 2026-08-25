import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COVERAGE_THRESHOLDS,
  normalizeRoute,
  parseSitemapLocs,
  reconcileCoverage,
  summarizeCoverage,
  type PrerenderManifest,
} from './indexCoverage';

/**
 * US-653. The four buckets exist because these situations look identical from
 * inside the repo and need different fixes: a page nobody submitted, a page
 * nobody built, a page Google has not reached, and a page Google found that we
 * never declared.
 */
const manifest = (over: Partial<PrerenderManifest> = {}): PrerenderManifest => ({
  rendered: [],
  skipped: [],
  ...over,
});

describe('reconcileCoverage (US-653)', () => {
  it('splits the four states apart', () => {
    const report = reconcileCoverage({
      sitemapUrls: [
        'https://tryeatpal.com/pricing', // fine
        'https://tryeatpal.com/faq', // never impressed
        'https://tryeatpal.com/guides/new', // not prerendered
      ],
      manifest: manifest({ rendered: ['/pricing', '/faq', '/orphan'] }),
      gscUrls: ['https://tryeatpal.com/pricing', 'https://tryeatpal.com/blog/undeclared'],
    });

    expect(report.declaredNeverImpressed.sample).toEqual(['/faq', '/guides/new']);
    expect(report.declaredNotPrerendered.sample).toEqual(['/guides/new']);
    expect(report.prerenderedNotDeclared.sample).toEqual(['/orphan']);
    expect(report.impressedNotDeclared.sample).toEqual(['/blog/undeclared']);
    expect(report.totals).toEqual({ sitemap: 3, prerendered: 3, impressed: 2 });
  });

  it('reports budget skips separately from missing static HTML', () => {
    const report = reconcileCoverage({
      sitemapUrls: ['https://tryeatpal.com/guides/a', 'https://tryeatpal.com/guides/b'],
      manifest: manifest({ rendered: ['/guides/a'], skipped: ['/guides/b'] }),
      gscUrls: ['https://tryeatpal.com/guides/a', 'https://tryeatpal.com/guides/b'],
    });

    // A skipped route is genuinely un-prerendered, so it lands in both. The
    // separate bucket is what says the build did less than it looks like.
    expect(report.prerenderBudgetSkipped.sample).toEqual(['/guides/b']);
    expect(report.declaredNotPrerendered.sample).toEqual(['/guides/b']);
  });

  it('does not claim a total prerender failure when the manifest is missing', () => {
    const report = reconcileCoverage({
      sitemapUrls: ['https://tryeatpal.com/a', 'https://tryeatpal.com/b'],
      manifest: null,
      gscUrls: ['https://tryeatpal.com/a'],
    });

    expect(report.manifestMissing).toBe(true);
    expect(report.declaredNotPrerendered.count).toBe(0);
    expect(report.totals.prerendered).toBe(0);
    // The buckets that do not depend on the manifest still work.
    expect(report.declaredNeverImpressed.sample).toEqual(['/b']);
  });

  it('treats the URL forms the three systems disagree on as one route', () => {
    const report = reconcileCoverage({
      sitemapUrls: ['https://tryeatpal.com/Guides/X/'],
      manifest: manifest({ rendered: ['/guides/x'] }),
      gscUrls: ['http://tryeatpal.com/guides/x?utm_source=gsc'],
    });

    expect(report.declaredNeverImpressed.count).toBe(0);
    expect(report.declaredNotPrerendered.count).toBe(0);
    expect(report.prerenderedNotDeclared.count).toBe(0);
    expect(report.impressedNotDeclared.count).toBe(0);
  });

  it('deduplicates within each input before counting', () => {
    const report = reconcileCoverage({
      sitemapUrls: ['https://tryeatpal.com/a', '/a/', 'https://tryeatpal.com/a?x=1'],
      manifest: manifest({ rendered: ['/a', '/a/'] }),
      gscUrls: ['/a', 'https://tryeatpal.com/a'],
    });
    expect(report.totals).toEqual({ sitemap: 1, prerendered: 1, impressed: 1 });
  });

  it('caps every sample and reports the true count alongside it', () => {
    const many = Array.from({ length: 40 }, (_, i) => `https://tryeatpal.com/p-${i}`);
    const report = reconcileCoverage({ sitemapUrls: many, manifest: manifest(), gscUrls: [] });

    expect(report.declaredNeverImpressed.count).toBe(40);
    expect(report.declaredNeverImpressed.sample).toHaveLength(10);
    expect(
      reconcileCoverage({ sitemapUrls: many, manifest: manifest(), gscUrls: [] }, 3)
        .declaredNeverImpressed.sample
    ).toHaveLength(3);
  });

  it('returns empty buckets for empty inputs rather than throwing', () => {
    const report = reconcileCoverage({ sitemapUrls: [], manifest: manifest(), gscUrls: [] });
    expect(report.totals).toEqual({ sitemap: 0, prerendered: 0, impressed: 0 });
    for (const key of [
      'declaredNeverImpressed',
      'prerenderedNotDeclared',
      'declaredNotPrerendered',
      'impressedNotDeclared',
      'prerenderBudgetSkipped',
    ] as const) {
      expect(report[key]).toEqual({ count: 0, sample: [] });
    }
  });
});

describe('summarizeCoverage (US-653)', () => {
  const clean = () =>
    reconcileCoverage({
      sitemapUrls: ['https://tryeatpal.com/a'],
      manifest: manifest({ rendered: ['/a'] }),
      gscUrls: ['https://tryeatpal.com/a'],
    });

  it('says nothing when everything reconciles', () => {
    expect(summarizeCoverage(clean())).toEqual([]);
  });

  it('leads with the budget skips, which are a build problem not a coverage one', () => {
    const report = reconcileCoverage({
      sitemapUrls: ['https://tryeatpal.com/a', 'https://tryeatpal.com/b'],
      manifest: manifest({ rendered: ['/a'], skipped: ['/b'] }),
      gscUrls: ['https://tryeatpal.com/a', 'https://tryeatpal.com/b'],
    });
    const lines = summarizeCoverage(report);
    expect(lines[0]).toContain('prerender budget ran out');
    expect(lines[0]).toContain('/b');
  });

  it('says the manifest is missing instead of inventing prerender findings', () => {
    const report = reconcileCoverage({
      sitemapUrls: ['https://tryeatpal.com/a'],
      manifest: null,
      gscUrls: [],
    });
    const lines = summarizeCoverage(report);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('No prerender manifest');
  });

  it('stays quiet about a few un-impressed URLs and speaks up about many', () => {
    const few = Array.from({ length: 5 }, (_, i) => `https://tryeatpal.com/n-${i}`);
    const many = Array.from({ length: 40 }, (_, i) => `https://tryeatpal.com/n-${i}`);
    const build = (urls: string[]) =>
      reconcileCoverage({
        sitemapUrls: urls,
        manifest: manifest({ rendered: urls.map(normalizeRoute) }),
        gscUrls: [],
      });

    expect(summarizeCoverage(build(few))).toEqual([]);
    expect(summarizeCoverage(build(many)).join(' ')).toContain('never drawn an impression');
    expect(DEFAULT_COVERAGE_THRESHOLDS.declaredNeverImpressed).toBe(25);
  });
});

describe('parseSitemapLocs (US-653)', () => {
  it('pulls every loc out of a sitemap', () => {
    const xml = `<?xml version="1.0"?>
<urlset><url><loc>https://tryeatpal.com/</loc></url>
<url>
  <loc>
    https://tryeatpal.com/pricing
  </loc>
</url></urlset>`;
    expect(parseSitemapLocs(xml)).toEqual([
      'https://tryeatpal.com/',
      'https://tryeatpal.com/pricing',
    ]);
  });

  it('returns nothing for an empty or malformed document', () => {
    expect(parseSitemapLocs('')).toEqual([]);
    expect(parseSitemapLocs('<urlset></urlset>')).toEqual([]);
  });
});

describe('normalizeRoute (US-653)', () => {
  it.each([
    ['https://tryeatpal.com/guides/x', '/guides/x'],
    ['https://tryeatpal.com/guides/x/', '/guides/x'],
    ['/guides/x?a=1#b', '/guides/x'],
    ['https://tryeatpal.com/', '/'],
    ['https://tryeatpal.com', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeRoute(input)).toBe(expected);
  });
});
