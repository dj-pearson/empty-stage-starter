-- US-627 / US-634: does the profile-pictures read policy actually do what its
-- migration says?
--
-- SELF-CONTAINED AND DESTRUCTIVE TO ITS OWN DATABASE. It builds a stand-in for
-- Supabase's storage and auth schemas, applies the policy from
-- 20260817000000_scope_profile_picture_reads.sql verbatim, and prints who can
-- see what. Run it against a THROWAWAY database, never production:
--
--   createdb us627check && psql -d us627check -f us627_policy_check.sql
--
-- Why it exists: the policy is the control that closed anonymous enumeration of
-- a bucket full of photographs of children, and until this was written nobody
-- had run it. It is also the pre-condition for US-634 -- createSignedUrl needs
-- SELECT, so an object this policy hides is an object that cannot be signed.
--
-- Expected output (verified 2026-08-19 on PostgreSQL 16.13):
--   anon    0    enumeration closed; it was 4 before the migration
--   user A  2    own folder, plus a legacy object matched by owner
--   user B  1    own folder only; cannot see user A's
--   admin   4    everything, including the orphan nobody else can read
--
-- The orphan is the finding: an object with no owner and no user-id folder is
-- readable by admins alone -- not by the parent it belongs to. That is harmless
-- while the bucket is public and the app falls back to the stored public URL,
-- and it breaks at Release N+1. Query 5 of us-635-images-bucket.sql counts them
-- in production.

CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Stand-in for Supabase's auth.uid(): a session setting rather than a JWT.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid
$$ LANGUAGE sql STABLE;

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL,
  name text NOT NULL,
  owner uuid
);

-- Mirrors Supabase's helper: path split on '/', filename dropped.
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] AS $$
DECLARE p text[];
BEGIN
  p := string_to_array(name, '/');
  RETURN p[1 : array_length(p, 1) - 1];
END $$ LANGUAGE plpgsql IMMUTABLE;

CREATE TABLE IF NOT EXISTS public.user_roles (user_id uuid, role text);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;

GRANT USAGE ON SCHEMA storage, auth, public TO anon, authenticated;
GRANT SELECT ON storage.objects, public.user_roles TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid(), storage.foldername(text) TO anon, authenticated;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

TRUNCATE storage.objects;
TRUNCATE public.user_roles;
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('profile-pictures', '11111111-1111-1111-1111-111111111111/kid-a.jpg',
     '11111111-1111-1111-1111-111111111111'),
  ('profile-pictures', '22222222-2222-2222-2222-222222222222/kid-b.jpg',
     '22222222-2222-2222-2222-222222222222'),
  -- legacy shape: no user-id folder, owner set. Exercises the OR branch.
  ('profile-pictures', 'legacy-object.jpg', '11111111-1111-1111-1111-111111111111'),
  -- orphan: neither. Readable by admins only.
  ('profile-pictures', 'orphan.jpg', NULL);
INSERT INTO public.user_roles (user_id, role)
  VALUES ('33333333-3333-3333-3333-333333333333', 'admin');

-- The pre-US-627 policy, verbatim from 20251008025307. No TO clause, so it
-- applies to `public`, which includes anon.
DROP POLICY IF EXISTS "Users can view all profile pictures" ON storage.objects;
CREATE POLICY "Users can view all profile pictures"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-pictures');

\echo ''
\echo '=== BEFORE US-627: what anon can enumerate ==='
SET ROLE anon;
SELECT set_config('test.uid', '', false) \g /dev/null
SELECT count(*) AS anon_can_see FROM storage.objects WHERE bucket_id = 'profile-pictures';
RESET ROLE;

-- The migration under test.
DROP POLICY IF EXISTS "Users can view all profile pictures" ON storage.objects;

DROP POLICY IF EXISTS "Users can view own profile pictures" ON storage.objects;
CREATE POLICY "Users can view own profile pictures"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-pictures'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR owner = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can view all profile pictures" ON storage.objects;
CREATE POLICY "Admins can view all profile pictures"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-pictures'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
  )
);

\echo ''
\echo '=== AFTER US-627 ==='
SET ROLE anon;
SELECT set_config('test.uid', '', false) \g /dev/null
SELECT 'anon' AS who, count(*) AS visible,
       coalesce(string_agg(name, ', ' ORDER BY name), '-') AS objects
  FROM storage.objects WHERE bucket_id = 'profile-pictures';
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('test.uid', '11111111-1111-1111-1111-111111111111', false) \g /dev/null
SELECT 'user A' AS who, count(*) AS visible,
       coalesce(string_agg(name, ', ' ORDER BY name), '-') AS objects
  FROM storage.objects WHERE bucket_id = 'profile-pictures';
SELECT set_config('test.uid', '22222222-2222-2222-2222-222222222222', false) \g /dev/null
SELECT 'user B' AS who, count(*) AS visible,
       coalesce(string_agg(name, ', ' ORDER BY name), '-') AS objects
  FROM storage.objects WHERE bucket_id = 'profile-pictures';
SELECT set_config('test.uid', '33333333-3333-3333-3333-333333333333', false) \g /dev/null
SELECT 'admin' AS who, count(*) AS visible,
       coalesce(string_agg(name, ', ' ORDER BY name), '-') AS objects
  FROM storage.objects WHERE bucket_id = 'profile-pictures';
RESET ROLE;
