-- US-627: stop anonymous enumeration of the profile-pictures bucket.
--
-- The bucket was created in 20251008025307 with `public = true` AND a SELECT
-- policy on storage.objects carrying no role restriction:
--
--   CREATE POLICY "Users can view all profile pictures"
--   ON storage.objects FOR SELECT USING (bucket_id = 'profile-pictures');
--
-- A policy with no TO clause applies to the `public` role, which includes
-- `anon`. So an unauthenticated client holding only the anon key could call
-- storage.from('profile-pictures').list() and enumerate every object path in
-- the bucket, then fetch each one. The bucket holds photographs of children.
--
-- This migration scopes that SELECT to the owning user (plus admins).
--
-- The bucket deliberately STAYS public in this migration. Shipped iOS builds
-- render kids.profile_picture_url as a plain public URL (Kid.swift:11,
-- KidProfileEditorView.swift:70) and the app has no force-update gate, so
-- flipping `public = false` would break every phone in the field. Public
-- reads are served by the storage API without consulting RLS, so those keep
-- working; only the enumeration path is closed here. US-634 tracks the move
-- to a private bucket with signed URLs once a min-build gate exists.
--
-- Additive/policy-only per CLAUDE.md: no DROP COLUMN, DROP TABLE, or RENAME.
-- Verified before writing: no shipped iOS build lists this bucket. iOS uploads
-- through ImageUploadService, which targets a different bucket ("images", see
-- US-635) and only ever calls upload/getPublicURL/remove, never list.

DROP POLICY IF EXISTS "Users can view all profile pictures" ON storage.objects;

CREATE POLICY "Users can view own profile pictures"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-pictures'
  AND (
    -- Objects are stored at {user_id}/{name}. Match on the folder, and also on
    -- storage's own owner column, so an object uploaded before the path
    -- convention settled is still readable by the person who uploaded it.
    (storage.foldername(name))[1] = auth.uid()::text
    OR owner = auth.uid()
  )
);

-- Admins keep full read access for the storage management screen
-- (src/components/admin/StorageManagement.tsx), matching the user_roles
-- pattern used by generated_images and admin_alerts.
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
