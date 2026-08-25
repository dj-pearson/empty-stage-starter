import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MIN_RUNNER_UP_SHARE,
  findCannibalization,
  normalizePageUrl,
  summarizeCannibalization,
  type PageQueryRow,
} from './cannibalization';

/**
 * US-651. The report is only useful if it distinguishes three cases that look
 * alike in the raw data: one page owning a query (healthy), one page owning it
 * with stragglers (also healthy), and several pages genuinely splitting it.
 */
function row(
  pageUrl: string,
  queries: Array<[query: string, impressions: number, clicks?: number]>
): PageQueryRow {
  return {
    page_url: pageUrl,
    date: '2026-08-20',
    top_queries: queries.map(([query, impressions, clicks]) => ({
      query,
      impressions,
      clicks: clicks ?? 0,
    })),
  };
}

describe('findCannibalization (US-651)', () => {
  it('flags a query two of our pages are splitting', () => {
    const rows = [
      row('/blog/food-chaining', [['food chaining', 300, 20]]),
      row('/guides/food-chaining/chicken-nuggets', [['food chaining', 200, 5]]),
    ];
    const [f] = findCannibalization(rows);

    expect(f.query).toBe('food chaining');
    expect(f.totalImpressions).toBe(500);
    expect(f.totalClicks).toBe(25);
    expect(f.urls.map((u) => u.pageUrl)).toEqual([
      '/blog/food-chaining',
      '/guides/food-chaining/chicken-nuggets',
    ]);
    expect(f.impressionsSplit).toBe(200);
    expect(f.runnerUpShare).toBeCloseTo(0.4, 3);
  });

  it('ignores a query only one page ranks for', () => {
    const rows = [row('/blog/only-one', [['arfid meal plan', 900, 40]])];
    expect(findCannibalization(rows)).toEqual([]);
  });

  it('ignores a query one page clearly dominates', () => {
    const rows = [
      row('/blog/winner', [['picky eater app', 950]]),
      row('/guides/misc', [['picky eater app', 50]]),
    ];
    // Runner-up holds 5%, well under the 20% default.
    expect(findCannibalization(rows)).toEqual([]);
    expect(DEFAULT_MIN_RUNNER_UP_SHARE).toBe(0.2);
    // Lower the bar and the same data is a finding.
    expect(findCannibalization(rows, { minRunnerUpShare: 0.04 })).toHaveLength(1);
  });

  it('ignores a contested query with too few impressions to matter', () => {
    const rows = [row('/a', [['tiny query', 6]]), row('/b', [['tiny query', 5]])];
    expect(findCannibalization(rows)).toEqual([]);
    expect(findCannibalization(rows, { minTotalImpressions: 10 })).toHaveLength(1);
  });

  it('does not count a URL that drew no impressions as a competitor', () => {
    const rows = [
      row('/blog/real', [['food chaining', 400]]),
      row('/blog/listed-but-idle', [['food chaining', 0]]),
    ];
    expect(findCannibalization(rows)).toEqual([]);
  });

  it('sums a page across several days before comparing', () => {
    const rows = [
      row('/a', [['try bites', 100]]),
      { ...row('/a', [['try bites', 100]]), date: '2026-08-21' },
      row('/b', [['try bites', 150]]),
    ];
    const [f] = findCannibalization(rows);
    expect(f.urls[0]).toMatchObject({ pageUrl: '/a', impressions: 200 });
    expect(f.urls[1]).toMatchObject({ pageUrl: '/b', impressions: 150 });
  });

  it('treats URL forms that differ only in host, slash or case as one page', () => {
    const rows = [
      row('https://tryeatpal.com/blog/x', [['q one', 200]]),
      row('/blog/x/', [['q one', 200]]),
      row('/blog/y', [['q one', 150]]),
    ];
    const [f] = findCannibalization(rows);
    expect(f.urls).toHaveLength(2);
    expect(f.urls[0]).toMatchObject({ pageUrl: '/blog/x', impressions: 400 });
  });

  it('folds query spellings that differ only in case or spacing', () => {
    const rows = [row('/a', [['Food  Chaining', 300]]), row('/b', [['food chaining', 300]])];
    const findings = findCannibalization(rows);
    expect(findings).toHaveLength(1);
    // First-seen spelling is kept so the report reads like the query.
    expect(findings[0].query).toBe('Food  Chaining');
  });

  it('says whether a competing URL is below the pSEO indexability gate', () => {
    const rows = [
      row('/blog/indexed', [['sensory food aversion', 300]]),
      row('/guides/tier-3-thing', [['sensory food aversion', 200]]),
    ];
    const [f] = findCannibalization(rows, {
      indexability: { '/blog/indexed': true, '/guides/tier-3-thing': false },
    });
    expect(f.urls[0].indexable).toBe(true);
    expect(f.urls[1].indexable).toBe(false);
  });

  it('reports unknown indexability as null rather than guessing', () => {
    const rows = [row('/a', [['q', 300]]), row('/b', [['q', 200]])];
    const [f] = findCannibalization(rows);
    expect(f.urls.every((u) => u.indexable === null)).toBe(true);
  });

  it('ranks by impressions split away from the leader', () => {
    const rows = [
      // 300 split.
      row('/big-a', [['big query', 700]]),
      row('/big-b', [['big query', 300]]),
      // 90 split, a more even fight but a smaller one.
      row('/small-a', [['small query', 100]]),
      row('/small-b', [['small query', 90]]),
    ];
    const findings = findCannibalization(rows);
    expect(findings.map((f) => f.query)).toEqual(['big query', 'small query']);
    expect(findings[0].runnerUpShare).toBeLessThan(findings[1].runnerUpShare);
  });

  it('orders ties stably so the report does not churn between runs', () => {
    const rows = [
      row('/b', [
        ['q one', 250],
        ['q two', 250],
      ]),
      row('/a', [
        ['q one', 250],
        ['q two', 250],
      ]),
    ];
    const first = findCannibalization(rows);
    const second = findCannibalization([...rows].reverse());
    expect(first.map((f) => f.query)).toEqual(second.map((f) => f.query));
    expect(first[0].urls.map((u) => u.pageUrl)).toEqual(['/a', '/b']);
  });

  it('returns an empty report for empty or query-less input', () => {
    expect(findCannibalization([])).toEqual([]);
    expect(findCannibalization([{ page_url: '/a', date: '2026-08-20' }])).toEqual([]);
    expect(
      findCannibalization([{ page_url: '/a', date: '2026-08-20', top_queries: null }])
    ).toEqual([]);
  });
});

describe('summarizeCannibalization (US-651)', () => {
  it('renders one line per finding for the weekly escalation', () => {
    const rows = [
      row('/blog/food-chaining', [['food chaining', 300]]),
      row('/guides/food-chaining/nuggets', [['food chaining', 200]]),
    ];
    const [line] = summarizeCannibalization(findCannibalization(rows));
    expect(line).toContain('"food chaining"');
    expect(line).toContain('200 of 500 impressions split');
    expect(line).toContain('/blog/food-chaining 60%');
    expect(line).toContain('/guides/food-chaining/nuggets 40%');
  });

  it('marks a noindexed competitor, which is a different fix', () => {
    const rows = [row('/blog/a', [['q', 300]]), row('/guides/low-tier', [['q', 200]])];
    const [line] = summarizeCannibalization(
      findCannibalization(rows, { indexability: { '/guides/low-tier': false } })
    );
    expect(line).toContain('/guides/low-tier [noindex]');
    expect(line).not.toContain('/blog/a [noindex]');
  });

  it('caps the escalation and handles an empty report', () => {
    const rows = Array.from({ length: 12 }, (_, i) => [
      row(`/a-${i}`, [[`query ${i}`, 300]]),
      row(`/b-${i}`, [[`query ${i}`, 200]]),
    ]).flat();
    expect(summarizeCannibalization(findCannibalization(rows))).toHaveLength(5);
    expect(summarizeCannibalization(findCannibalization(rows), 3)).toHaveLength(3);
    expect(summarizeCannibalization([])).toEqual([]);
  });
});

describe('normalizePageUrl (US-651)', () => {
  it.each([
    ['https://tryeatpal.com/guides/x', '/guides/x'],
    ['https://tryeatpal.com/guides/x/', '/guides/x'],
    ['/guides/x?utm_source=gsc', '/guides/x'],
    ['https://tryeatpal.com', '/'],
    ['  /Guides/X  ', '/guides/x'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePageUrl(input)).toBe(expected);
  });
});
