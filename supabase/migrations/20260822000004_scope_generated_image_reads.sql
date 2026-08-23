-- US-643 follow-through: close anon enumeration of generated-images.
--
-- 20260630000000 created this bucket with a SELECT policy carrying no TO
-- clause, so it applies to the `public` role, which includes `anon`. That is
-- the same shape US-627 spent a migration removing from profile-pictures: a
-- client holding only the anon key can list every object in the bucket.
--
-- It was copied into the first draft of 20260822000000 (blog-images) before
-- being caught there, and the comment in that migration called this one out as
-- a separate cleanup. This is the cleanup.
--
-- Nothing is lost by scoping it. Reads of a public bucket are served by the
-- storage API without consulting RLS -- 20260817000000 records this, and it is
-- why scoping profile-pictures did not stop shipped iOS builds rendering
-- photos. So the og:image and social-scraper reads this bucket exists for keep
-- working untouched. The only capability an open SELECT adds is list().
--
-- Verified before writing, the way US-627 did it: the only callers are
-- supabase/functions/_shared/image-gen.ts and
-- supabase/functions/update-blog-image/index.ts. Both authenticate with
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS entirely, and both call only
-- upload and getPublicUrl. Nothing anywhere in src, app, functions, ios or
-- scripts calls list() on this bucket.
--
-- With this, no SELECT policy on storage.objects is open to the public role,
-- and INTENTIONALLY_PUBLIC_BUCKETS in src/lib/storageBucketPolicies.test.ts is
-- empty -- so that guard stops carrying exemptions and becomes absolute.
--
-- Policy-only. The bucket's public flag is unchanged.
--
-- This IS a narrowing, and the gate is right to stop it: the replacement drops
-- anon's SELECT and carries a different name, so check-migration-safety.sh
-- counts it as a removal. Acknowledged rather than worked around, with the
-- check the gate asks for actually done -- "confirm no live build depends on
-- it". No shipped client reads through this policy: reads of a public bucket
-- bypass RLS, the only two callers hold the service-role key, and nothing in
-- src, app, functions, ios or scripts calls list() on this bucket.
-- migration-safety: allow drop-policy (US-643: closes anon enumeration of
-- generated-images; public reads bypass RLS so no shipped client loses access,
-- and the only callers use the service-role key)

DROP POLICY IF EXISTS "Public can view generated images" ON storage.objects;
-- The new name too, or a replay dies on "policy already exists". The other
-- bucket migrations in this series drop their own names for the same reason.
DROP POLICY IF EXISTS "Authenticated can view generated images" ON storage.objects;

CREATE POLICY "Authenticated can view generated images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'generated-images');
