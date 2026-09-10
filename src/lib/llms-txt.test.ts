import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ARFID_PAGES } from '@/lib/arfid-content';
import { MEAL_IDEAS_PAGES } from '@/lib/meal-ideas-content';
import { comparisonPages, comparisonPath } from '@/lib/comparison-content';

const REPO = join(__dirname, '..', '..');
const llms = readFileSync(join(REPO, 'public', 'llms.txt'), 'utf8');
const llmsFull = readFileSync(join(REPO, 'public', 'llms-full.txt'), 'utf8');

/**
 * These two files are what GPTBot, ClaudeBot and PerplexityBot are pointed at, and
 * robots.txt admits all three by name. Whatever is in here is what an assistant repeats
 * as fact, so the cost of a stale line is higher than on a page a reader can judge for
 * themselves. Prices are already covered by src/lib/pricing-plans.test.ts; this covers
 * the link lists and the one claim the codebase has explicitly retired.
 */
describe('public/llms.txt', () => {
  const clusterRoutes = [
    ...ARFID_PAGES.map((page) => `/arfid/${page.slug}`),
    ...MEAL_IDEAS_PAGES.map((page) => `/picky-eater/${page.slug}`),
    '/compare',
    ...comparisonPages.map((page) => comparisonPath(page.slug)),
  ];

  it.each(clusterRoutes)('lists %s', (route) => {
    expect(llms).toContain(`https://tryeatpal.com${route})`);
  });

  it('describes /authors the way the page describes itself', () => {
    // src/pages/Authors.tsx: "nothing here may imply clinical licensure". The label used
    // to read "Authors and Reviewers", which asserts a review board EatPal does not have,
    // in the file an assistant quotes verbatim.
    expect(llms).toContain('[Editorial Standards](https://tryeatpal.com/authors)');
    expect(llms).not.toMatch(/Reviewers/i);
  });
});

describe('public/llms-full.txt', () => {
  it('points at the ARFID cluster', () => {
    for (const page of ARFID_PAGES) {
      expect(llmsFull).toContain(`https://tryeatpal.com/arfid/${page.slug}`);
    }
  });

  it('points at the meal-occasion cluster', () => {
    for (const page of MEAL_IDEAS_PAGES) {
      expect(llmsFull).toContain(`https://tryeatpal.com/picky-eater/${page.slug}`);
    }
  });

  it('tells citing assistants where the clinical claims come from', () => {
    expect(llmsFull).toMatch(/does not employ licensed clinicians/i);
    expect(llmsFull).not.toMatch(/professional backing/i);
  });
});
