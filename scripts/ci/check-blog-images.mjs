/**
 * Fails when a published blog post points at a featured or OG image that does not load.
 *
 * Four of the twenty highest-impression posts were serving an og:image that returned
 * HTTP 400 from Supabase storage. Nothing surfaced it: the URL column was populated, so
 * every code path treated the image as present. The fallback in src/pages/BlogPost.tsx
 * only triggers when both featured_image_url and og_image_url are null, which a dead
 * link is not.
 *
 * The cost is not cosmetic. The image is the og:image, the Article schema `image`, and
 * the on-page hero all at once, so one dead URL means no image in Google's index, a
 * broken preview card everywhere the post is shared, no Discover eligibility, and the
 * words "Image unavailable" rendered mid-article. The three worst-affected posts had
 * click-through rates of 0.82%, 0.12% and 0.16% against 2.35% across the posts in the
 * same group whose images load.
 *
 * Usage:
 *   node scripts/ci/check-blog-images.mjs           # fail on any broken image
 *   node scripts/ci/check-blog-images.mjs --warn    # report without failing
 *
 * Needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. Without them it skips rather
 * than fails, matching scripts/prerender.mjs, so a credential-less build still works.
 */

const WARN_ONLY = process.argv.includes('--warn');
const CONCURRENCY = 8;
const TIMEOUT_MS = 15_000;

function env(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

async function fetchPublishedPosts(supabaseUrl, anonKey) {
  const url = new URL('/rest/v1/blog_posts', supabaseUrl);
  url.searchParams.set('select', 'slug,featured_image_url,og_image_url');
  url.searchParams.set('status', 'eq.published');
  url.searchParams.set('limit', '1000');

  const response = await fetch(url, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });

  if (!response.ok) {
    throw new Error(`blog_posts query failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * HEAD first because it is cheaper, then GET on failure: some object stores reject HEAD
 * on a URL they would happily serve, and a false positive here blocks a deploy.
 */
async function imageStatus(url) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const response = await fetch(url, {
        method,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'follow',
      });
      if (response.ok) return { ok: true, status: response.status };
      if (method === 'GET') return { ok: false, status: response.status };
    } catch (error) {
      if (method === 'GET') return { ok: false, status: error.name === 'TimeoutError' ? 'timeout' : 'network error' };
    }
  }
  return { ok: false, status: 'unknown' };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const supabaseUrl = env('VITE_SUPABASE_URL');
  const anonKey = env('VITE_SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    console.warn('[blog-images] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set; skipping.');
    return;
  }

  const posts = await fetchPublishedPosts(supabaseUrl, anonKey);
  console.log(`[blog-images] checking ${posts.length} published posts`);

  // One post can carry two distinct URLs; check each URL once, not once per post.
  const targets = new Map();
  for (const post of posts) {
    for (const [field, url] of [
      ['featured_image_url', post.featured_image_url],
      ['og_image_url', post.og_image_url],
    ]) {
      if (!url) continue;
      if (!targets.has(url)) targets.set(url, []);
      targets.get(url).push(`${post.slug} (${field})`);
    }
  }

  const urls = [...targets.keys()];
  const statuses = await mapWithConcurrency(urls, CONCURRENCY, imageStatus);

  const broken = [];
  urls.forEach((url, index) => {
    if (!statuses[index].ok) {
      broken.push({ url, status: statuses[index].status, users: targets.get(url) });
    }
  });

  if (broken.length === 0) {
    console.log(`[blog-images] all ${urls.length} images load.`);
    return;
  }

  console.error(`\n[blog-images] ${broken.length} of ${urls.length} images do not load:\n`);
  for (const { url, status, users } of broken) {
    console.error(`  ${status}  ${url}`);
    for (const user of users) console.error(`      used by ${user}`);
  }
  console.error(
    '\n[blog-images] Re-upload the image, or null the column so the page falls back to ' +
      'Cover.webp instead of emitting a dead og:image.\n',
  );

  if (!WARN_ONLY) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[blog-images] fatal:', error.message);
  process.exitCode = 1;
});
