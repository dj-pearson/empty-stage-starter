import { BlogFeedUnavailable, fetchFeedPosts, type BlogFeedEnv } from '../src/lib/blog-feed';
import { generateRSSFeed } from '../src/lib/rss-generator';

/**
 * Cloudflare Pages Function serving /rss.xml from the database.
 *
 * It replaces public/rss.xml, a hand-written file listing six posts dated January 2025
 * while the site had 180 published. Deleting the static file is load-bearing rather than
 * tidying: Cloudflare serves a matching static asset in preference to a Function, so
 * leaving it in place would mean this code never runs. functions/sitemap.xml.ts works
 * the same way and has no public/sitemap.xml beside it.
 *
 * On failure this returns 503 rather than an empty feed, which is where it deliberately
 * differs from the sitemap function's hardcoded fallback. A sitemap listing fewer URLs
 * is harmless. A feed is a subscription: readers keep the items they already have when a
 * fetch fails, and would drop them for an empty document that claims the blog is empty.
 * 503 with Retry-After preserves every subscriber's copy and asks them to come back.
 */
export async function onRequest(context: { env: BlogFeedEnv }) {
  try {
    const posts = await fetchFeedPosts(context.env);

    return new Response(generateRSSFeed(posts), {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    const reason = error instanceof BlogFeedUnavailable ? error.message : String(error);
    console.error('[rss.xml] cannot build feed:', reason);

    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<!-- feed temporarily unavailable -->`, {
      status: 503,
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '600',
      },
    });
  }
}
