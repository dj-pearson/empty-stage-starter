import { describe, it, expect } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  dedupeAgainstOpenApprovals,
  detectDecay,
  normalizeUrl,
  type PagePerformanceRow,
} from '../../functions/_shared/content-decay-logic';

/**
 * US-650. Same arrangement as src/lib/stripeWebhookLogic.test.ts: the module
 * under test ships in an edge function but is dependency-free, so it is tested
 * here where CI actually runs the suite.
 */
const ASOF = '2026-08-24';

/** Build `days` consecutive rows ending the day before `endExclusive`. */
function series(
  pageUrl: string,
  endExclusive: string,
  days: number,
  perDay: { clicks: number; impressions: number; position?: number },
  offsetDays = 0
): PagePerformanceRow[] {
  const end = Date.parse(`${endExclusive}T00:00:00Z`) - offsetDays * 86_400_000;
  return Array.from({ length: days }, (_, i) => ({
    page_url: pageUrl,
    date: new Date(end - i * 86_400_000).toISOString().slice(0, 10),
    clicks: perDay.clicks,
    impressions: perDay.impressions,
    position: perDay.position ?? 10,
  }));
}

/** A page that had traffic in the prior window and lost most of it. */
function decayingPage(url = 'https://tryeatpal.com/blog/food-chaining'): PagePerformanceRow[] {
  return [
    ...series(url, ASOF, 28, { clicks: 1, impressions: 20 }),
    ...series(url, ASOF, 28, { clicks: 10, impressions: 100 }, 28),
  ];
}

describe('detectDecay (US-650)', () => {
  it('flags a page that lost most of its clicks', () => {
    const findings = detectDecay({ rows: decayingPage(), asOf: ASOF });

    expect(findings).toHaveLength(1);
    const [f] = findings;
    expect(f.pageUrl).toBe('https://tryeatpal.com/blog/food-chaining');
    expect(f.priorClicks).toBe(280);
    expect(f.recentClicks).toBe(28);
    expect(f.clickDrop).toBeCloseTo(0.9, 3);
    expect(f.clicksLost).toBe(252);
  });

  it('ignores a drop that stays under the threshold', () => {
    const url = 'https://tryeatpal.com/blog/steady';
    const rows = [
      ...series(url, ASOF, 28, { clicks: 9, impressions: 100 }),
      ...series(url, ASOF, 28, { clicks: 10, impressions: 100 }, 28),
    ];
    expect(detectDecay({ rows, asOf: ASOF })).toEqual([]);
  });

  it('ignores a page below the impression floor, however hard it fell', () => {
    const url = 'https://tryeatpal.com/blog/tiny';
    const rows = [
      // Prior window: 2 impressions total, well under the floor of 100. The
      // recent window is empty, so this is a 100% drop off a sample of one
      // click -- exactly the noise the floor exists to swallow.
      { page_url: url, date: '2026-07-20', clicks: 1, impressions: 2, position: 8 },
    ];
    expect(detectDecay({ rows, asOf: ASOF })).toEqual([]);
    expect(DEFAULT_THRESHOLDS.minPriorImpressions).toBe(100);
  });

  it('ignores a page published inside the ramp-up window', () => {
    const url = 'https://tryeatpal.com/blog/brand-new';
    const rows = decayingPage(url);
    expect(detectDecay({ rows, asOf: ASOF })).toHaveLength(1);
    expect(detectDecay({ rows, asOf: ASOF, publishedAt: { [url]: '2026-08-01' } })).toEqual([]);
    // Old enough, so the same rows flag again.
    expect(detectDecay({ rows, asOf: ASOF, publishedAt: { [url]: '2026-01-01' } })).toHaveLength(1);
  });

  it('does not divide by zero on a page that never had a click', () => {
    const url = 'https://tryeatpal.com/blog/never-ranked';
    const rows = [
      ...series(url, ASOF, 28, { clicks: 0, impressions: 30 }),
      ...series(url, ASOF, 28, { clicks: 0, impressions: 40 }, 28),
    ];
    const findings = detectDecay({ rows, asOf: ASOF });
    expect(findings).toEqual([]);
    expect(findings.every((f) => Number.isFinite(f.clickDrop))).toBe(true);
  });

  it('treats a page that vanished entirely as a total loss, not as missing', () => {
    const url = 'https://tryeatpal.com/blog/deindexed';
    const rows = series(url, ASOF, 28, { clicks: 5, impressions: 60 }, 28);
    const [f] = detectDecay({ rows, asOf: ASOF });
    expect(f.recentClicks).toBe(0);
    expect(f.recentImpressions).toBe(0);
    expect(f.clickDrop).toBe(1);
  });

  it('ranks by absolute clicks lost, not by percentage', () => {
    const big = 'https://tryeatpal.com/blog/big';
    const small = 'https://tryeatpal.com/blog/small';
    const rows = [
      // Lost 100 clicks, a 50% drop.
      ...series(big, ASOF, 28, { clicks: 5, impressions: 100 }),
      ...series(big, ASOF, 28, { clicks: 10, impressions: 100 }, 28),
      // Lost 56 clicks, a 100% drop.
      ...series(small, ASOF, 28, { clicks: 0, impressions: 10 }),
      ...series(small, ASOF, 28, { clicks: 2, impressions: 20 }, 28),
    ];
    const findings = detectDecay({ rows, asOf: ASOF });
    expect(findings.map((f) => f.pageUrl)).toEqual([big, small]);
    expect(findings[0].clickDrop).toBeLessThan(findings[1].clickDrop);
  });

  it('weights position by impressions so a quiet good day cannot mask a slide', () => {
    const url = 'https://tryeatpal.com/blog/slipping';
    const rows = [
      // Recent: one day at position 2 with 1 impression, 27 days at 40.
      { page_url: url, date: '2026-08-24', clicks: 1, impressions: 1, position: 2 },
      ...series(url, ASOF, 27, { clicks: 0, impressions: 50, position: 40 }, 1),
      ...series(url, ASOF, 28, { clicks: 10, impressions: 100, position: 5 }, 28),
    ];
    const [f] = detectDecay({ rows, asOf: ASOF });
    expect(f.priorPosition).toBe(5);
    // A plain mean would be about 38.6; weighting keeps it honest at ~40.
    expect(f.recentPosition).toBeGreaterThan(39);
  });

  it('carries the page top queries through for whoever rewrites it', () => {
    const url = 'https://tryeatpal.com/blog/queries';
    const rows: PagePerformanceRow[] = [
      {
        page_url: url,
        date: '2026-07-20',
        clicks: 40,
        impressions: 400,
        position: 6,
        top_queries: [
          { query: 'food chaining', impressions: 300 },
          { query: 'picky eater plan', impressions: 100 },
        ],
      },
      { page_url: url, date: '2026-08-20', clicks: 1, impressions: 10, position: 30 },
    ];
    const [f] = detectDecay({ rows, asOf: ASOF });
    expect(f.topQueries).toEqual(['food chaining', 'picky eater plan']);
  });

  it('returns nothing for empty input or an unparseable asOf', () => {
    expect(detectDecay({ rows: [], asOf: ASOF })).toEqual([]);
    expect(detectDecay({ rows: decayingPage(), asOf: 'not-a-date' })).toEqual([]);
  });
});

describe('dedupeAgainstOpenApprovals (US-650)', () => {
  it('drops a page that already has an unresolved refresh approval', () => {
    const findings = detectDecay({ rows: decayingPage(), asOf: ASOF });
    expect(findings).toHaveLength(1);
    expect(
      dedupeAgainstOpenApprovals(findings, ['https://tryeatpal.com/blog/food-chaining'])
    ).toEqual([]);
  });

  it('matches across the URL forms GSC and the approval payload disagree on', () => {
    const findings = detectDecay({ rows: decayingPage(), asOf: ASOF });
    for (const stored of [
      '/blog/food-chaining',
      '/blog/food-chaining/',
      'https://tryeatpal.com/blog/food-chaining?utm_source=x',
      'HTTPS://TRYEATPAL.COM/blog/Food-Chaining',
    ]) {
      expect(dedupeAgainstOpenApprovals(findings, [stored])).toEqual([]);
    }
  });

  it('keeps a page whose open approval is for a different URL', () => {
    const findings = detectDecay({ rows: decayingPage(), asOf: ASOF });
    expect(dedupeAgainstOpenApprovals(findings, ['/blog/something-else'])).toHaveLength(1);
    expect(dedupeAgainstOpenApprovals(findings, [])).toHaveLength(1);
  });
});

describe('normalizeUrl (US-650)', () => {
  it.each([
    ['https://tryeatpal.com/blog/x', '/blog/x'],
    ['https://tryeatpal.com/blog/x/', '/blog/x'],
    ['http://tryeatpal.com/blog/x?a=1#b', '/blog/x'],
    ['/blog/x', '/blog/x'],
    ['https://tryeatpal.com/', '/'],
    ['https://tryeatpal.com', '/'],
    ['  /Blog/X  ', '/blog/x'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
});
