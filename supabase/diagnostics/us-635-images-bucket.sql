-- US-635 diagnostic: what is the 'images' bucket actually configured as?
--
-- READ ONLY. Nothing here changes anything. Run it in the Supabase SQL editor
-- (or psql against production) and paste the output into the story.
--
-- Verified 2026-08-22: all SEVEN queries run clean (psql exit 0) against a
-- PostgreSQL 16.13 stand-in shaped like Supabase's storage schema --
-- storage.buckets with its real columns, storage.objects,
-- storage.foldername(), public.kids -- carrying objects at a folder and at the
-- bucket root, an owner-less object, an object whose first path segment is not
-- a uuid, and both a bucket-scoped and a bucket-agnostic RLS policy. The header
-- said "all four" until then; query 5 was added later and had never been run.
-- Queries 6 and 7 were added after noticing query 5 asks its question of
-- profile-pictures ALONE, leaving the bucket the iOS app actually writes to
-- unexamined by the very file that exists to examine it.
--
-- The harness is checked in as us-635-standin-check.sql, so these claims can be
-- re-run rather than believed. It matters that it uses Supabase's REAL
-- storage.foldername -- split on '/' and drop the last element -- and not a
-- regexp that strips the filename: the two disagree exactly at the bucket root,
-- which is the row the next line is about.
--
-- An empty top_folder row in query 3 is an object sitting at the bucket root,
-- not an error. Confirmed, not assumed: with the real function that row comes
-- back blank; with the approximation it comes back as the filename.
--
-- Why this file exists: the 'images' bucket is not created by any migration in
-- this repo -- it was made in the dashboard -- so its public flag and its RLS
-- policies cannot be read from the codebase. iOS uploads every kid photo to it
-- (ios/EatPal/EatPal/Services/ImageUploadService.swift). The follow-up
-- migration cannot be written safely without these three answers, because RLS
-- policies are OR'd: a new restrictive policy cannot cancel an existing
-- permissive one, and a DROP POLICY naming the wrong policy silently no-ops.

-- 1. Is the bucket public? A public bucket serves objects through the storage
--    API WITHOUT consulting RLS, so if this is true, tightening policies alone
--    changes nothing for anyone holding a URL.
-- Lists EVERY bucket, not just the two this story names: 'images' was itself
-- created in the dashboard and discovered only by reading the Swift client, so
-- the same question applies to whatever else is in there.
SELECT id, name, public, file_size_limit, allowed_mime_types, created_at
FROM storage.buckets
ORDER BY (name IN ('images', 'profile-pictures')) DESC, name;

-- 2. EVERY policy on storage.objects, with a flag for whether it names a
--    bucket at all. `{public}` in the roles column includes anon, which is what
--    made profile-pictures enumerable before US-627.
--
--    Deliberately not filtered to policies mentioning 'images'. A policy that
--    names no bucket -- `USING (owner IS NOT NULL)`, say -- applies to every
--    object in every bucket, which makes it the most permissive shape there is
--    and the one most worth seeing. Filtering on the bucket name hides exactly
--    that policy: verified against a stand-in schema, where a bucket-agnostic
--    public SELECT policy was invisible to the filtered query while the
--    narrower, less dangerous one showed up and looked reassuring.
--
--    Read `applies_to` first: anything marked 'ALL BUCKETS' with roles {public}
--    is the finding, whatever the images-specific policies say, because RLS
--    policies are OR'd and a permissive one cannot be cancelled by adding a
--    narrower one.
SELECT
  policyname,
  cmd,
  roles,
  permissive,
  CASE
    WHEN coalesce(qual, '') ILIKE '%images%' OR coalesce(with_check, '') ILIKE '%images%'
      THEN 'images'
    WHEN coalesce(qual, '') ILIKE '%bucket_id%' OR coalesce(with_check, '') ILIKE '%bucket_id%'
      THEN 'another bucket'
    ELSE 'ALL BUCKETS'
  END AS applies_to,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY applies_to, cmd, policyname;

-- 3. Shape of what is already stored, so the follow-up policy can be scoped
--    correctly. Objects land at kids/{uuid}.jpg with no user-id folder
--    (US-635 changed the filename from the guessable {kidId}-{unixSeconds}),
--    which is why scoping has to key on storage.objects.owner rather than on
--    storage.foldername(name)[1] the way profile-pictures does.
SELECT
  (storage.foldername(name))[1] AS top_folder,
  count(*)                      AS objects,
  count(owner)                  AS with_owner,
  count(*) - count(owner)       AS orphaned_no_owner
FROM storage.objects
WHERE bucket_id = 'images'
GROUP BY 1
ORDER BY 2 DESC;

-- 4. US-634 crossover: which bucket does each stored kid photo actually live
--    in? The web writes profile-pictures, iOS writes images/kids/, and both
--    land in the same kids.profile_picture_url column. US-634's plan is to
--    flip profile-pictures to public=false -- which does nothing for any row
--    counted in the `images` column below. This number is the size of that
--    gap, and it decides whether US-634 can close as scoped or has to cover
--    both buckets.
SELECT
  CASE
    WHEN profile_picture_url IS NULL OR profile_picture_url = '' THEN 'none'
    WHEN profile_picture_url LIKE '%/object/public/profile-pictures/%' THEN 'profile-pictures'
    WHEN profile_picture_url LIKE '%/object/public/images/%'           THEN 'images'
    WHEN profile_picture_url LIKE 'data:%' OR profile_picture_url LIKE 'blob:%' THEN 'inline (bad row)'
    ELSE 'other/external'
  END AS source_bucket,
  count(*) AS kids
FROM public.kids
GROUP BY 1
ORDER BY 2 DESC;

-- 5. US-634 pre-condition: which profile-pictures objects would become
--    unreadable once signed URLs are the only read path?
--
--    US-627 scoped SELECT on that bucket to
--      (storage.foldername(name))[1] = auth.uid()::text  OR  owner = auth.uid()
--    and createSignedUrl requires SELECT. Verified against a stand-in with that
--    exact policy applied: an object whose first path segment is not the owner's
--    uuid AND whose owner column is NULL is visible to admins only -- not even
--    to the parent whose child it is a photograph of. Today that is invisible,
--    because the bucket is public and the app falls back to the stored public
--    URL. At Release N+1, when public=false, every such avatar breaks.
--
--    unsignable > 0 means US-634 needs an owner backfill BEFORE the bucket is
--    closed, not after.
SELECT
  count(*) AS objects,
  count(*) FILTER (WHERE owner IS NOT NULL) AS signable_via_owner,
  count(*) FILTER (
    WHERE owner IS NULL
      AND (storage.foldername(name))[1] ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) AS signable_via_folder,
  count(*) FILTER (
    WHERE owner IS NULL
      AND coalesce((storage.foldername(name))[1], '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) AS unsignable
FROM storage.objects
WHERE bucket_id = 'profile-pictures';

-- What the answers decide:
--
--   public = true, and a policy with roles {public} on SELECT
--     -> the current state of the leak. Objects are readable by URL by anyone,
--        and anon can enumerate. Mirror US-627: replace the SELECT policy with
--        an owner-scoped one, and treat flipping public=false as its own
--        release, gated on app_config.min_ios_build, since shipped builds read
--        these URLs directly.
--
--   public = true, no unrestricted SELECT policy
--     -> enumeration is already closed; only the by-URL exposure remains, and
--        the guessable-path half of that is fixed (random UUID object names).
--
--   any policy marked 'ALL BUCKETS' with roles {public}
--     -> that policy alone decides the answer. It grants its access across every
--        bucket regardless of what the images-specific policies say, because RLS
--        policies are OR'd. Scope it to a bucket before writing anything else.
--
--   orphaned_no_owner > 0
--     -> owner-scoped SELECT would make those rows unreadable to everyone.
--        They need an owner backfill, or a policy that also matches on a path
--        the app can derive, BEFORE the policy is tightened.

-- 6. The same question for `images`, which query 5 does not ask and which
--    matters more there.
--
--    profile-pictures has TWO routes to signability: the owner column, or a
--    first path segment that is the owner's uuid. `images` has ONE. Objects
--    land at "{foods|recipes|kids}/{uuid}.jpg" (ImageUploadService.swift:47),
--    so the first segment is a folder TYPE, never a user id -- exactly why this
--    story's own criteria say to scope on storage.objects.owner rather than the
--    path. If owner is NULL, nothing can sign that object.
--
--    This is the bucket the LIVE iOS app writes every kid, food and recipe
--    photo into. Query 5 answers "can profile-pictures be closed"; without this
--    one, nothing answers "can images be closed", and US-634's Release N+1
--    would take the answer on faith for the bucket that holds most of the
--    photographs.
--
--    unsignable > 0 means an owner backfill has to happen BEFORE public goes
--    false, and the owner-scoped SELECT policy has to land in the SAME
--    migration as the flip -- a permissive policy added afterwards cannot help
--    an object nobody can read in the meantime.
SELECT
  count(*) AS objects,
  count(*) FILTER (WHERE owner IS NOT NULL) AS signable_via_owner,
  count(*) FILTER (WHERE owner IS NULL)     AS unsignable,
  count(DISTINCT (storage.foldername(name))[1]) AS distinct_top_folders
FROM storage.objects
WHERE bucket_id = 'images';

-- 7. And the same for every OTHER bucket, so the next one created in the
--    dashboard is not discovered the way `images` was -- by reading a Swift
--    file. Anything with unsignable > 0 cannot be made private without a
--    backfill first.
SELECT
  bucket_id,
  count(*) AS objects,
  count(*) FILTER (WHERE owner IS NULL) AS owner_is_null
FROM storage.objects
GROUP BY bucket_id
ORDER BY owner_is_null DESC, bucket_id;
