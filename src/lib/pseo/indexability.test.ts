import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { MAX_INDEXABLE_TIER, isGuideIndexable } from './indexability';

const repoRoot = resolve(__dirname, '../../..');

describe('isGuideIndexable', () => {
  it('admits tiers at or below the threshold', () => {
    expect(isGuideIndexable({ tier: 1 })).toBe(true);
  });

  it('rejects tiers above the threshold', () => {
    expect(isGuideIndexable({ tier: 2 })).toBe(false);
    expect(isGuideIndexable({ tier: 3 })).toBe(false);
  });

  it('rejects a row with no tier rather than defaulting it in', () => {
    // Wrongly noindexing one good page costs a page. Wrongly indexing the long tail is
    // the domain-level risk the gate exists to prevent, so absence fails closed.
    expect(isGuideIndexable({})).toBe(false);
    expect(isGuideIndexable({ tier: null })).toBe(false);
    expect(isGuideIndexable({ tier: undefined })).toBe(false);
  });
});

/**
 * The threshold lives in three places that cannot import each other: this module, a Deno
 * edge function, and a JSON config read by the build script. If they drift, the site
 * either submits URLs it tells Google not to index, or silently indexes the long tail it
 * meant to hold back. Both are quiet failures, so pin them.
 */
describe('the three surfaces that gate the /guides cluster agree', () => {
  it('generate-sitemap uses the same tier ceiling', () => {
    const source = readFileSync(
      resolve(repoRoot, 'supabase/functions/generate-sitemap/index.ts'),
      'utf8'
    );

    const declared = source.match(/const MAX_INDEXABLE_TIER = (\d+);/);
    expect(declared, 'generate-sitemap must declare MAX_INDEXABLE_TIER').toBeTruthy();
    expect(Number(declared![1])).toBe(MAX_INDEXABLE_TIER);

    expect(source).toContain(".lte('tier', MAX_INDEXABLE_TIER)");
  });

  it('the prerender config filters guides to the same tier ceiling', () => {
    const config = JSON.parse(
      readFileSync(resolve(repoRoot, 'scripts/prerender-routes.json'), 'utf8')
    );

    const guides = config.dynamic.sources.find(
      (source: { name: string }) => source.name === 'pSEO guides'
    );
    expect(guides, 'prerender config must still have a pSEO guides source').toBeTruthy();
    expect(guides.filters).toContain(`tier=lte.${MAX_INDEXABLE_TIER}`);
    expect(guides.filters).toContain('generation_status=eq.published');
  });
});
