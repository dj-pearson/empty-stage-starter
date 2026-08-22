-- US-634 / US-628: let a user delete and replace the photos they own, not just
-- the ones whose path happens to start with their uid.
--
-- 20251008025307 wrote all four profile-pictures policies against the path:
--
--   auth.uid()::text = (storage.foldername(name))[1]
--
-- 20260817000000 then scoped SELECT and deliberately added a second branch,
-- because the path is only a PROXY for ownership and misses objects uploaded
-- before the convention settled:
--
--   (storage.foldername(name))[1] = auth.uid()::text OR owner = auth.uid()
--
-- DELETE and UPDATE never got that branch. The result is an asymmetry with a
-- compliance edge: for a legacy object, the owning parent CAN read their
-- child's photo and CANNOT delete or replace it. Measured on PostgreSQL 16.13
-- before this migration -- owner reads 2 objects, deletes 1, and the legacy one
-- is still there afterwards.
--
-- It fails silently. storage.remove() on a row RLS forbids is not an error; it
-- returns an empty list, so the caller sees success. src/lib/storageCleanup.ts
-- is fixed in the same change to treat an empty result as "nothing removed".
--
-- This matters most for US-634. The Privacy Policy promises that deleting a
-- child profile deletes the data, and today a replaced legacy photo is left
-- behind in a bucket that is still public-read by URL.
--
-- Additive in effect: DELETE and UPDATE are WIDENED, and only to objects whose
-- storage.objects.owner is already the caller. No shipped client loses access.
-- The policy names come from a migration rather than the dashboard, so unlike
-- the `images` bucket in US-635 they can be dropped by name with confidence.

DROP POLICY IF EXISTS "Users can delete their own profile pictures" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own profile pictures" ON storage.objects;

CREATE POLICY "Users can delete their own profile pictures"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-pictures'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR owner = auth.uid()
  )
);

CREATE POLICY "Users can update their own profile pictures"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-pictures'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR owner = auth.uid()
  )
);

-- INSERT is deliberately NOT changed. A brand-new object has no owner yet, and
-- requiring it to land in the caller's own folder is the check that makes the
-- path convention true in the first place.
