/**
 * Which programmatic guides are allowed into the search index.
 *
 * Until this change, `generation_status = 'published'` was the only gate on the
 * /guides cluster, and it controlled three things at once: what the sitemap submits,
 * what the build prerenders, and what RLS exposes publicly. So "written" and "ranked"
 * were the same decision, and the taxonomy targets 1,500 pages.
 *
 * On a domain that has not established authority yet, publishing a large programmatic
 * cluster all at once is the thing that gets a site classed as scaled content abuse.
 * The risk is not per-page: a mass of thin pages drags the whole domain, including the
 * pages that would otherwise rank. Indexing the strongest slice first and widening it
 * as the domain earns authority is the lower-variance path to the same place.
 *
 * `tier` is already on the table (1 = high priority/traffic, 2 = medium, 3 = long-tail)
 * and already indexed, so it is the gate. Tier 1 is the highest-volume safe foods -
 * chicken nuggets, mac and cheese, plain pasta - which are the queries worth competing
 * for first anyway.
 *
 * Everything below the threshold stays published, reachable, and internally linked.
 * It just carries `noindex, follow`, drops out of the sitemap, and is skipped by the
 * prerenderer. `follow` matters: link equity still flows through those pages to the
 * ones that are indexed.
 *
 * To widen the cluster, raise MAX_INDEXABLE_TIER to 2, then 3. Three places read this
 * rule and they must agree, or the site submits URLs it tells Google not to index:
 *
 *   1. src/pages/pseo/PseoPage.tsx      - the robots meta tag on the page itself
 *   2. supabase/functions/generate-sitemap/index.ts - which URLs get submitted
 *   3. scripts/prerender-routes.json    - which routes get static HTML at build time
 *
 * The latter two cannot import from this file (a Deno edge function and a JSON config),
 * so both carry a comment pointing back here. Change the threshold in all three.
 */

/** Highest `tier` value allowed into the index. 1 = high traffic, 2 = medium, 3 = long-tail. */
export const MAX_INDEXABLE_TIER = 1;

/**
 * Whether a guide should be indexable.
 *
 * `tier` is nullable in the schema and defaults to 1. A row that somehow has no tier is
 * treated as not indexable rather than indexable: the failure mode of wrongly noindexing
 * one good page is a lost page, while the failure mode of wrongly indexing the long tail
 * is the domain-level risk this whole gate exists to avoid.
 */
export function isGuideIndexable(page: { tier?: number | null }): boolean {
  return typeof page.tier === 'number' && page.tier <= MAX_INDEXABLE_TIER;
}
