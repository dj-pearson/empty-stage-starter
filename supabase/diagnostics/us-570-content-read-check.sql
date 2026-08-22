-- US-570: can the anon key actually read the content the prerender renders?
--
-- SELF-CONTAINED AND DESTRUCTIVE TO ITS OWN DATABASE. It builds a stand-in for
-- Supabase's auth schema and the anon/authenticated roles, applies the blog and
-- pSEO read policies VERBATIM from their migrations, seeds the awkward rows,
-- and prints what each role sees. Run against a THROWAWAY database:
--
--   createdb us570check && psql -d us570check -f us-570-content-read-check.sql
--
-- Why it exists: US-570 was recorded as blocked on "one build with
-- VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY set, required to prove production's
-- anon RLS permits the blog_posts/pseo_pages reads the prerender browser makes".
-- Those policies are not a production secret -- they are declared in
-- 20251008144000_create_blog_tables.sql and 20260313000000_pseo_pages.sql -- so
-- the RLS half of that question is answerable here, without credentials.
--
-- What this DOES prove: the policies as committed permit exactly the reads the
-- prerender makes, and hide exactly what should stay hidden.
-- What it does NOT prove: that production's policy set matches the migrations.
-- If someone added or dropped a policy in the dashboard, only production can
-- say so -- the same class of drift that hid the storage buckets. This narrows
-- the credentialed build to a drift check rather than an unknown.
--
-- Expected output (verified 2026-08-22 on PostgreSQL 16.13):
--   discovery: blog slugs        anon 2  (published only; draft, future and
--                                         null-published_at all correctly hidden)
--   discovery: guide slugs       anon 2  (published AND tier <= 1)
--   page read: blog post + cat   anon 1  (the embedded category resolves)
--   page read: guide by slug     anon 1
--   admin sees every blog row    5
--
-- THE PRODUCTION HALF, which this file deliberately does not do, is one
-- read-only query -- run it in the SQL editor and compare against the two
-- policies copied below:
--
--   SELECT schemaname, tablename, policyname, roles, cmd, qual
--   FROM pg_policies
--   WHERE tablename IN ('blog_posts', 'blog_categories', 'pseo_pages')
--   ORDER BY tablename, policyname;
--
-- The finding is in the blog numbers: the prerender's discovery filter is
-- status=eq.published alone, but the POLICY also requires published_at <= now().
-- A post published with a future date, or with no date at all, is invisible to
-- anon -- so it is invisible to the prerender AND to the live site, identically.
-- Those two rows are seeded here so the agreement is visible rather than assumed.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Stand-in for Supabase's auth.uid(): a session setting rather than a JWT.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid
$$ LANGUAGE sql STABLE;

DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE user_roles (
  user_id uuid NOT NULL,
  role    text NOT NULL
);

CREATE TABLE blog_categories (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL
);

-- Only the columns BlogPost.tsx actually selects, plus the filter columns.
CREATE TABLE blog_posts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  slug         text UNIQUE NOT NULL,
  content      text NOT NULL,
  excerpt      text,
  featured_image_url text,
  og_image_url text,
  category_id  uuid REFERENCES blog_categories(id),
  status       text DEFAULT 'draft',
  published_at timestamptz,
  meta_title   text,
  meta_description text,
  views        integer DEFAULT 0,
  reading_time_minutes integer
);

CREATE TABLE pseo_pages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text UNIQUE NOT NULL,
  title             text NOT NULL,
  generation_status text NOT NULL,
  tier              integer NOT NULL
);

ALTER TABLE blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pseo_pages      ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Policies, copied verbatim from the migrations. Do not "improve" them here --
-- the point is to run what ships.
--   20251008144000_create_blog_tables.sql
-- ---------------------------------------------------------------------------
CREATE POLICY "Admins can manage blog posts"
  ON blog_posts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can view published posts"
  ON blog_posts FOR SELECT
  USING (status = 'published' AND published_at <= NOW());

CREATE POLICY "Anyone can view categories"
  ON blog_categories FOR SELECT
  USING (true);

-- ---------------------------------------------------------------------------
--   20260313000000_pseo_pages.sql
-- ---------------------------------------------------------------------------
CREATE POLICY "Public can read published pseo pages"
  ON public.pseo_pages FOR SELECT
  USING (generation_status = 'published');

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON blog_posts, blog_categories, pseo_pages TO anon, authenticated;
GRANT SELECT ON user_roles TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed. Every row here is a case the prerender can meet in production.
-- ---------------------------------------------------------------------------
INSERT INTO blog_categories (id, name, slug)
VALUES ('11111111-1111-1111-1111-111111111111', 'Picky Eating', 'picky-eating');

INSERT INTO blog_posts (title, slug, content, status, published_at, category_id) VALUES
  ('Live one',    'live-one',    'body', 'published', now() - interval '1 day',
   '11111111-1111-1111-1111-111111111111'),
  ('Live two',    'live-two',    'body', 'published', now() - interval '2 day', NULL),
  ('Still a draft','draft-one',  'body', 'draft',     NULL,                     NULL),
  -- status says published, date says not yet. The policy hides it; the
  -- prerender's status-only discovery filter would not have.
  ('Scheduled',   'scheduled',   'body', 'published', now() + interval '7 day', NULL),
  -- published with no date at all: NULL <= now() is NULL, so also hidden.
  ('No date',     'no-date',     'body', 'published', NULL,                     NULL);

INSERT INTO pseo_pages (slug, title, generation_status, tier) VALUES
  ('toddler/broccoli',   'Broccoli',   'published', 0),
  ('toddler/carrots',    'Carrots',    'published', 1),
  ('toddler/deep-cut',   'Deep cut',   'published', 2),
  ('toddler/unfinished', 'Unfinished', 'draft',     0);

-- ---------------------------------------------------------------------------
-- The reads, exactly as the app and the build script make them.
-- ---------------------------------------------------------------------------
SET ROLE anon;

\echo ''
\echo '== discovery: blog slugs (scripts/prerender-routes.json, status=eq.published, limit 500)'
SELECT count(*) AS anon_sees FROM blog_posts WHERE status = 'published' LIMIT 500;

\echo '== discovery: guide slugs (generation_status=eq.published, tier=lte.1, limit 2000)'
SELECT count(*) AS anon_sees FROM pseo_pages
WHERE generation_status = 'published' AND tier <= 1 LIMIT 2000;

\echo '== page read: BlogPost.tsx, slug + status + published_at, with embedded category'
SELECT count(*) AS anon_sees
FROM blog_posts p LEFT JOIN blog_categories c ON c.id = p.category_id
WHERE p.slug = 'live-one' AND p.status = 'published' AND p.published_at <= now();

\echo '== page read: the embedded category actually resolves (not null-collapsed)'
SELECT c.name AS category_name
FROM blog_posts p JOIN blog_categories c ON c.id = p.category_id
WHERE p.slug = 'live-one';

\echo '== page read: PseoPage.tsx, select * by slug'
SELECT count(*) AS anon_sees FROM pseo_pages WHERE slug = 'toddler/broccoli';

\echo '== the rows anon must NOT see (draft, future-dated, null-dated)'
SELECT count(*) AS anon_sees FROM blog_posts
WHERE slug IN ('draft-one', 'scheduled', 'no-date');

RESET ROLE;

INSERT INTO user_roles VALUES ('22222222-2222-2222-2222-222222222222', 'admin');

\echo ''
\echo '== for contrast: an admin sees every blog row'
SET ROLE authenticated;
SET test.uid = '22222222-2222-2222-2222-222222222222';
SELECT count(*) AS admin_sees FROM blog_posts;
RESET ROLE;
