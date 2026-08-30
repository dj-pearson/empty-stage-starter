import { BlogFeedUnavailable, fetchFeedPosts, type BlogFeedEnv } from '../src/lib/blog-feed';
import { generateAtomFeed } from '../src/lib/rss-generator';

/**
 * Cloudflare Pages Function serving /feed.xml, the Atom counterpart to rss.xml.ts.
 * Same data, same failure behaviour, different format. See the note in rss.xml.ts for
 * why the static file had to go and why a failure is a 503 rather than an empty feed.
 */
export async function onRequest(context: { env: BlogFeedEnv }) {
  try {
    const posts = await fetchFeedPosts(context.env);

    return new Response(generateAtomFeed(posts, { feedUrl: 'https://tryeatpal.com/feed.xml' }), {
      headers: {
        'Content-Type': 'application/atom+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    const reason = error instanceof BlogFeedUnavailable ? error.message : String(error);
    console.error('[feed.xml] cannot build feed:', reason);

    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<!-- feed temporarily unavailable -->`, {
      status: 503,
      headers: {
        'Content-Type': 'application/atom+xml; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': '600',
      },
    });
  }
}
