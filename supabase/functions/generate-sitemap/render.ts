/**
 * Pure sitemap rendering. Kept out of index.ts so it can be unit-tested: index.ts
 * imports the Supabase client from esm.sh and reads Deno.env, neither of which a
 * vitest run can load, so anything living there can only ever be asserted as text.
 * src/lib/sitemap-render.test.ts imports this file directly and checks output.
 */

const BASE_URL = 'https://tryeatpal.com';

export interface SitemapEntry {
  path: string;
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: string;
  lastmod?: string;
}

/**
 * Escape the five XML predefined entities. Slugs come from the database, and a single
 * unescaped `&` makes the whole sitemap unparseable — search engines reject the file
 * outright rather than skipping the bad line.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * A row's timestamp as YYYY-MM-DD, or undefined when there is nothing real to report.
 *
 * Returning "today" for a missing or unparseable timestamp is what this used to do, and
 * it is the same lie as the one described above <lastmod> in renderSitemap.
 */
export function isoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().split('T')[0];
}

/**
 * <lastmod> is emitted only for URLs whose modification date we actually know.
 *
 * Every entry used to fall back to the date the sitemap was requested, so a crawler
 * fetching /sitemap.xml saw all 29 static routes -- /privacy, /terms, /accessibility,
 * the whole /compare cluster -- claiming they changed that morning, and saw the same
 * thing again the next morning. Google's documented response to a sitemap whose
 * lastmod values are demonstrably wrong is to stop trusting the field for the site,
 * which spends the signal on pages that never change and takes it away from the blog
 * posts and guides where updated_at is real and worth acting on.
 *
 * Omitting the element is the supported way to say "unknown": the sitemap protocol
 * marks lastmod optional per <url>, and Google's own guidance is to leave it out
 * rather than supply a value that is not the last significant change. So static
 * marketing routes carry loc/changefreq/priority and no date, while blog posts and
 * pSEO guides carry the timestamp their row was actually updated at.
 */
export function renderSitemap(entries: SitemapEntry[]): string {
  const urls = entries
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(`${BASE_URL}${entry.path}`)}</loc>
${entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>\n` : ''}    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}
