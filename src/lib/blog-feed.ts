import type { BlogPost } from "./rss-generator";
import { isRetiredBlogSlug } from "./retired-blog-slugs";

/**
 * The blog posts that go into /rss.xml and /feed.xml, read from the database.
 *
 * public/rss.xml and public/feed.xml used to be hand-written files listing six posts
 * dated January 2025, against 180 published. SEOHead renders a
 * <link rel="alternate" type="application/rss+xml"> on every page, so that stale list
 * was what every aggregator and feed reader saw, and it had not moved in a year and a
 * half. Those files are gone; functions/rss.xml.ts and functions/feed.xml.ts serve
 * those routes from this module instead, the same way functions/sitemap.xml.ts serves
 * /sitemap.xml.
 *
 * Retired duplicates are filtered here, which matters more than it looks. Twenty-nine
 * slugs are 301'd away by public/_redirects (see src/lib/retired-blog-slugs.ts), and
 * they still have published rows, so a naive query returns them. A feed that advertises
 * a URL the site immediately redirects is the same self-inflicted duplicate-content
 * signal the sitemap and the prerenderer already guard against.
 *
 * This runs in the Cloudflare Workers runtime, so it uses fetch against PostgREST
 * directly rather than the supabase-js client, matching what scripts/prerender.mjs does
 * for the same table.
 */

/** Credentials a Pages Function receives on `context.env`. */
export interface BlogFeedEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

/**
 * How many posts a feed carries. Feed readers show recent items and a full dump of 180
 * posts helps nobody, so this is the usual compromise: enough that a reader syncing
 * weekly never misses one, few enough that the document stays small.
 */
export const FEED_POST_LIMIT = 50;

/** The columns the feed needs. Selecting fewer keeps the payload small. */
const SELECT =
  "title,slug,excerpt,meta_description,published_at,updated_at,featured_image_url";

interface BlogPostRow {
  title: string;
  slug: string;
  excerpt: string | null;
  meta_description: string | null;
  published_at: string | null;
  updated_at: string | null;
  featured_image_url: string | null;
}

export class BlogFeedUnavailable extends Error {}

/**
 * Fetch published posts, newest first, with retired duplicates removed.
 *
 * Throws BlogFeedUnavailable rather than returning [] when the database cannot be
 * reached. An empty feed and a broken feed look identical to a reader, and the caller
 * needs to tell them apart to decide between serving a document and serving a 503.
 */
export async function fetchFeedPosts(
  env: BlogFeedEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<BlogPost[]> {
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new BlogFeedUnavailable(
      "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set in the Pages environment",
    );
  }

  const query = new URLSearchParams({
    select: SELECT,
    status: "eq.published",
    order: "published_at.desc",
    // Over-fetch, because retired duplicates are removed after the query and PostgREST
    // cannot filter on a list this long in a URL. 29 are retired, so this always leaves
    // enough to fill the feed.
    limit: String(FEED_POST_LIMIT + 40),
  });

  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/blog_posts?${query}`;
  const response = await fetchImpl(endpoint, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });

  if (!response.ok) {
    throw new BlogFeedUnavailable(
      `blog_posts query returned ${response.status} ${response.statusText}`,
    );
  }

  const rows = (await response.json()) as BlogPostRow[];

  return rows
    .filter((row) => row.slug && row.title && !isRetiredBlogSlug(row.slug))
    .slice(0, FEED_POST_LIMIT)
    .map(toBlogPost);
}

function toBlogPost(row: BlogPostRow): BlogPost {
  // published_at can be null on a row that was flipped to published without a date.
  // Dropping the post would hide it; dating it now would reorder the feed on every
  // request and make readers re-notify. updated_at is the closest real timestamp.
  const published = row.published_at ?? row.updated_at ?? new Date(0).toISOString();

  return {
    title: row.title,
    description: row.excerpt ?? row.meta_description ?? "",
    url: `https://tryeatpal.com/blog/${row.slug}`,
    publishedDate: published,
    ...(row.updated_at ? { modifiedDate: row.updated_at } : {}),
    ...(row.featured_image_url ? { image: row.featured_image_url } : {}),
  };
}
