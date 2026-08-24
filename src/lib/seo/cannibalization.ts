/**
 * Keyword cannibalization detection (US-651).
 *
 * EatPal points three content systems at overlapping picky-eating terms: the
 * blog, the /guides pSEO cluster, and the programmatic tiers underneath it.
 * When several of our own URLs draw impressions for one query, Google has to
 * pick, the clicks split, and no single page accumulates the signal it needs.
 * At the scale scripts/prerender-routes.json is provisioned for (2,000 guides)
 * this is the failure mode that quietly caps everything upstream of it.
 *
 * MAX_INDEXABLE_TIER in src/lib/pseo/indexability.ts already noindexes the low
 * tiers, which is a partial mitigation and not an audit -- a noindexed page can
 * still be indexed and still compete, and knowing whether a competing URL is
 * above or below that gate is the difference between "fix the tier config" and
 * "merge these two pages".
 *
 * Pure and DB-free. The admin tab and the weekly SEO audit both feed it rows.
 */

/** One row of public.gsc_page_performance, narrowed to what this needs. */
export interface PageQueryRow {
  page_url: string;
  date: string;
  top_queries?: Array<{ query: string; clicks?: number; impressions?: number }> | null;
}

export interface CompetingUrl {
  pageUrl: string;
  impressions: number;
  clicks: number;
  /** Share of the query's total impressions, 0..1. */
  share: number;
  /** Whether this URL is above the pSEO indexability gate. Null when unknown. */
  indexable: boolean | null;
}

export interface CannibalizationFinding {
  query: string;
  totalImpressions: number;
  totalClicks: number;
  /** Competing URLs, most impressions first. At least two. */
  urls: CompetingUrl[];
  /**
   * Impressions drawn by every URL except the leader. This is what ranks the
   * report: it is the volume that is being split rather than accumulated.
   */
  impressionsSplit: number;
  /** Runner-up's share of the query. Drives the dominance test. */
  runnerUpShare: number;
}

export interface CannibalizationOptions {
  /**
   * Minimum share the runner-up must hold before a query counts as contested.
   * Below this, one page is clearly winning and the others are incidental.
   */
  minRunnerUpShare?: number;
  /** Queries with fewer total impressions than this are noise. */
  minTotalImpressions?: number;
  /** page_url -> indexable, from the pSEO tier gate. Absent means unknown. */
  indexability?: Record<string, boolean>;
}

export const DEFAULT_MIN_RUNNER_UP_SHARE = 0.2;
export const DEFAULT_MIN_TOTAL_IMPRESSIONS = 50;

/** Match URL forms consistently: GSC is absolute, our own tables are mixed. */
export function normalizePageUrl(url: string): string {
  let out = url.trim().toLowerCase();
  out = out.replace(/^https?:\/\/[^/]+/, '');
  out = out.replace(/[?#].*$/, '');
  if (out.length > 1) out = out.replace(/\/+$/, '');
  return out || '/';
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Find queries where more than one of our URLs is competing for the same
 * impressions, worst split first.
 */
export function findCannibalization(
  rows: PageQueryRow[],
  options: CannibalizationOptions = {}
): CannibalizationFinding[] {
  const minRunnerUpShare = options.minRunnerUpShare ?? DEFAULT_MIN_RUNNER_UP_SHARE;
  const minTotalImpressions = options.minTotalImpressions ?? DEFAULT_MIN_TOTAL_IMPRESSIONS;
  const indexability = options.indexability ?? {};

  // query -> page_url -> totals
  const byQuery = new Map<string, Map<string, { impressions: number; clicks: number }>>();
  // Keep the first-seen spelling so the report reads the way the query does.
  const display = new Map<string, string>();

  for (const row of rows) {
    const pageUrl = normalizePageUrl(row.page_url);
    for (const entry of row.top_queries ?? []) {
      if (!entry?.query) continue;
      const key = normalizeQuery(entry.query);
      if (!key) continue;
      if (!display.has(key)) display.set(key, entry.query.trim());

      let pages = byQuery.get(key);
      if (!pages) {
        pages = new Map();
        byQuery.set(key, pages);
      }
      const totals = pages.get(pageUrl) ?? { impressions: 0, clicks: 0 };
      totals.impressions += entry.impressions ?? 0;
      totals.clicks += entry.clicks ?? 0;
      pages.set(pageUrl, totals);
    }
  }

  const findings: CannibalizationFinding[] = [];

  for (const [key, pages] of byQuery) {
    // One URL for a query is the healthy case, not a finding.
    if (pages.size < 2) continue;

    const totalImpressions = [...pages.values()].reduce((sum, t) => sum + t.impressions, 0);
    if (totalImpressions < minTotalImpressions) continue;
    // Every competitor drew zero impressions; nothing is being split.
    if (totalImpressions === 0) continue;

    const urls: CompetingUrl[] = [...pages.entries()]
      .map(([pageUrl, totals]) => ({
        pageUrl,
        impressions: totals.impressions,
        clicks: totals.clicks,
        share: totals.impressions / totalImpressions,
        indexable: pageUrl in indexability ? indexability[pageUrl] : null,
      }))
      // Ties broken by URL so the report is stable run to run.
      .sort((a, b) => b.impressions - a.impressions || a.pageUrl.localeCompare(b.pageUrl));

    // A URL that drew nothing is not competing for the query, it just appeared
    // in someone's top_queries list.
    const competing = urls.filter((u) => u.impressions > 0);
    if (competing.length < 2) continue;

    const runnerUpShare = competing[1].share;
    // One page clearly winning is the outcome we want, not cannibalization.
    if (runnerUpShare < minRunnerUpShare) continue;

    findings.push({
      query: display.get(key) ?? key,
      totalImpressions,
      totalClicks: competing.reduce((sum, u) => sum + u.clicks, 0),
      urls: competing,
      impressionsSplit: totalImpressions - competing[0].impressions,
      runnerUpShare: Math.round(runnerUpShare * 1000) / 1000,
    });
  }

  return findings.sort(
    (a, b) => b.impressionsSplit - a.impressionsSplit || a.query.localeCompare(b.query)
  );
}

/**
 * One line per finding, for the weekly agent-seo-audit escalation.
 *
 * The report is worth nothing if it only ever lives on a dashboard tab nobody
 * opens, which is how the /compare pages ended up unreachable for months.
 */
export function summarizeCannibalization(findings: CannibalizationFinding[], limit = 5): string[] {
  return findings.slice(0, limit).map((f) => {
    const urls = f.urls
      .map((u) => {
        const gate = u.indexable === false ? ' [noindex]' : '';
        return `${u.pageUrl}${gate} ${Math.round(u.share * 100)}%`;
      })
      .join(' vs ');
    return `"${f.query}": ${f.impressionsSplit} of ${f.totalImpressions} impressions split -- ${urls}`;
  });
}
