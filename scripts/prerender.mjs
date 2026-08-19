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
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
/** How long to let lazy chunks/fonts settle after the app first paints content. */
const SETTLE_MS = 700;

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
      for (const row of rows) {
        const route = source.pattern.replace(/:(\w+)/g, (_, key) => row[key] ?? '');
        if (!route.includes('//') && !route.endsWith('/')) routes.push(route);
      }
      console.log(`[prerender] ${source.name}: discovered ${rows.length} route(s).`);
    } catch (error) {
      console.warn(`[prerender] ${source.name}: ${error.message} — skipping.`);
    }
  }
  return routes;
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

  // Let lazily-imported sections (hero, schema components) mount and Helmet flush.
  await page.waitForTimeout(SETTLE_MS);

  const { html, title, description, canonical, ldJsonCount, textLength } = await page.evaluate(() => {
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
      textLength: (document.getElementById('root')?.innerText ?? '').trim().length,
    };
  });

  // A snapshot missing any of these is worse than no snapshot: it would freeze a broken
  // <head> into the file crawlers read. Fail loudly instead of shipping it.
  if (!title) throw new Error('rendered page has no <title>');
  if (!description) throw new Error('rendered page has no meta description');
  if (!canonical) throw new Error('rendered page has no canonical link');
  if (textLength < 200) throw new Error(`rendered body text is only ${textLength} chars`);

  const outPath = outputPathFor(route);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf8');

  return { outPath, title, canonical, ldJsonCount, textLength, bytes: Buffer.byteLength(html) };
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
  const routes = [...new Set([...config.static, ...dynamicRoutes])];

  // Snapshot the un-prerendered shell and keep a copy on disk. app-shell.html is the
  // document Cloudflare Pages can be pointed at for routes we do not prerender, and it
  // is what this script's own dev server falls back to.
  const shellHtml = await readFile(path.join(DIST, 'index.html'), 'utf8');
  await copyFile(path.join(DIST, 'index.html'), path.join(DIST, 'app-shell.html'));

  const { chromium } = await import('playwright');
  const { server, port } = await startServer(DIST, shellHtml);
  const origin = `http://127.0.0.1:${port}`;

  const failures = [];
  const results = [];
  let browser;

  try {
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      // Escape hatch for environments that ship a Chromium whose build number does not
      // match the installed Playwright (some sandboxes/CI images pre-bake one). Unset in
      // normal builds, where Playwright resolves its own download.
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE && {
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
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

    const page = await context.newPage();
    page.on('pageerror', (err) => console.warn(`[prerender]   page error: ${err.message}`));

    for (const route of routes) {
      try {
        const result = await prerenderRoute(page, origin, route);
        results.push({ route, ...result });
        console.log(
          `[prerender] ✓ ${route.padEnd(28)} ${String(result.textLength).padStart(6)} chars  ` +
            `${result.ldJsonCount} ld+json  ${(result.bytes / 1024).toFixed(0)}kb`
        );
      } catch (error) {
        failures.push({ route, message: error.message });
        console.error(`[prerender] ✗ ${route} — ${error.message}`);
      }
    }

    await context.close();
  } finally {
    // Always tear these down: an un-closed http server keeps the event loop alive and
    // the build hangs instead of reporting the failure that got us here.
    await browser?.close().catch(() => {});
    server.close();
  }

  console.log(`\n[prerender] ${results.length}/${routes.length} route(s) prerendered.`);

  if (failures.length) {
    console.error(
      `\n[prerender] ${failures.length} route(s) failed. Failing the build rather than shipping\n` +
        `            a partly-prerendered site, which would leave those URLs as blank shells:\n` +
        failures.map((f) => `              ${f.route}: ${f.message}`).join('\n')
    );
    process.exitCode = 1;
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
