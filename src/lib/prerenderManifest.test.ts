import { describe, it, expect } from 'vitest';
import { buildPrerenderManifest } from '../../scripts/prerender.mjs';

/**
 * US-653. The manifest is what makes a prerender budget skip visible from
 * production. Before it, "2,000 guides are prerendered" and "1,400 are, and the
 * build warned about the rest in a log nobody kept" were indistinguishable
 * from outside the build.
 */
describe('buildPrerenderManifest (US-653)', () => {
  const run = {
    results: [{ route: '/pricing' }, { route: '/' }, { route: '/guides/a' }],
    skipped: ['/guides/z', '/guides/y'],
    failures: [{ route: '/guides/broken' }],
    budgetMs: 720_000,
    generatedAt: '2026-08-24T12:00:00.000Z',
  };

  it('records what rendered, what was skipped and what failed', () => {
    expect(buildPrerenderManifest(run)).toEqual({
      generatedAt: '2026-08-24T12:00:00.000Z',
      budgetMs: 720_000,
      rendered: ['/', '/guides/a', '/pricing'],
      skipped: ['/guides/y', '/guides/z'],
      failed: ['/guides/broken'],
    });
  });

  it('sorts and dedupes so the manifest does not churn between builds', () => {
    // Route order depends on scheduling, and this file is diffed deploy to
    // deploy; an unsorted list changes on every build for no reason.
    const shuffled = buildPrerenderManifest({
      ...run,
      results: [{ route: '/guides/a' }, { route: '/pricing' }, { route: '/' }, { route: '/' }],
    });
    expect(shuffled.rendered).toEqual(['/', '/guides/a', '/pricing']);
  });

  it('keeps skipped separate from failed', () => {
    // They need different responses: skipped means raise the budget, failed
    // means the route is broken. Merging them hides both.
    const manifest = buildPrerenderManifest(run);
    expect(manifest.skipped).not.toContain('/guides/broken');
    expect(manifest.failed).not.toContain('/guides/z');
  });

  it('produces empty arrays for a clean run rather than omitting the keys', () => {
    const manifest = buildPrerenderManifest({
      results: [],
      skipped: [],
      failures: [],
      budgetMs: 1,
      generatedAt: '2026-08-24T12:00:00.000Z',
    });
    expect(manifest.rendered).toEqual([]);
    expect(manifest.skipped).toEqual([]);
    expect(manifest.failed).toEqual([]);
  });

  it('tolerates missing arrays instead of throwing mid-build', () => {
    const manifest = buildPrerenderManifest({
      budgetMs: 1,
      generatedAt: '2026-08-24T12:00:00.000Z',
    });
    expect(manifest).toMatchObject({ rendered: [], skipped: [], failed: [] });
  });
});
