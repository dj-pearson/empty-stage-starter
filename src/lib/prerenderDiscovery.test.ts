import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createServer, type Server, type IncomingMessage } from 'http';
import { readFileSync } from 'fs';
import path from 'path';
import { discoverDynamicRoutes } from '../../scripts/prerender.mjs';

/**
 * US-570: blog and /guides/* routes are discovered from PostgREST at build
 * time, and that path had never run against a real endpoint -- the containers
 * that build here have no Supabase credentials, so every build so far has
 * taken the "skip dynamic routes" branch and shipped those URLs as SPA shells.
 *
 * These drive the real discoverDynamicRoutes against a stand-in PostgREST over
 * loopback, using the real prerender-routes.json, so the query construction and
 * route expansion are checked without credentials. What this still cannot
 * prove is that the production tables answer these queries with the rows we
 * expect -- that needs one credentialed build.
 */

const routesConfig = JSON.parse(
  readFileSync(path.resolve(__dirname, '../../scripts/prerender-routes.json'), 'utf-8'),
);

type Recorded = { url: string; headers: IncomingMessage['headers'] };

let server: Server;
let baseUrl: string;
let requests: Recorded[] = [];
/** table name -> response, so each test decides what PostgREST returns. */
let responses: Record<string, { status: number; body: unknown }> = {};

beforeAll(async () => {
  server = createServer((req, res) => {
    requests.push({ url: req.url!, headers: req.headers });
    const table = req.url!.split('?')[0].replace('/rest/v1/', '');
    const reply = responses[table] ?? { status: 200, body: [] };
    res.writeHead(reply.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  requests = [];
  responses = {};
  process.env.VITE_SUPABASE_URL = baseUrl;
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-test-key';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;
  vi.restoreAllMocks();
});

/** Query params for the request that hit `table`. */
const queryFor = (table: string) => {
  const hit = requests.find((r) => r.url.startsWith(`/rest/v1/${table}?`));
  expect(hit, `no request to ${table}`).toBeTruthy();
  return new URLSearchParams(hit!.url.split('?')[1]);
};

describe('prerender dynamic route discovery (US-570)', () => {
  it('queries both real sources and expands one route per row', async () => {
    responses = {
      blog_posts: { status: 200, body: [{ slug: 'food-chaining-101' }, { slug: 'arfid-basics' }] },
      pseo_pages: { status: 200, body: [{ slug: 'picky-eating/toddlers' }] },
    };

    const routes = await discoverDynamicRoutes(routesConfig.dynamic);

    expect(routes).toEqual([
      '/blog/food-chaining-101',
      '/blog/arfid-basics',
      '/guides/picky-eating/toddlers',
    ]);
  });

  it('sends the blog_posts query the config declares', async () => {
    await discoverDynamicRoutes(routesConfig.dynamic);
    const q = queryFor('blog_posts');

    expect(q.get('select')).toBe('slug');
    expect(q.get('status')).toBe('eq.published');
    expect(q.get('limit')).toBe('500');
  });

  it('ANDs both pseo_pages filters, so noindex tiers are not prerendered', async () => {
    await discoverDynamicRoutes(routesConfig.dynamic);
    const q = queryFor('pseo_pages');

    expect(q.get('select')).toBe('slug');
    expect(q.get('generation_status')).toBe('eq.published');
    // Must match MAX_INDEXABLE_TIER in src/lib/pseo/indexability.ts.
    expect(q.get('tier')).toBe('lte.1');
    expect(q.get('limit')).toBe('2000');
  });

  it('authenticates with the anon key on both headers', async () => {
    await discoverDynamicRoutes(routesConfig.dynamic);

    for (const req of requests) {
      expect(req.headers.apikey).toBe('anon-test-key');
      expect(req.headers.authorization).toBe('Bearer anon-test-key');
    }
  });

  it('skips a failing source without losing the other one', async () => {
    responses = {
      blog_posts: { status: 500, body: { message: 'boom' } },
      pseo_pages: { status: 200, body: [{ slug: 'sensory/textures' }] },
    };

    await expect(discoverDynamicRoutes(routesConfig.dynamic)).resolves.toEqual([
      '/guides/sensory/textures',
    ]);
  });

  it('drops rows with no slug rather than emitting /blog/', async () => {
    responses = {
      blog_posts: { status: 200, body: [{ slug: '' }, { slug: null }, { slug: 'real-post' }] },
    };

    await expect(discoverDynamicRoutes(routesConfig.dynamic)).resolves.toEqual(['/blog/real-post']);
  });

  it('returns nothing and queries nothing when credentials are absent', async () => {
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;

    await expect(discoverDynamicRoutes(routesConfig.dynamic)).resolves.toEqual([]);
    expect(requests).toHaveLength(0);
  });

  it('warns loudly about credential-less builds, since the failure is silent otherwise', async () => {
    delete process.env.VITE_SUPABASE_URL;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await discoverDynamicRoutes(routesConfig.dynamic);

    expect(warn.mock.calls[0]?.[0]).toMatch(/skipping dynamic routes/i);
  });

  it('ignores a malformed filter instead of sending it as a param', async () => {
    await discoverDynamicRoutes({
      sources: [
        { name: 'bad', table: 'blog_posts', select: 'slug', filters: ['nonsense'], pattern: '/blog/:slug' },
      ],
    });

    const q = queryFor('blog_posts');
    expect(q.get('nonsense')).toBeNull();
    expect(q.get('select')).toBe('slug');
  });
});

describe('prerender-routes.json agrees with the app (US-570)', () => {
  it('gates pSEO prerendering at MAX_INDEXABLE_TIER', () => {
    const indexability = readFileSync(
      path.resolve(__dirname, 'pseo/indexability.ts'),
      'utf-8',
    );
    const max = indexability.match(/MAX_INDEXABLE_TIER\s*=\s*(\d+)/)?.[1];

    expect(max, 'MAX_INDEXABLE_TIER not found').toBeDefined();

    const pseo = routesConfig.dynamic.sources.find((s: { table: string }) => s.table === 'pseo_pages');
    expect(pseo.filters).toContain(`tier=lte.${max}`);
  });
});
