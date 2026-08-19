-- US-635 diagnostic: what is the 'images' bucket actually configured as?
--
-- READ ONLY. Nothing here changes anything. Run it in the Supabase SQL editor
-- (or psql against production) and paste the output into the story.
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
SELECT id, name, public, file_size_limit, allowed_mime_types, created_at
FROM storage.buckets
WHERE name IN ('images', 'profile-pictures');

-- 2. Every policy on storage.objects that can apply to this bucket, with the
--    roles it applies to. `{public}` in the roles column includes anon, which
--    is what made profile-pictures enumerable before US-627.
SELECT policyname, cmd, roles, permissive, qual
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (qual ILIKE '%images%' OR with_check ILIKE '%images%')
ORDER BY cmd, policyname;

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
--   orphaned_no_owner > 0
--     -> owner-scoped SELECT would make those rows unreadable to everyone.
--        They need an owner backfill, or a policy that also matches on a path
--        the app can derive, BEFORE the policy is tightened.
