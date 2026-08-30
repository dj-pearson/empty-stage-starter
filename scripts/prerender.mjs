/**
 * Build-time prerenderer (US-570)
 *
 * EatPal ships as a client-rendered SPA: `dist/index.html` contains an empty
 * `<div id="root">` and nothing else. Googlebot renders JavaScript so it eventually
 * sees the page, but the crawlers that matter most for the traffic we are missing do
 * not: GPTBot, PerplexityBot, ClaudeBot, Bingbot's first pass, and every social
 * scraper (Facebook, Slack, LinkedIn, iMessage) read the raw HTML only. Today they
 * see a blank shell for every URL on the site.
 *
 * This script runs after `vite build`, loads each public route in headless Chromium,
 * waits for React + react-helmet-async to settle, and writes the resulting HTML to
 * `dist/<route>/index.html`. Cloudflare Pages serves those files directly, so crawlers
 * get real content and the correct per-route <head> with zero runtime cost.
 *
 * It is a prerender, not SSR: the client still boots normally and `createRoot` replaces
 * the snapshot. Nothing user-specific may be baked in, which is why only public,
 * unauthenticated routes are listed in prerender-routes.json.
 *
 * Usage:  node scripts/prerender.mjs [--dist dist] [--base https://tryeatpal.com]
 * Skip:   PRERENDER=0 npm run build
 */

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveChromium } from './resolve-chromium.mjs';

/**
 * Duplicate blog URLs that public/_redirects 301s to the copy that ranks.
 *
 * Parsed out of the TypeScript module rather than re-listed here. This script is .mjs
 * and cannot import a .ts file, and a hand-copied list is exactly the drift that leaves
 * a static file sitting on top of a redirect. Throwing on an empty parse is the point:
 * silently finding no slugs would prerender all 29 retired URLs and quietly undo the
 * consolidation. See src/lib/retired-blog-slugs.ts.
 */
const RETIRED_BLOG_SLUGS = (() => {
  const source = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'retired-blog-slugs.ts'),
    'utf8'
  );
  const body = source.slice(source.indexOf('RETIRED_BLOG_SLUGS'));
  const slugs = [...body.matchAll(/^\s*"([a-z0-9-]+)":/gm)].map((m) => m[1]);
  if (slugs.length === 0) {
    throw new Error(
      '[prerender] parsed zero slugs from src/lib/retired-blog-slugs.ts — the file format ' +
        'changed and retired duplicates would be prerendered on top of their redirects'
    );
  }
  return new Set(slugs);
})();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const DIST = path.resolve(projectRoot, getArg('dist', 'dist'));
const ROUTES_FILE = path.join(__dirname, 'prerender-routes.json');

/** Wall-clock budget per route before we give up and fail the build. */
const ROUTE_TIMEOUT_MS = 45_000;
/**
 * How many routes render at once. The static list is 14 routes, but the
 * discovered list is capped at 500 blog posts + 2000 pSEO pages, and Cloudflare
 * Pages kills a build at 20 minutes -- serial rendering would blow that budget
 * long before it ran out of routes. Pages are cheap; the browser is not.
 */
const CONCURRENCY = Math.max(1, Number(process.env.PRERENDER_CONCURRENCY) || 4);
/**
 * Share of DISCOVERED routes allowed to fail before the build fails with them.
 * A curated static route failing always fails the build -- that list is fixed
 * and a break there means the marketing site is broken. Discovered routes are
 * different: one post with a bad fetch should not block a deploy of the other
 * 499, but an RLS change that takes out every blog read must not pass as 500
 * individually-tolerable failures. A rate, not a count, is what separates
 * those two.
 */
const DYNAMIC_FAILURE_TOLERANCE = 0.1;
/**
 * Wall-clock ceiling for the whole prerender pass.
 *
 * Cloudflare Pages kills a build at 20 minutes, and that budget also has to
 * cover the install and `vite build`. Measured on a 4-CPU runner at the default
 * concurrency, a static marketing route costs ~310ms; a blog or guide route
 * costs more, because it waits on a live Supabase read before its content
 * exists. Discovery is capped at 500 posts plus 2000 guides, so a fully
 * populated site can want more time than the whole build has.
 *
 * When the budget runs out, the curated static routes have already been
 * rendered (they are first in the queue) and the remaining discovered routes
 * are skipped and COUNTED -- they ship as client-rendered shells, which is what
 * they were before this script existed. A build that overruns and gets killed
 * ships nothing at all, so a partial prerender is strictly the better failure.
 */
const BUDGET_MS = Math.max(1, Number(process.env.PRERENDER_BUDGET_MS) || 720_000);
/**
 * How long the <head> must stop changing before a snapshot is taken.
 *
 * This was a flat 700ms sleep, and that is not enough for the schema
 * components, which arrive in a lazily-imported chunk AFTER Helmet has already
 * committed the title, description and canonical. Three builds of the same
 * commit measured the homepage at 5, 5 and 1 ld+json blocks: one run in three
 * shipped / with only the static Organization/WebSite graph from index.html and
 * none of its Helmet-managed WebPage, Organization, SoftwareApplication or
 * FAQPage markup. Every check passed, because the count was reported and never
 * asserted on. The homepage is the most linked page on the site and its
 * structured data was a coin flip.
 *
 * Waiting for the head to go quiet handles a slow chunk instead of guessing at
 * one. It is a floor, not a fixed cost: a head that settles immediately still
 * waits this long and no longer.
 */
const HEAD_QUIET_MS = 700;
/**
 * Budget for the <head> to name the route being rendered. Separate from (and
 * much shorter than) ROUTE_TIMEOUT_MS: navigation can legitimately be slow,
 * but once the app has painted, Helmet commits in the same tick. A route still
 * wearing the shell's head after this long is not slow, it is wrong.
 */
const HEAD_TIMEOUT_MS = 15_000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/**
 * Static server over dist/ with SPA fallback.
 *
 * The fallback serves `shellHtml` — a snapshot of index.html taken BEFORE we start
 * writing prerendered output. Without that snapshot, prerendering `/` first would
 * make every later route boot from an already-prerendered homepage.
 */
function startServer(distDir, shellHtml) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const filePath = path.join(distDir, decodeURIComponent(url.pathname));

    // Reject traversal outside dist/
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    try {
      if (path.extname(filePath) && existsSync(filePath)) {
        const body = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(body);
        return;
      }
    } catch {
      /* fall through to the shell */
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(shellHtml);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/**
 * Expand DB-backed routes (blog posts today) by querying PostgREST directly.
 * Returns [] with a warning when credentials are missing so a credential-less build
 * still produces the static routes rather than failing outright.
 */
export async function discoverDynamicRoutes(config) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.warn(
      '[prerender] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — skipping dynamic routes.\n' +
        '            Blog posts and every /guides/* pSEO page will ship client-rendered only,\n' +
        '            so the crawlers that do not run JavaScript (GPTBot, PerplexityBot, ClaudeBot,\n' +
        '            social scrapers) will see the SPA shell instead of the content at those URLs.\n' +
        '            Set both in the build environment (Cloudflare Pages > Settings > Environment\n' +
        '            variables) to prerender them. This is the single highest-impact setting for\n' +
        '            getting the programmatic content indexed.'
    );
    return [];
  }

  const routes = [];
  for (const source of config.sources ?? []) {
    const query = new URLSearchParams({ select: source.select });
    // `filter` is a single "column=operator.value" string; `filters` is an array of the
    // same, ANDed together by PostgREST. Both are supported so existing single-filter
    // sources keep working.
    const filters = source.filters ?? (source.filter ? [source.filter] : []);
    for (const filter of filters) {
      const separator = filter.indexOf('=');
      if (separator === -1) {
        console.warn(`[prerender] ${source.name}: ignoring malformed filter "${filter}".`);
        continue;
      }
      query.set(filter.slice(0, separator), filter.slice(separator + 1));
    }
    query.set('limit', String(source.limit ?? 500));

    const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${source.table}?${query}`;
    try {
      const res = await fetch(endpoint, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      });
      if (!res.ok) {
        console.warn(`[prerender] ${source.name}: ${res.status} ${res.statusText} — skipping.`);
        continue;
      }
      const rows = await res.json();
      let retired = 0;
      for (const row of rows) {
        const route = source.pattern.replace(/:(\w+)/g, (_, key) => row[key] ?? '');
        if (route.includes('//') || route.endsWith('/')) continue;
        // A retired duplicate still has a published row, so it is still discovered here.
        // Writing dist/blog/<slug>/index.html for one would leave a real static asset at
        // a path public/_redirects is trying to 301 away, and a static file can win. The
        // URL would stay alive and keep competing with the copy it was folded into.
        // See src/lib/retired-blog-slugs.ts.
        if (RETIRED_BLOG_SLUGS.has(route.replace(/^\/blog\//, ''))) {
          retired += 1;
          continue;
        }
        routes.push(route);
      }
      console.log(
        `[prerender] ${source.name}: discovered ${rows.length} route(s)` +
          (retired > 0 ? `, skipped ${retired} retired duplicate(s).` : '.')
      );
    } catch (error) {
      console.warn(`[prerender] ${source.name}: ${error.message} — skipping.`);
    }
  }
  return routes;
}

/**
 * Decide whether a set of prerender failures should fail the build.
 *
 * Exported so the policy can be tested without launching a browser: it is the
 * one piece of this script that decides whether a deploy goes out.
 *
 * `dynamicTotal` is the number of discovered routes ATTEMPTED, not discovered:
 * routes the wall-clock budget skipped never had a chance to fail.
 *
 * @param {{staticFailed: number, dynamicTotal: number, dynamicFailed: number}} counts
 * @returns {{fatal: boolean, reason: string}}
 */
/**
 * US-653: the record of what a build actually rendered.
 *
 * scripts/prerender-routes.json is the intent. This is the result, and the two
 * diverge whenever the wall-clock budget runs out mid-run -- which used to be
 * visible only as a warning in a build log nothing downstream could read, so a
 * route shipping as a client-rendered shell was invisible from production.
 * src/lib/seo/indexCoverage.ts reconciles the sitemap against this.
 *
 * Split out and exported for the same reason classifyPrerenderFailures is: it
 * is decidable without a browser, so it can have tests.
 *
 * @param {{results: Array<{route: string}>, skipped: string[],
 *          failures: Array<{route: string}>, budgetMs: number,
 *          generatedAt: string}} run
 */
export function buildPrerenderManifest({ results, skipped, failures, budgetMs, generatedAt }) {
  // Sorted and deduped: the manifest is diffed between builds, and route order
  // depends on scheduling, so an unsorted list churns on every deploy.
  const uniqueSorted = (values) => [...new Set(values)].sort();
  return {
    generatedAt,
    budgetMs,
    rendered: uniqueSorted((results ?? []).map((r) => r.route)),
    skipped: uniqueSorted(skipped ?? []),
    failed: uniqueSorted((failures ?? []).map((f) => f.route)),
  };
}

export function classifyPrerenderFailures({ staticFailed, dynamicTotal, dynamicFailed }) {
  if (staticFailed > 0) {
    return {
      fatal: true,
      reason:
        `${staticFailed} curated route(s) failed. These are a fixed list of public marketing ` +
        'pages; a failure there means the site itself is broken, not that one row was bad.',
    };
  }

  if (dynamicFailed === 0) return { fatal: false, reason: '' };

  const rate = dynamicFailed / dynamicTotal;
  if (rate > DYNAMIC_FAILURE_TOLERANCE) {
    return {
      fatal: true,
      reason:
        `${dynamicFailed}/${dynamicTotal} discovered route(s) failed (` +
        `${(rate * 100).toFixed(1)}%, over the ${DYNAMIC_FAILURE_TOLERANCE * 100}% tolerance). ` +
        'A failure rate this high is a systemic read problem -- an RLS rule, a schema change, ' +
        'a down database -- not a handful of bad rows.',
    };
  }

  return {
    fatal: false,
    reason:
      `${dynamicFailed}/${dynamicTotal} discovered route(s) failed, under the ` +
      `${DYNAMIC_FAILURE_TOLERANCE * 100}% tolerance. They ship as client-rendered shells, ` +
      'which is what they were before this script existed. Fix them, but do not block the deploy.',
  };
}

/** "/blog/" and "/blog" are the same route; "/" stays "/". */
const normalisePath = (p) => p.replace(/\/+$/, '') || '/';

/**
 * Everything that decides whether a snapshot is fit to ship, as one pure
 * function so it can be tested without a browser. It throws rather than
 * returning a verdict because the only reasonable response to any of these is
 * to refuse the route, and the thrown message is what reaches the build log.
 */
export function validateSnapshot(
  { title, description, canonical, textLength, ldJsonCount, helmetLdJsonCount },
  route
) {
  // A snapshot missing any of these is worse than no snapshot: it would freeze a broken
  // <head> into the file crawlers read. Fail loudly instead of shipping it.
  if (!title) throw new Error('rendered page has no <title>');
  if (!description) throw new Error('rendered page has no meta description');
  if (!canonical) throw new Error('rendered page has no canonical link');
  if (textLength < 200) throw new Error(`rendered body text is only ${textLength} chars`);
  // Every one of the 16 routes renders at least one schema component, so zero
  // Helmet-managed ld+json means the chunk carrying them never mounted -- the
  // exact shape of the degraded homepage described at HEAD_QUIET_MS. Checked
  // rather than reported, because a count in a build log is not a guardrail.
  if (helmetLdJsonCount < 1) {
    throw new Error(
      `rendered page has no app-rendered structured data (${ldJsonCount} ld+json block(s), ` +
        'none of them Helmet-managed) -- the schema components did not mount'
    );
  }

  // ...and a snapshot carrying the WRONG head is worse than one missing it. The
  // four checks above are all satisfied by a page that failed to load its own
  // content: an "Article Not Found" render inherits index.html's title,
  // description and canonical, and the cookie banner alone clears 200 chars. A
  // dynamic route whose data fetch fails at prerender time would be frozen as a
  // not-found page canonicalised to the homepage, and shipped to crawlers as a
  // 200. Anchor the check to the route actually being rendered.
  let canonicalPath;
  try {
    canonicalPath = normalisePath(new URL(canonical, 'https://tryeatpal.com').pathname);
  } catch {
    throw new Error(`rendered page has an unparseable canonical: ${canonical}`);
  }
  if (canonicalPath !== normalisePath(route)) {
    throw new Error(
      `canonical points at ${canonicalPath} but this is ${normalisePath(route)} — ` +
        'the page most likely rendered an error state and inherited the shell head'
    );
  }

}

/** dist/pricing/index.html for "/pricing"; dist/index.html for "/". */
function outputPathFor(route) {
  if (route === '/') return path.join(DIST, 'index.html');
  return path.join(DIST, route.replace(/^\//, ''), 'index.html');
}

async function prerenderRoute(page, origin, route) {
  const response = await page.goto(`${origin}${route}`, {
    waitUntil: 'load',
    timeout: ROUTE_TIMEOUT_MS,
  });

  if (response && !response.ok()) {
    throw new Error(`server responded ${response.status()}`);
  }

  // Wait for React to actually put something in #root. `load` only tells us the shell
  // arrived; without this we would happily snapshot the empty div we are trying to fix.
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      return !!root && root.childElementCount > 0 && root.innerText.trim().length > 0;
    },
    { timeout: ROUTE_TIMEOUT_MS }
  );

  // #root having text does not mean react-helmet-async has flushed. Until it
  // commits, the document still wears index.html's <head> -- so snapshotting
  // after a fixed sleep is a race. It held at CONCURRENCY=1 and broke on the
  // first run at 4: /faq, /pricing and /blog were captured still carrying the
  // shell's homepage canonical, and the route-anchored check below caught all
  // three. Wait for the head to actually name this route rather than guessing
  // how long Helmet needs under load.
  //
  // "/" is the one route this cannot vouch for: index.html ships a static
  // <link rel=canonical href=https://tryeatpal.com/> (which is exactly why an
  // error state on any other route inherits the homepage canonical), so the
  // condition is already true before React boots, so it does not gate at all
  // there -- the head-quiet wait below is what actually covers "/".
  try {
    await page.waitForFunction(
      (expected) => {
        const href = document.head
          .querySelector('link[rel="canonical"]')
          ?.getAttribute('href');
        if (!href) return false;
        try {
          return (
            (new URL(href, 'https://tryeatpal.com').pathname.replace(/\/+$/, '') || '/') === expected
          );
        } catch {
          return false;
        }
      },
      normalisePath(route),
      { timeout: HEAD_TIMEOUT_MS }
    );
  } catch {
    // Playwright's own message here is just "Timeout exceeded", which tells a
    // build log nothing. Say what did not happen.
    throw new Error(
      `<head> never claimed ${normalisePath(route)} within ${HEAD_TIMEOUT_MS}ms — ` +
        'the route most likely rendered an error state and kept the shell head'
    );
  }

  // Let lazily-imported sections (hero, schema components) mount and Helmet
  // flush. The canonical check above cannot stand in for this: it passes as
  // soon as Helmet commits the canonical, which happens BEFORE the schema chunk
  // mounts -- the degraded homepage carried 29 data-rh head tags and zero
  // Helmet ld+json. And on "/" the canonical check does not gate at all, since
  // index.html already claims that path.
  //
  // Signature counts head children and ld+json blocks rather than hashing
  // innerHTML: attribute churn on an existing tag is not a mount, and something
  // that rewrites a meta tag on a timer would never let a hash go quiet.
  // Wait for the schema chunk itself, not merely for the head to go quiet.
  //
  // The quiet wait below is NOT sufficient on its own, and that was measured
  // rather than assumed: the head settles at (children=N, ld+json=1) and stays
  // there while the lazily-imported schema components are still loading, so a
  // quiet window elapses and the snapshot is taken early -- exactly what the
  // flat sleep did. Sampling the same dist repeatedly, the old script shipped a
  // homepage with no app-rendered structured data in 1 run of 6, and adding
  // only the quiet wait still failed 1 of 8.
  //
  // Every route in prerender-routes.json renders at least one schema component,
  // so "a Helmet-managed ld+json exists" is a real invariant to wait on. The
  // guardrail after the snapshot stays as the backstop: if this ever times out
  // on a route that genuinely has none, the build says so instead of silently
  // shipping a page without its structured data.
  try {
    await page.waitForFunction(
      () => !!document.head.querySelector('script[type="application/ld+json"][data-rh]'),
      undefined,
      { timeout: HEAD_TIMEOUT_MS, polling: 100 }
    );
  } catch {
    // Same reason the canonical wait above catches: playwright's own message is
    // "Timeout exceeded", which in a build log names neither the route nor what
    // was being waited for.
    throw new Error(
      `no app-rendered structured data appeared within ${HEAD_TIMEOUT_MS}ms — ` +
        'the schema components never mounted, so this snapshot would ship with ' +
        "only index.html's static ld+json"
    );
  }

  await page.waitForFunction(
    (quietMs) => {
      const head = document.head;
      const signature = `${head.children.length}:${
        head.querySelectorAll('script[type="application/ld+json"]').length
      }`;
      const w = /** @type {Record<string, unknown>} */ (window);
      if (w.__prerenderHeadSignature !== signature) {
        w.__prerenderHeadSignature = signature;
        w.__prerenderHeadSince = performance.now();
        return false;
      }
      return performance.now() - Number(w.__prerenderHeadSince ?? 0) >= quietMs;
    },
    HEAD_QUIET_MS,
    { timeout: HEAD_TIMEOUT_MS, polling: 100 }
  );

  const {
    html,
    title,
    description,
    canonical,
    ldJsonCount,
    helmetLdJsonCount,
    textLength,
    markupLength,
  } =
    await page.evaluate(() => {
    // The GA loader attaches listeners and would re-run on the static copy anyway; it is
    // already deferred, so leave it. Do strip the Vite dev-only artifacts if any slipped in.
    document.querySelectorAll('script[src*="@vite/client"]').forEach((el) => el.remove());
    const head = document.head;
    return {
      html: `<!doctype html>\n${document.documentElement.outerHTML}`,
      title: document.title,
      description: head.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
      canonical: head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
      ldJsonCount: head.querySelectorAll('script[type="application/ld+json"]').length,
      // Split out because the two numbers fail differently. index.html ships one
      // static ld+json graph, so a total of 1 looks like "has structured data"
      // while meaning the app contributed none of its own. Helmet stamps
      // data-rh on everything it manages, which is what tells them apart.
      helmetLdJsonCount: head.querySelectorAll(
        'script[type="application/ld+json"][data-rh]'
      ).length,
      // Two different questions, and they answer differently enough to mislead.
      //
      // textLength is #root.innerText -- what Chromium considers RENDERED. It is
      // the right signal for "did the app actually boot", which is what the
      // floor check below uses it for.
      //
      // markupLength is the text a crawler extracts from the saved HTML, which
      // is what this story is actually about ("content is present in initial
      // HTML"). It counts DOM text that innerText discounts as not laid out --
      // below-the-fold sections, collapsed panels, anything an animation has
      // not revealed yet. On the homepage the two read 1.4k and 10.7k, and a
      // log showing only the first makes the most important page in the site
      // look like it prerendered almost nothing.
      markupLength: (document.getElementById('root')?.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim().length,
      textLength: (document.getElementById('root')?.innerText ?? '').trim().length,
    };
  });

  validateSnapshot(
    { title, description, canonical, textLength, ldJsonCount, helmetLdJsonCount },
    route
  );

  const outPath = outputPathFor(route);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf8');

  return {
    outPath,
    title,
    canonical,
    ldJsonCount,
    helmetLdJsonCount,
    textLength,
    markupLength,
    bytes: Buffer.byteLength(html),
  };
}

async function main() {
  if (process.env.PRERENDER === '0') {
    console.log('[prerender] PRERENDER=0 — skipping. The site will ship client-rendered only.');
    return;
  }

  await access(path.join(DIST, 'index.html')).catch(() => {
    throw new Error(`No ${path.join(DIST, 'index.html')} — run \`vite build\` first.`);
  });

  const config = JSON.parse(await readFile(ROUTES_FILE, 'utf8'));
  const dynamicRoutes = await discoverDynamicRoutes(config.dynamic ?? {});

  // Kind travels with the route because the failure policy below treats the two
  // lists differently. A route in both lists counts as static, the stricter of
  // the two.
  const staticSet = new Set(config.static);
  const routes = [
    ...config.static.map((route) => ({ route, kind: 'static' })),
    ...[...new Set(dynamicRoutes)]
      .filter((route) => !staticSet.has(route))
      .map((route) => ({ route, kind: 'dynamic' })),
  ];

  // Snapshot the un-prerendered shell and keep a copy on disk. app-shell.html is the
  // document Cloudflare Pages can be pointed at for routes we do not prerender, and it
  // is what this script's own dev server falls back to.
  const shellHtml = await readFile(path.join(DIST, 'index.html'), 'utf8');

  // Running this twice without an intervening `vite build` would take the
  // PREVIOUS run's prerendered homepage as the shell, so every other route
  // would render on top of homepage markup and bake the remnants into its
  // snapshot. Sizes drift and nothing reports an error. `npm run build` always
  // rebuilds first; a manual re-run is the case this catches.
  if (!/<div id="root">\s*<\/div>/.test(shellHtml)) {
    throw new Error(
      `${path.join(DIST, 'index.html')} is already prerendered (its #root is not empty). ` +
        'Run `vite build` again before prerendering, or use `npm run build`.'
    );
  }

  await copyFile(path.join(DIST, 'index.html'), path.join(DIST, 'app-shell.html'));

  const { chromium } = await import('playwright');
  const { server, port } = await startServer(DIST, shellHtml);
  const startedAtOverall = Date.now();
  const origin = `http://127.0.0.1:${port}`;

  const failures = [];
  const results = [];
  const skipped = [];
  let browser;

  try {
    // US-637: resolve through the same helper ensure-chromium.mjs uses, so a
    // browser it accepted is the browser launched here. `pinned` means
    // Playwright can find its own build and needs no override; `override` and
    // `probed` both have to be passed explicitly, since Playwright would
    // otherwise look for the exact build number it pins and miss a pre-baked one.
    const resolved = await resolveChromium();
    if (resolved && resolved.source !== 'pinned') {
      console.log(`[prerender] using chromium (${resolved.source}): ${resolved.executablePath}`);
    }

    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      ...(resolved && resolved.source !== 'pinned' && {
        executablePath: resolved.executablePath,
      }),
    });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      // Prerendering is a crawler-facing artifact: take the reduced-motion path so GSAP
      // never leaves an element mid-animation at opacity:0 in the snapshot.
      reducedMotion: 'reduce',
      userAgent:
        'Mozilla/5.0 (compatible; EatPalPrerender/1.0; +https://tryeatpal.com) HeadlessChrome',
    });

    // One page per worker, pulled from a shared queue, so a slow route delays
    // only its own worker. Output interleaves; the per-line route name is what
    // identifies it.
    const queue = [...routes];
    const startedAt = Date.now();
    const worker = async () => {
      const page = await context.newPage();
      page.on('pageerror', (err) => console.warn(`[prerender]   page error: ${err.message}`));
      for (;;) {
        const next = queue.shift();
        if (!next) break;
        const { route, kind } = next;

        // Static routes are never skipped: they are 14 curated marketing pages
        // and they are what the budget exists to protect.
        if (kind === 'dynamic' && Date.now() - startedAt > BUDGET_MS) {
          skipped.push(route);
          continue;
        }

        try {
          const result = await prerenderRoute(page, origin, route);
          results.push({ route, kind, ...result });
          console.log(
            `[prerender] ✓ ${route.padEnd(28)} ${String(result.markupLength).padStart(6)} chars  ` +
              `${result.ldJsonCount} ld+json  ${(result.bytes / 1024).toFixed(0)}kb`
          );
        } catch (error) {
          failures.push({ route, kind, message: error.message });
          console.error(`[prerender] ✗ ${route} — ${error.message}`);
        }
      }
      await page.close();
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, routes.length || 1) }, () => worker())
    );

    await context.close();
  } finally {
    // Always tear these down: an un-closed http server keeps the event loop alive and
    // the build hangs instead of reporting the failure that got us here.
    await browser?.close().catch(() => {});
    server.close();
  }

  const elapsedMs = Date.now() - startedAtOverall;
  console.log(
    `\n[prerender] ${results.length}/${routes.length} route(s) prerendered in ` +
      `${(elapsedMs / 1000).toFixed(1)}s (budget ${(BUDGET_MS / 1000).toFixed(0)}s).`
  );

  // US-653: write what this build actually rendered next to the output, so the
  // index coverage report can reconcile the sitemap against reality instead of
  // against scripts/prerender-routes.json, which is the intent rather than the
  // result. A build-log warning tells whoever reads the log; nothing downstream
  // could read it, which is why a budget skip was invisible from production.
  await writeFile(
    path.join(DIST, 'prerender-manifest.json'),
    JSON.stringify(
      buildPrerenderManifest({
        results,
        skipped,
        failures,
        budgetMs: BUDGET_MS,
        generatedAt: new Date().toISOString(),
      }),
      null,
      2
    ),
    'utf8'
  );
  console.log(`[prerender] wrote ${path.join(DIST, 'prerender-manifest.json')}.`);

  if (skipped.length) {
    // Never a silent truncation: a build log that does not say what was dropped
    // reads as "everything is prerendered" when it is not.
    console.warn(
      `\n[prerender] ${skipped.length} discovered route(s) were NOT prerendered -- the ` +
        `${(BUDGET_MS / 1000).toFixed(0)}s budget ran out. They ship as client-rendered\n` +
        `            shells. Raise PRERENDER_BUDGET_MS or PRERENDER_CONCURRENCY, or narrow\n` +
        `            the discovery limits in scripts/prerender-routes.json. First few:\n` +
        skipped.slice(0, 5).map((r) => `              ${r}`).join('\n')
    );
  }

  if (!failures.length) return;

  const verdict = classifyPrerenderFailures({
    staticFailed: failures.filter((f) => f.kind === 'static').length,
    // Attempted, not discovered. A route the budget skipped was never given a
    // chance to fail, so counting it here would dilute the failure rate: 2 real
    // failures out of 10 attempted is a 20% problem, and calling it 2 out of
    // 2010 would wave it through.
    dynamicTotal: routes.filter((r) => r.kind === 'dynamic').length - skipped.length,
    dynamicFailed: failures.filter((f) => f.kind === 'dynamic').length,
  });

  const detail = failures.map((f) => `              ${f.route}: ${f.message}`).join('\n');

  if (verdict.fatal) {
    console.error(`\n[prerender] ${verdict.reason}\n${detail}`);
    process.exitCode = 1;
  } else {
    console.warn(`\n[prerender] ${verdict.reason}\n${detail}`);
  }
}

// Only prerender when run as a script. Importing this module (the discovery
// tests do) must not kick off a build.
const isEntrypoint =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isEntrypoint) {
  main().catch((error) => {
    console.error('[prerender] fatal:', error);
    process.exitCode = 1;
  });
}
