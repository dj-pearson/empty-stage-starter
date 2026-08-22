-- Harness for us-635-images-bucket.sql.
--
-- SELF-CONTAINED AND DESTRUCTIVE TO ITS OWN DATABASE. It builds a stand-in for
-- Supabase's storage and auth schemas, seeds the awkward shapes, and then you
-- run the production diagnostic against it:
--
--   createdb us635check
--   psql -q -d us635check -f us-635-standin-check.sql
--   psql -d us635check -f us-635-images-bucket.sql
--
-- Why: us-635-images-bucket.sql is pointed at PRODUCTION and its output decides
-- a migration on a bucket of photographs of children. Its header made claims
-- about what each query returns; this is what makes those claims checkable.
-- Running it found the header stale (it said four queries; there are five, and
-- the fifth had never been run) and found the first version of this harness
-- wrong -- it approximated storage.foldername with a regexp, which disagrees
-- with Supabase exactly at the bucket root, the one case query 3 documents.
--
-- Expected output from the diagnostic against this seed (PostgreSQL 16.13):
--   1  3 buckets, images and profile-pictures first, Assets after
--   2  3 policies; "everything with an owner" flagged ALL BUCKETS and listed
--      first, because a bucket-agnostic permissive policy decides the answer
--      whatever the images-specific ones say
--   3  images: kids -> 1 object 1 owned; and one BLANK top_folder row, which is
--      the object at the bucket root
--   4  kids split none 1 / images 1 / profile-pictures 1
--   5  5 objects, 2 signable via owner, 1 via a uuid folder, 2 unsignable
--   6  images: 2 objects, 1 signable via owner, 1 unsignable, 1 top folder
--   7  profile-pictures 5 objects / 3 owner-null, images 2 / 1
--
-- The 2 unsignable are the US-634 pre-condition: no owner and no uuid folder
-- means createSignedUrl cannot mint a URL for them at all, so they need an
-- owner backfill BEFORE the bucket is closed, not after.

CREATE SCHEMA IF NOT EXISTS storage; CREATE SCHEMA IF NOT EXISTS auth;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT nullif(current_setting('test.uid',true),'')::uuid $$ LANGUAGE sql STABLE;
-- Shaped like Supabase's real storage.buckets, columns query 1 selects included.
CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, owner uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  public boolean DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id),
  name text NOT NULL, owner uuid, created_at timestamptz DEFAULT now());
-- Supabase's ACTUAL implementation, not an approximation. The difference shows
-- at the bucket root: split on '/' and drop the last element, so 'root.jpg'
-- yields an EMPTY array (and [1] is NULL), where a regexp that strips the
-- filename yields {'root.jpg'}. Query 3's documented "empty top_folder means an
-- object at the bucket root" is only reproducible with the real semantics.
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] AS $$
DECLARE _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts,1)-1];
END $$ LANGUAGE plpgsql IMMUTABLE;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.kids (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_picture_url text);

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types) VALUES
  ('images','images',true,5242880,ARRAY['image/jpeg']),
  ('profile-pictures','profile-pictures',true,5242880,ARRAY['image/jpeg']),
  ('Assets','Assets',true,NULL,NULL);

-- The two policy shapes the header claims to have covered.
CREATE POLICY "images anon read" ON storage.objects FOR SELECT
  USING (bucket_id = 'images');
CREATE POLICY "everything with an owner" ON storage.objects FOR SELECT
  USING (owner IS NOT NULL);                       -- bucket-agnostic: the dangerous one
CREATE POLICY "pp owner scoped" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'profile-pictures' AND ((storage.foldername(name))[1] = auth.uid()::text OR owner = auth.uid()));

INSERT INTO storage.objects (bucket_id,name,owner) VALUES
  ('images','kids/3f2504e0-4f89-11d3-9a0c-0305e82c3301.jpg','11111111-1111-1111-1111-111111111111'),
  ('images','rootlevel.jpg',NULL),                                    -- object at bucket root
  ('profile-pictures','22222222-2222-2222-2222-222222222222/a.jpg','22222222-2222-2222-2222-222222222222'),
  ('profile-pictures','legacy.jpg','22222222-2222-2222-2222-222222222222'), -- signable via owner
  ('profile-pictures','orphan.jpg',NULL),                             -- UNSIGNABLE: no owner, no uuid folder
  ('profile-pictures','notauuid/b.jpg',NULL),
  ('profile-pictures','33333333-3333-3333-3333-333333333333/c.jpg',NULL);                         -- UNSIGNABLE: folder is not a uuid

INSERT INTO public.kids (profile_picture_url) VALUES
  ('https://x.supabase.co/storage/v1/object/public/images/kids/3f2504e0-4f89-11d3-9a0c-0305e82c3301.jpg'),
  ('https://x.supabase.co/storage/v1/object/public/profile-pictures/22222222-2222-2222-2222-222222222222/a.jpg'),
  (NULL);
