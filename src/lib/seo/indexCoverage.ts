/**
 * Index coverage reconciliation (US-653).
 *
 * robots.txt and the sitemap are what we TELL Google. Nothing showed what
 * Google did. With 2,000 guides in the prerender budget that gap matters: a
 * route can be declared and never crawled, prerendered and never declared, or
 * declared and quietly dropped by the prerender wall-clock budget, and all
 * three look identical from inside the repo.
 *
 * Three inputs, four buckets, no network and no database. The caller fetches
 * the sitemap, the prerender manifest and the GSC page list; this decides what
 * they mean together.
 *
 * Out of scope, deliberately: true log-file analysis of Googlebot hits. That
 * needs Cloudflare Logpush into a queryable store, which is an infrastructure
 * decision rather than a code change. This is the reconciliation that can be
 * built from what the project already produces.
 */

/** What scripts/prerender.mjs writes to dist/prerender-manifest.json. */
export interface PrerenderManifest {
  generatedAt?: string;
  budgetMs?: number;
  /** Routes that produced a static HTML file. */
  rendered: string[];
  /** Discovered routes the wall-clock budget never attempted. */
  skipped: string[];
  /** Routes attempted that threw. */
  failed?: string[];
}

export interface CoverageInputs {
  /** <loc> values from the live sitemap. */
  sitemapUrls: string[];
  /** The manifest from the build that produced the deployed site. */
  manifest: PrerenderManifest | null;
  /** Distinct page_url values GSC reported impressions for in the window. */
  gscUrls: string[];
}

export interface CoverageBucket {
  count: number;
  /** Up to `sampleSize` entries, sorted, for a report line. */
  sample: string[];
}

export interface CoverageReport {
  /** Declared in the sitemap and Google has never shown it. */
  declaredNeverImpressed: CoverageBucket;
  /** Prerendered but not in the sitemap: built, shipped, never submitted. */
  prerenderedNotDeclared: CoverageBucket;
  /** In the sitemap with no static HTML: crawlers without JS get a shell. */
  declaredNotPrerendered: CoverageBucket;
  /** Google is ranking a URL we never submitted. */
  impressedNotDeclared: CoverageBucket;
  /**
   * Routes the prerender budget ran out on. Reported on its own because they
   * are not a coverage failure -- they are a build that silently did less than
   * it looks like it did, and they land in declaredNotPrerendered too.
   */
  prerenderBudgetSkipped: CoverageBucket;
  totals: {
    sitemap: number;
    prerendered: number;
    impressed: number;
  };
  /** True when the manifest was missing, so prerender buckets mean nothing. */
  manifestMissing: boolean;
}

/**
 * Compare URLs the way three systems that disagree about them require: GSC
 * reports absolute URLs, the sitemap uses absolute, the prerender manifest uses
 * paths, and a trailing slash is not a different page.
 */
export function normalizeRoute(url: string): string {
  let out = url.trim().toLowerCase();
  out = out.replace(/^https?:\/\/[^/]+/, '');
  out = out.replace(/[?#].*$/, '');
  if (out.length > 1) out = out.replace(/\/+$/, '');
  return out || '/';
}

function bucket(values: Iterable<string>, sampleSize: number): CoverageBucket {
  const sorted = [...new Set(values)].sort();
  return { count: sorted.length, sample: sorted.slice(0, sampleSize) };
}

export function reconcileCoverage(
  { sitemapUrls, manifest, gscUrls }: CoverageInputs,
  sampleSize = 10
): CoverageReport {
  const sitemap = new Set(sitemapUrls.map(normalizeRoute));
  const impressed = new Set(gscUrls.map(normalizeRoute));
  const manifestMissing = manifest === null;
  const rendered = new Set((manifest?.rendered ?? []).map(normalizeRoute));
  const skipped = new Set((manifest?.skipped ?? []).map(normalizeRoute));

  const declaredNeverImpressed: string[] = [];
  const declaredNotPrerendered: string[] = [];
  for (const route of sitemap) {
    if (!impressed.has(route)) declaredNeverImpressed.push(route);
    // Without a manifest every route would land here, which reads as a total
    // prerender failure rather than as missing data. Leave it empty instead.
    if (!manifestMissing && !rendered.has(route)) declaredNotPrerendered.push(route);
  }

  const prerenderedNotDeclared: string[] = [];
  for (const route of rendered) {
    if (!sitemap.has(route)) prerenderedNotDeclared.push(route);
  }

  const impressedNotDeclared: string[] = [];
  for (const route of impressed) {
    if (!sitemap.has(route)) impressedNotDeclared.push(route);
  }

  return {
    declaredNeverImpressed: bucket(declaredNeverImpressed, sampleSize),
    prerenderedNotDeclared: bucket(prerenderedNotDeclared, sampleSize),
    declaredNotPrerendered: bucket(declaredNotPrerendered, sampleSize),
    impressedNotDeclared: bucket(impressedNotDeclared, sampleSize),
    prerenderBudgetSkipped: bucket(skipped, sampleSize),
    totals: {
      sitemap: sitemap.size,
      prerendered: rendered.size,
      impressed: impressed.size,
    },
    manifestMissing,
  };
}

/** Extract <loc> values from a sitemap XML document. */
export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

export interface CoverageThresholds {
  declaredNeverImpressed: number;
  prerenderedNotDeclared: number;
  declaredNotPrerendered: number;
  impressedNotDeclared: number;
  prerenderBudgetSkipped: number;
}

export const DEFAULT_COVERAGE_THRESHOLDS: CoverageThresholds = {
  // A handful of freshly published URLs Google has not got to yet is normal.
  declaredNeverImpressed: 25,
  // Any of these is a wiring mistake, so one is worth saying out loud.
  prerenderedNotDeclared: 1,
  declaredNotPrerendered: 1,
  impressedNotDeclared: 1,
  prerenderBudgetSkipped: 1,
};

/**
 * One line per bucket that is over its threshold, for the weekly SEO audit.
 * Empty when everything reconciles, so a quiet week stays quiet.
 */
export function summarizeCoverage(
  report: CoverageReport,
  thresholds: CoverageThresholds = DEFAULT_COVERAGE_THRESHOLDS
): string[] {
  if (report.manifestMissing) {
    return [
      'No prerender manifest at /prerender-manifest.json, so prerender coverage is unknown. ' +
        'The last deploy either predates the manifest or did not run scripts/prerender.mjs.',
    ];
  }

  const lines: string[] = [];
  const say = (
    key: keyof CoverageThresholds,
    b: CoverageBucket,
    describe: (n: number) => string
  ) => {
    if (b.count < thresholds[key]) return;
    lines.push(`${describe(b.count)} e.g. ${b.sample.slice(0, 3).join(', ')}`);
  };

  say(
    'prerenderBudgetSkipped',
    report.prerenderBudgetSkipped,
    (n) => `${n} route(s) the prerender budget ran out on ship as client-rendered shells.`
  );
  say(
    'declaredNotPrerendered',
    report.declaredNotPrerendered,
    (n) =>
      `${n} sitemap URL(s) have no static HTML, so a crawler without JavaScript gets an empty shell.`
  );
  say(
    'prerenderedNotDeclared',
    report.prerenderedNotDeclared,
    (n) =>
      `${n} prerendered route(s) are not in the sitemap: built and shipped but never submitted.`
  );
  say(
    'impressedNotDeclared',
    report.impressedNotDeclared,
    (n) => `${n} URL(s) drew impressions without being in the sitemap.`
  );
  say(
    'declaredNeverImpressed',
    report.declaredNeverImpressed,
    (n) => `${n} sitemap URL(s) have never drawn an impression.`
  );

  return lines;
}
