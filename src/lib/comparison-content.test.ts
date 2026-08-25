import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { comparisonTargets } from '@/lib/geo-monitoring';
import {
  comparisonCanonical,
  comparisonPages,
  comparisonPath,
  eatpalSchemaItem,
  getComparison,
} from '@/lib/comparison-content';

/**
 * US-646. comparisonTargets and ComparisonSchema both existed for months with
 * no route rendering either of them. These assertions keep the three in sync and
 * pin the two content rules that are easy to break silently: never sweep the
 * table, and never quote a competitor's price.
 */
describe('comparison content covers every target', () => {
  it('builds one page per entry in comparisonTargets', () => {
    expect(comparisonPages).toHaveLength(comparisonTargets.length);
    expect(comparisonPages.map((p) => p.slug)).toEqual(comparisonTargets.map((t) => t.slug));
  });

  it.each(comparisonTargets.map((t) => t.slug))('%s resolves to content', (slug) => {
    const page = getComparison(slug);
    expect(page).not.toBeNull();
    expect(page!.rows.length).toBeGreaterThanOrEqual(4);
    expect(page!.chooseThemIf.length).toBeGreaterThanOrEqual(2);
    expect(page!.chooseEatPalIf.length).toBeGreaterThanOrEqual(2);
    expect(page!.verdict.length).toBeGreaterThan(40);
  });

  it('carries the title and differentiator straight from comparisonTargets', () => {
    for (const target of comparisonTargets) {
      const page = getComparison(target.slug)!;
      expect(page.title).toBe(target.comparisonTitle);
      expect(page.differentiator).toBe(target.keyDifferentiator);
      expect(page.competitor).toBe(target.competitor);
    }
  });

  it('returns null for a slug with no content', () => {
    expect(getComparison('eatpal-vs-something-we-never-wrote')).toBeNull();
    expect(getComparison(undefined)).toBeNull();
    expect(getComparison('')).toBeNull();
  });
});

describe('comparison content stays honest', () => {
  /**
   * The rule this enforces: a comparison table EatPal wins on every row is an
   * ad, not a comparison, and a reader who has used the other product stops
   * believing the rest of the page.
   */
  it.each(comparisonPages.map((p) => p.slug))(
    '%s admits at least one row the competitor wins',
    (slug) => {
      const page = getComparison(slug)!;
      expect(page.rows.some((row) => row.competitorWins)).toBe(true);
    }
  );

  it.each(comparisonPages.map((p) => p.slug))(
    '%s gives real reasons to pick the competitor',
    (slug) => {
      const page = getComparison(slug)!;
      for (const reason of page.chooseThemIf) {
        expect(reason.length).toBeGreaterThan(30);
      }
    }
  );

  /**
   * Competitor pricing goes stale within a quarter and a wrong price on a
   * comparison page is the kind of error that gets screenshotted. Pages link out
   * instead, so no dollar figure may appear in the body copy.
   */
  it.each(comparisonPages.map((p) => p.slug))('%s quotes no competitor price', (slug) => {
    const page = getComparison(slug)!;
    const prose = [
      page.competitorSummary,
      page.verdict,
      ...page.chooseThemIf,
      ...page.chooseEatPalIf,
      ...page.rows.flatMap((row) => [row.dimension, row.eatpal, row.competitor]),
    ].join(' ');
    expect(prose).not.toMatch(/\$\s?\d/);
    expect(prose).not.toMatch(/\d+\s?(?:USD|dollars)\b/i);
  });

  /**
   * ComparisonSchema's own docstring demonstrates rating 4.8 from 2,847
   * reviews. That number is not real and is not wired to a rating store; the
   * repo already stripped an invented aggregateRating once.
   */
  it('publishes no aggregate rating for EatPal', () => {
    expect(eatpalSchemaItem).not.toHaveProperty('rating');
    expect(eatpalSchemaItem).not.toHaveProperty('ratingCount');
  });

  it('links competitors with nofollow in the page template', () => {
    const source = readFileSync(path.resolve(__dirname, '../pages/ComparisonPage.tsx'), 'utf8');
    expect(source).toMatch(/rel="noopener noreferrer nofollow"/);
  });
});

describe('comparison URLs', () => {
  it.each(comparisonPages.map((p) => p.slug))('%s canonical matches its route', (slug) => {
    expect(comparisonCanonical(slug)).toBe(`https://tryeatpal.com${comparisonPath(slug)}`);
  });

  it('has no duplicate slugs', () => {
    const slugs = comparisonPages.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it.each(comparisonPages.map((p) => p.slug))('%s is a clean URL segment', (slug) => {
    expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('is routed in App.tsx for both the index and the detail page', () => {
    const app = readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');
    expect(app).toMatch(/path="\/compare"/);
    expect(app).toMatch(/path="\/compare\/:slug"/);
  });
});
