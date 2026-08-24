/**
 * Pure logic for the content decay agent (US-650).
 *
 * The content programme could only add. agent-content-calendar proposes new
 * topics; agent-seo-audit checks hygiene (duplicate titles, missing canonicals,
 * broken links, missing JSON-LD). Nothing watched a published page losing the
 * traffic it had, so the answer to a decaying page was always another new page.
 *
 * DB-free so the windowing, the thresholds and the dedupe are unit-testable.
 * Tested from src/lib/contentDecay.test.ts rather than a Deno `_test.ts` beside
 * this file: CI runs `npm run test:run` on every push but invokes `deno test` on
 * exactly two of the 60-odd `_test.ts` files in this directory, so a Deno test
 * here would not actually run.
 */

/** One row of public.gsc_page_performance, narrowed to what decay needs. */
export interface PagePerformanceRow {
  page_url: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  clicks: number;
  impressions: number;
  position: number;
  top_queries?: Array<{ query: string; clicks?: number; impressions?: number }> | null;
}

export interface DecayThresholds {
  /** Days in each half of the comparison. Default 28 vs the preceding 28. */
  windowDays: number;
  /** Fractional drop in clicks that counts as decay. 0.3 = lost 30%. */
  minClickDrop: number;
  /** Prior-period impressions a URL must clear before it can be flagged. */
  minPriorImpressions: number;
  /** A page younger than this is still ramping and is never flagged. */
  minPageAgeDays: number;
}

export const DEFAULT_THRESHOLDS: DecayThresholds = {
  windowDays: 28,
  minClickDrop: 0.3,
  minPriorImpressions: 100,
  minPageAgeDays: 60,
};

export interface DecayFinding {
  pageUrl: string;
  priorClicks: number;
  recentClicks: number;
  priorImpressions: number;
  recentImpressions: number;
  /** Impression-weighted mean position; lower is better. */
  priorPosition: number;
  recentPosition: number;
  /** Fraction of clicks lost, 0..1. */
  clickDrop: number;
  /** Absolute clicks lost, which is what ranks the list. */
  clicksLost: number;
  /** The page's own top queries, carried through for whoever rewrites it. */
  topQueries: string[];
}

const MS_PER_DAY = 86_400_000;

/** Parse an ISO date to epoch ms, or null when it is not a usable date. */
function parseDate(value: string): number | null {
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Impression-weighted mean of `position`.
 *
 * A plain average lets one day with three impressions at position 2 cancel a
 * month at position 40, which reads as "improving" while the page dies.
 */
function weightedPosition(rows: PagePerformanceRow[]): number {
  const impressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  if (impressions === 0) return 0;
  const weighted = rows.reduce((sum, r) => sum + r.position * r.impressions, 0);
  return Math.round((weighted / impressions) * 10) / 10;
}

/** The distinct queries a page drew, best-performing first. */
function topQueriesFor(rows: PagePerformanceRow[], limit = 10): string[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    for (const q of row.top_queries ?? []) {
      if (!q?.query) continue;
      totals.set(q.query, (totals.get(q.query) ?? 0) + (q.impressions ?? q.clicks ?? 0));
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([query]) => query);
}

export interface DetectDecayParams {
  rows: PagePerformanceRow[];
  /** End of the recent window, exclusive. Pass the sync's latest date. */
  asOf: string;
  thresholds?: Partial<DecayThresholds>;
  /** page_url -> ISO publish date. A URL absent here is treated as old enough. */
  publishedAt?: Record<string, string>;
}

/**
 * Compare the trailing window against the one before it and return the pages
 * that lost enough traffic to be worth rewriting, worst absolute loss first.
 */
export function detectDecay({
  rows,
  asOf,
  thresholds,
  publishedAt = {},
}: DetectDecayParams): DecayFinding[] {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const asOfMs = parseDate(asOf);
  if (asOfMs === null) return [];

  const recentStart = asOfMs - t.windowDays * MS_PER_DAY;
  const priorStart = recentStart - t.windowDays * MS_PER_DAY;

  const recent = new Map<string, PagePerformanceRow[]>();
  const prior = new Map<string, PagePerformanceRow[]>();

  for (const row of rows) {
    const ms = parseDate(row.date);
    if (ms === null) continue;
    // Half-open on the low side of each window: `recentStart` itself belongs to
    // the prior window, so two adjacent 28-day windows are 28 days each rather
    // than sharing a day. A shared day counts its clicks into both sides and
    // shrinks every measured drop.
    const bucket =
      ms > recentStart && ms <= asOfMs
        ? recent
        : ms > priorStart && ms <= recentStart
          ? prior
          : null;
    if (!bucket) continue;
    const list = bucket.get(row.page_url);
    if (list) list.push(row);
    else bucket.set(row.page_url, [row]);
  }

  const findings: DecayFinding[] = [];

  for (const [pageUrl, priorRows] of prior) {
    const priorImpressions = priorRows.reduce((sum, r) => sum + r.impressions, 0);
    // Below the floor the sample is noise: one click to zero is a 100% drop.
    if (priorImpressions < t.minPriorImpressions) continue;

    const publish = publishedAt[pageUrl] ? parseDate(publishedAt[pageUrl]) : null;
    if (publish !== null && asOfMs - publish < t.minPageAgeDays * MS_PER_DAY) continue;

    const priorClicks = priorRows.reduce((sum, r) => sum + r.clicks, 0);
    // No clicks to lose. That is a page that never ranked, which is a different
    // problem from one that is decaying, and it belongs in a different report.
    if (priorClicks === 0) continue;

    const recentRows = recent.get(pageUrl) ?? [];
    const recentClicks = recentRows.reduce((sum, r) => sum + r.clicks, 0);
    const clickDrop = (priorClicks - recentClicks) / priorClicks;
    if (clickDrop < t.minClickDrop) continue;

    findings.push({
      pageUrl,
      priorClicks,
      recentClicks,
      priorImpressions,
      recentImpressions: recentRows.reduce((sum, r) => sum + r.impressions, 0),
      priorPosition: weightedPosition(priorRows),
      recentPosition: weightedPosition(recentRows),
      clickDrop: Math.round(clickDrop * 1000) / 1000,
      clicksLost: priorClicks - recentClicks,
      topQueries: topQueriesFor([...priorRows, ...recentRows]),
    });
  }

  return findings.sort((a, b) => b.clicksLost - a.clicksLost || a.pageUrl.localeCompare(b.pageUrl));
}

/**
 * Drop findings for URLs that already have an unresolved refresh approval.
 *
 * Without this the agent redrafts the same page every week for as long as the
 * approval sits in the queue, and the queue is the thing that stops being read.
 */
export function dedupeAgainstOpenApprovals(
  findings: DecayFinding[],
  openApprovalUrls: Iterable<string>
): DecayFinding[] {
  const open = new Set<string>();
  for (const url of openApprovalUrls) open.add(normalizeUrl(url));
  return findings.filter((f) => !open.has(normalizeUrl(f.pageUrl)));
}

/**
 * Compare URLs the way GSC and our sitemap disagree about them: GSC reports
 * absolute URLs, the sitemap and approval payloads have both forms in them, and
 * a trailing slash is not a different page.
 */
export function normalizeUrl(url: string): string {
  let out = url.trim().toLowerCase();
  out = out.replace(/^https?:\/\/[^/]+/, '');
  out = out.replace(/[?#].*$/, '');
  if (out.length > 1) out = out.replace(/\/+$/, '');
  return out || '/';
}
