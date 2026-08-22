-- US-643 / US-635 / US-634: do the three bucket migrations actually run, and
-- what do they permit once they have?
--
-- SELF-CONTAINED AND DESTRUCTIVE TO ITS OWN DATABASE. It builds a stand-in for
-- Supabase's storage and auth schemas, applies the three migrations' statements
-- VERBATIM, replays them, and prints who can enumerate what. Run against a
-- THROWAWAY database, never production:
--
--   createdb us643check && psql -d us643check -f us-643-bucket-migrations-check.sql
--
-- Why it exists, stated precisely, because the obvious answer is wrong: CI's
-- Migration Test job already runs `supabase db push --local` against a real
-- Postgres, so "does the SQL apply" IS covered, and a NOT NULL violation would
-- turn that job red. What no job checks is whether the policies DO WHAT THEIR
-- COMMENTS CLAIM. `db push` is equally happy with a policy scoped to
-- authenticated and one left open to anon; only reading rows as each role tells
-- them apart, and that difference is the entire point of scoping these.
--
-- So this covers three things Migration Test does not:
--   * behaviour -- who can enumerate what, once the policies are in force;
--   * idempotence -- each migration claims a replay is a no-op, checked here by
--     applying all three twice and counting;
--   * the answer arriving before the push rather than after a CI round trip.
--
-- Verified against the alternative: with `name` dropped from the Assets INSERT,
-- this file exits 3 on the NOT NULL violation while check-migration-safety.sh
-- and check-storage-buckets.mjs both still pass. The static gates are blind to
-- it; CI's Migration Test would catch it a push later.
--
-- Expected output (verified 2026-08-22 on PostgreSQL 16.13):
--   buckets            Assets, blog-images, generated-images, images,
--                      profile-pictures -- all public
--   storage policies   11, every one of them {authenticated} -- these five
--                      migrations introduce no public-role policy. That the
--                      WHOLE migration set has none is a different claim, and
--                      belongs to the sweep in storageBucketPolicies.test.ts;
--                      this database holds only the five applied below.
--   replay             all five re-apply cleanly; counts unchanged
--   anon enumerating   0, in every bucket
--   authenticated      Assets 1, blog-images 2, images 0
--
-- THE FINDING IS THE LAST LINE. images gets no policies, deliberately -- a
-- permissive one could only widen a bucket of photographs of children, and
-- tightening needs the dashboard read US-635 is blocked on. The consequence,
-- which is easy to miss and matters for US-634: SELECT is what createSignedUrl
-- needs, so in an environment built from these migrations alone, a kid photo in
-- `images` can never be signed. useSignedProfilePicture falls back to the
-- stored public URL, so nothing breaks while the bucket is public -- and it
-- breaks completely at US-634's Release N+1, when public goes false and the
-- signed URL is the only read path. US-634 must add the owner-scoped SELECT for
-- `images` in the SAME migration that flips the flag, not afterwards.

CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid
$$ LANGUAGE sql STABLE;

-- Mirrors the shape Supabase ships, NOT NULLs included: a migration that omits
-- a required column has to fail here the way it would in production.
CREATE TABLE storage.buckets (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  owner      uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  public     boolean DEFAULT false
);

CREATE TABLE storage.objects (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name      text NOT NULL,
  owner     uuid
);

-- Mirrors Supabase's helper: path split on '/', filename dropped. Without it
-- the profile-pictures policies cannot even be created, and a run that skips
-- them silently proves less than it appears to.
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] AS $$
  SELECT string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
$$ LANGUAGE sql IMMUTABLE;

CREATE TABLE public.user_roles (user_id uuid, role text);

-- profile-pictures and generated-images predate this series; the migrations
-- below rewrite their policies, so the buckets have to exist first.
INSERT INTO storage.buckets (id, name, public) VALUES
  ('profile-pictures', 'profile-pictures', true),
  ('generated-images', 'generated-images', true);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

\echo ''
\echo '== applying the three migrations =='
\i ../migrations/20260822000000_declare_blog_images_bucket.sql
\i ../migrations/20260822000001_declare_assets_bucket.sql
\i ../migrations/20260822000002_declare_images_bucket.sql
\i ../migrations/20260822000003_profile_picture_write_owner_parity.sql
\i ../migrations/20260822000004_scope_generated_image_reads.sql

\echo '== buckets =='
SELECT id, public FROM storage.buckets ORDER BY id;

\echo '== policies on storage.objects: every one must be {authenticated} =='
SELECT policyname, cmd, roles FROM pg_policies
WHERE schemaname = 'storage' ORDER BY policyname;

\echo ''
\echo '== replay: each migration claims to be a no-op on a second run =='
-- This is the check that earns its place. 20260822000004 was written dropping
-- only the OLD policy name and not the new one, so its first run passed and its
-- second died on "policy already exists". Caught here, before merge.
\i ../migrations/20260822000000_declare_blog_images_bucket.sql
\i ../migrations/20260822000001_declare_assets_bucket.sql
\i ../migrations/20260822000002_declare_images_bucket.sql
\i ../migrations/20260822000003_profile_picture_write_owner_parity.sql
\i ../migrations/20260822000004_scope_generated_image_reads.sql

SELECT count(*) AS buckets_after_replay FROM storage.buckets;
SELECT count(*) AS policies_after_replay FROM pg_policies WHERE schemaname = 'storage';

INSERT INTO storage.objects (bucket_id, name) VALUES
  ('blog-images', 'blog/hero-1.png'),
  ('blog-images', 'blog/hero-2.png'),
  ('Assets',      'picky-eater-food-chaining-guide.pdf'),
  ('images',      'kids/3f2504e0-4f89-11d3-9a0c-0305e82c3301.jpg'),
  ('images',      'foods/9a1b.jpg');

GRANT USAGE ON SCHEMA storage TO anon, authenticated;
GRANT SELECT ON storage.objects TO anon, authenticated;
-- Supabase grants this itself; the stand-in has to, or the bucket-by-bucket
-- count below dies on permission denied rather than showing images at 0.
GRANT SELECT ON storage.buckets TO anon, authenticated;

\echo ''
\echo '== anon enumeration: must be 0 everywhere (public reads bypass RLS, list does not) =='
SET ROLE anon;
SELECT count(*) AS anon_can_list FROM storage.objects;
RESET ROLE;

\echo '== authenticated: what the admin screen and createSignedUrl can reach =='
SET ROLE authenticated;
SELECT b.id AS bucket, count(o.id) AS authed_can_list
FROM storage.buckets b LEFT JOIN storage.objects o ON o.bucket_id = b.id
GROUP BY b.id ORDER BY b.id;
RESET ROLE;

\echo ''
\echo 'images at 0 is the finding, not a bug: no policy is deliberate, and it'
\echo 'means a kid photo there cannot be signed. See this file header, US-634.'
