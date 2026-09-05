#!/usr/bin/env node
//
// US-570: a PostgREST-shaped stub, so the DYNAMIC half of the prerender can be
// exercised without production credentials.
//
//   node scripts/dev/fake-postgrest.mjs &
//   VITE_SUPABASE_URL=http://127.0.0.1:54999 \
//   VITE_SUPABASE_ANON_KEY="$(node -e "...any JWT-shaped string...")" \
//   NO_PROXY=127.0.0.1,localhost npm run build
//
// Why it exists: every other check on this story covered a piece. The RLS
// policies permit the reads (supabase/diagnostics/us-570-content-read-check.sql),
// the discovery queries are built correctly (src/lib/prerenderDiscovery.test.ts),
// and the static routes prerender. What none of them covered is the whole chain
// -- discover slugs, expand routes, boot the app per route, let it fetch, and
// write HTML with the right head. Without credentials the build skips discovery
// entirely, so that path had never run at all.
//
// WHAT IT PROVES: with a PostgREST-shaped endpoint returning rows, the pipeline
// produces 16/16 routes, and /blog/:slug ships its own title, canonical,
// description, OG tags and body copy.
//
// GUIDES, and what running one taught: pointing this at a pseo_pages row with a
// multi-segment slug ("food-chaining/chicken-nuggets") showed the nested route
// works end to end up to the template's own content contract. Discovery found
// it, the pattern expanded to /guides/food-chaining/chicken-nuggets, App.tsx's
// splat matched, the slug round-tripped URL-encoded (slug=eq.food-chaining%2F
// chicken-nuggets), the stub answered 200 and the per-route <title> was set.
// The page then crashed inside the template on the invented content shape, the
// ErrorBoundary caught it, and the prerender refused the route.
//
// That is worth knowing for a reason beyond the route: the TITLE WAS CORRECT ON
// A CRASHED PAGE. What caught it was the canonical being unset -- which is
// exactly why prerender.mjs checks the canonical rather than trusting title,
// description and a text-length floor, as the comment there says.
//
// WHAT IT DOES NOT PROVE: that production returns those rows. That is the drift
// check named in us-570-content-read-check.sql's header, and it still needs one
// real build. This stub answers the mechanism, not the data.
//
// It answers exactly the two request shapes the pipeline makes and nothing else;
// it is not a Supabase emulator. The anon key must be JWT-shaped ("eyJ...") or
// src/integrations/supabase/client.ts rejects it as a placeholder and the app
// renders its not-configured state -- which is itself worth knowing, because the
// prerender then fails those routes rather than shipping them, exactly as
// designed.
import { createServer } from 'node:http';

const PORT = Number(process.env.FAKE_POSTGREST_PORT || 54999);

const POSTS = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'food-chaining-basics',
    title: 'Food Chaining Basics',
    content: '## Start where they are\n\nFood chaining moves one attribute at a time. '.repeat(8),
    excerpt: 'How food chaining actually works.',
    featured_image_url: null,
    og_image_url: null,
    published_at: '2026-01-02T00:00:00Z',
    reading_time_minutes: 6,
    views: 3,
    meta_title: 'Food Chaining Basics',
    meta_description: 'How food chaining actually works.',
    category: { name: 'Picky Eating', slug: 'picky-eating' },
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    slug: 'safe-foods-list',
    title: 'Building a Safe Foods List',
    content: '## Safe foods\n\nA safe food is one your child eats reliably. '.repeat(8),
    excerpt: 'Why the safe list matters.',
    featured_image_url: null,
    og_image_url: null,
    published_at: '2026-01-03T00:00:00Z',
    reading_time_minutes: 4,
    views: 1,
    meta_title: 'Building a Safe Foods List',
    meta_description: 'Why the safe list matters.',
    category: { name: 'Picky Eating', slug: 'picky-eating' },
  },
];


/**
 * The identity every authenticated browser test runs as (US-778).
 *
 * Exported so tests/helpers/auth.ts injects exactly the session this server
 * answers for, rather than two hand-written copies drifting apart.
 */
const HOUSEHOLD_ID = '00000000-0000-4000-8000-00000000aaa1';
const LIST_ID = '00000000-0000-4000-8000-00000000bbb1';

/**
 * A shopping list with enough on it to measure a list screen (US-767).
 *
 * Deliberately varied: several aisles so the By Aisle grouping has something to
 * group, a checked item so the check-off state renders, and one deliberately
 * long name because a name that wraps is how a row overflows a phone.
 */
const TEST_USER_ID_LITERAL = '00000000-0000-4000-8000-000000000001';

const GROCERY_ITEMS = [
  ['Whole milk', 'Dairy', 2, 'gal', false],
  ['Sharp cheddar', 'Dairy', 1, 'block', false],
  ['Chicken breast', 'Meat', 6, 'count', false],
  ['Broccoli florets', 'Produce', 1, 'bag', true],
  ['Bananas', 'Produce', 6, 'count', false],
  ['Organic rolled oats, old fashioned, large container', 'Pantry', 1, 'box', false],
  ['Olive oil', 'Pantry', 1, 'bottle', false],
  ['Frozen peas', 'Frozen', 2, 'bag', false],
].map(([name, category, quantity, unit, checked], i) => ({
  id: `cccccccc-0000-4000-8000-00000000000${i}`,
  household_id: HOUSEHOLD_ID,
  user_id: TEST_USER_ID_LITERAL,
  list_id: LIST_ID,
  name,
  category,
  quantity,
  unit,
  checked,
  created_at: `2026-09-0${i + 1}T00:00:00.000Z`,
}));

/** PostgREST answers an object rather than an array for .single()/.maybeSingle(). */
function sendRows(res, req, rows) {
  const single = (req.headers.accept || '').includes('vnd.pgrst.object');
  res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
  return res.end(JSON.stringify(single ? (rows[0] ?? null) : rows));
}

export const TEST_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'e2e@example.test',
  email_confirmed_at: '2026-01-01T00:00:00.000Z',
  phone: '',
  confirmed_at: '2026-01-01T00:00:00.000Z',
  last_sign_in_at: '2026-01-01T00:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  identities: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  is_anonymous: false,
};

/**
 * A JWT-shaped access token. Unsigned in any meaningful sense -- the signature
 * segment is a literal -- because nothing in this server verifies it. It is
 * JWT-SHAPED rather than a random string only because client code decodes the
 * payload to read `sub` and `role`.
 */
const TEST_JWT_PAYLOAD = Buffer.from(
  JSON.stringify({
    sub: TEST_USER.id,
    role: 'authenticated',
    aud: 'authenticated',
    // Far enough out that supabase-js never tries to refresh mid-test.
    exp: 4102444800,
    iat: 1767225600,
    email: TEST_USER.email,
  })
).toString('base64url');

export const TEST_ACCESS_TOKEN = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${TEST_JWT_PAYLOAD}.e2e-not-a-real-signature`;

export const TEST_SESSION = {
  access_token: TEST_ACCESS_TOKEN,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 4102444800,
  refresh_token: 'e2e-refresh-token',
  user: TEST_USER,
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'content-range',
};

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  // ---------------------------------------------------------------------------
  // GoTrue, enough of it (US-778).
  //
  // Fifteen spec files need a signed-in session and were skipped for want of
  // one, and every authenticated page -- the planner, the grocery list, the
  // settings screen -- was therefore unreachable to any browser test. That is
  // also why the a11y scan only ever covered marketing pages, which is the half
  // of the app nobody is logged into.
  //
  // This does NOT implement auth. It answers the three calls supabase-js makes
  // once a session already exists in localStorage, so a test can inject one and
  // get past ProtectedRoute. Nothing here validates a token, and nothing should:
  // it is a stand-in for a backend, not a security boundary, and it listens on
  // 127.0.0.1 only.
  if (url.pathname === '/auth/v1/user') {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(TEST_USER));
  }

  if (url.pathname === '/auth/v1/token') {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(TEST_SESSION));
  }

  if (url.pathname === '/auth/v1/logout') {
    res.writeHead(204, CORS);
    return res.end();
  }

  if (url.pathname === '/rest/v1/blog_posts') {
    const slug = url.searchParams.get('slug');
    let rows = slug?.startsWith('eq.') ? POSTS.filter((p) => p.slug === slug.slice(3)) : POSTS;
    if (url.searchParams.get('select') === 'slug') rows = rows.map((p) => ({ slug: p.slug }));
    // .single() asks for an object rather than an array.
    const single = (req.headers.accept || '').includes('vnd.pgrst.object');
    res.writeHead(single && rows.length === 0 ? 406 : 200, {
      ...CORS,
      'Content-Type': 'application/json',
    });
    return res.end(JSON.stringify(single ? (rows[0] ?? null) : rows));
  }

  if (url.pathname === '/rest/v1/pseo_pages') {
    const slug = url.searchParams.get('slug');
    // Deliberately empty. A guide row was tried here and the nested route it
    // produces works -- see the header -- but the FOOD_CHAINING_GUIDE template
    // reads a rich content object (headline, validation{}, explainer{},
    // progression[], sharedProperties{}, techniques[], troubleshooting{}) that
    // is AI-generated at runtime and defined by no static type. Inventing one
    // means a fixture that renders a plausible-looking page proving nothing
    // about the real schema, and a dev tool whose default run fails the build.
    const single = (req.headers.accept || '').includes('vnd.pgrst.object');
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    return res.end(single ? 'null' : '[]');
  }

  // ---------------------------------------------------------------------------
  // A household with things in it (US-767).
  //
  // Everything above answers empty, which is a valid backend response and a
  // useless one to measure a LIST screen against. The grocery page rendered
  // with zero rows, so a phone-width probe reported no small tap targets and no
  // horizontal overflow -- for a page with nothing on it. The cookie banner was
  // the only heading. That reads exactly like a page that passes.
  //
  // The same blind spot reaches further than this story: the authenticated a11y
  // baselines in tests/accessibility/authenticated-baseline.json were measured
  // against these same empty screens, so grocery's "3" is 3 violations on an
  // empty list, not on a list.
  //
  // Rows are shaped from the real columns the app selects and writes. Reads
  // only: a POST or PATCH still falls through to the empty answer below, which
  // is honest -- this stands in for a backend, it does not implement one.
  if (url.pathname === '/rest/v1/households') {
    return sendRows(res, req, [{ id: HOUSEHOLD_ID, name: 'Test Household', created_by: TEST_USER.id }]);
  }

  if (url.pathname === '/rest/v1/household_members') {
    return sendRows(res, req, [
      {
        id: 'aaaaaaaa-0000-4000-8000-000000000001',
        household_id: HOUSEHOLD_ID,
        user_id: TEST_USER.id,
        role: 'parent',
        joined_at: '2026-01-05T00:00:00.000Z',
        profiles: { full_name: 'E2E Parent' },
      },
    ]);
  }

  if (url.pathname === '/rest/v1/grocery_lists') {
    return sendRows(res, req, [
      {
        id: LIST_ID,
        household_id: HOUSEHOLD_ID,
        user_id: TEST_USER.id,
        name: 'Weekly shop',
        is_default: true,
        created_at: '2026-09-01T00:00:00.000Z',
      },
    ]);
  }

  if (url.pathname === '/rest/v1/grocery_items') {
    return sendRows(res, req, GROCERY_ITEMS);
  }

  // anything else: an empty set is a valid answer.
  res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
  res.end('[]');
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[fake-postgrest] listening on http://127.0.0.1:${PORT}`);
});
