/**
 * Sitemap Edge Function
 *
 * GET /generate-sitemap -> application/xml
 *
 * edge-functions-server.ts has mapped "generate-sitemap" to this path all along, but
 * the file did not exist — so /sitemap.xml fell through to the six-URL hardcoded
 * fallback in the Cloudflare Pages function, and neither blog posts nor any of the
 * programmatic pSEO guides were ever submitted to search engines.
 *
 * The sitemap covers three groups:
 *   1. Static marketing routes (mirrors scripts/prerender-routes.json).
 *   2. Published blog posts.
 *   3. Published pSEO guides, mounted at /guides/<slug>. `pseo_pages.slug` already
 *      carries its own multi-segment prefix, matching the canonical_url the generator
 *      writes and the /guides/* route that serves them.
 *
 * Deliberately excluded: /auth (a login form is not a search result), /api/docs and
 * every authenticated app route (noindex), and anything behind ProtectedRoute.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_URL = 'https://tryeatpal.com';

interface SitemapEntry {
  path: string;
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: string;
  lastmod?: string;
}

/** Static routes. Keep in sync with scripts/prerender-routes.json. */
const STATIC_ENTRIES: SitemapEntry[] = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/pricing', changefreq: 'weekly', priority: '0.9' },
  { path: '/meal-plan', changefreq: 'monthly', priority: '0.8' },
  { path: '/picky-eater-quiz', changefreq: 'monthly', priority: '0.8' },
  { path: '/blog', changefreq: 'daily', priority: '0.8' },
  { path: '/guides', changefreq: 'weekly', priority: '0.8' },
  { path: '/budget-calculator', changefreq: 'monthly', priority: '0.7' },
  { path: '/faq', changefreq: 'monthly', priority: '0.7' },
  // /authors self-noindexes while public.blog_authors is empty (see src/pages/Authors.tsx),
  // so until real author rows exist this URL is submitted and then declined. Populate the
  // table, or drop this line, rather than leaving it in that state indefinitely.
  { path: '/authors', changefreq: 'monthly', priority: '0.6' },
  { path: '/contact', changefreq: 'monthly', priority: '0.6' },
  { path: '/accessibility', changefreq: 'yearly', priority: '0.4' },
  { path: '/accessibility/vpat', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
];

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

function isoDate(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString().split('T')[0];
}

export function renderSitemap(entries: SitemapEntry[], today: string): string {
  const urls = entries
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(`${BASE_URL}${entry.path}`)}</loc>
    <lastmod>${entry.lastmod ?? today}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

export default async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const today = new Date().toISOString().split('T')[0];

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    );

    const entries: SitemapEntry[] = [...STATIC_ENTRIES];

    const { data: posts, error: postsError } = await supabase
      .from('blog_posts')
      .select('slug, updated_at, published_at')
      .eq('status', 'published')
      .lte('published_at', new Date().toISOString())
      .order('published_at', { ascending: false });

    if (postsError) throw postsError;

    for (const post of posts ?? []) {
      entries.push({
        path: `/blog/${post.slug}`,
        changefreq: 'monthly',
        priority: '0.7',
        lastmod: isoDate(post.updated_at ?? post.published_at, today),
      });
    }

    // Only guides at or above the indexable tier are submitted. The rest stay
    // published and linked but carry noindex, so listing them here would submit URLs
    // we are simultaneously telling Google not to index.
    //
    // MAX_INDEXABLE_TIER is 1. This is a Deno edge function and cannot import from
    // src/, so the value is duplicated: the source of truth and the reasoning live in
    // src/lib/pseo/indexability.ts. Change both together, plus prerender-routes.json.
    const MAX_INDEXABLE_TIER = 1;

    const { data: guides, error: guidesError } = await supabase
      .from('pseo_pages')
      .select('slug, updated_at')
      .eq('generation_status', 'published')
      .lte('tier', MAX_INDEXABLE_TIER);

    if (guidesError) throw guidesError;

    for (const guide of guides ?? []) {
      entries.push({
        path: `/guides/${guide.slug}`,
        changefreq: 'monthly',
        priority: '0.6',
        lastmod: isoDate(guide.updated_at, today),
      });
    }

    return new Response(renderSitemap(entries, today), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    // Serve the static routes rather than a 500: an error response tells Search Console
    // the sitemap is broken, while a partial sitemap still gets the core pages crawled.
    console.error('Error generating sitemap:', error);
    return new Response(renderSitemap(STATIC_ENTRIES, today), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }
};
