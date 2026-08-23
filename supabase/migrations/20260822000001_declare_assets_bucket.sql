-- US-643: declare the Assets bucket that the lead-magnet email already uses.
--
-- src/lib/exitIntentGuide.ts:25 calls getPublicUrl on 'Assets' for
-- picky-eater-food-chaining-guide.pdf and puts the result in an email queued to
-- a lead who has just handed over an address. No migration creates the bucket,
-- so it exists only because someone clicked in the dashboard, and a fresh
-- environment sends the email with a link that 404s. getPublicUrl only builds a
-- string; it never checks the bucket or the object exists, so nothing anywhere
-- reports the failure.
--
-- public = true is read off the call site, not guessed. The consumer is an
-- email client opening the link from an inbox: no Supabase session, no anon
-- key, and no signing code anywhere in the repo. A private bucket cannot serve
-- that link at all, so public is the only flag under which the feature works.
--
-- ON CONFLICT DO NOTHING leaves production's own flag exactly as it is. This
-- decides what a fresh environment gets, and nothing else. The earlier round of
-- this story held the bucket back for a production read on the grounds that
-- declaring it blind risks contradicting production -- with ON CONFLICT that
-- risk does not exist for the bucket row.
--
-- The policies are a weaker claim, since CREATE POLICY has no ON CONFLICT: if
-- production already carries its own for this bucket, these are added
-- alongside, and permissive RLS policies are OR'd, so the net effect can only
-- widen. Acceptable for a marketing PDF that is already handed to strangers by
-- email. NOT acceptable for `images` (US-635), which holds photographs of
-- children -- that one still waits on the dashboard read.
--
-- Additive only. No shipped iOS build touches this bucket.

INSERT INTO storage.buckets (id, name, public)
VALUES ('Assets', 'Assets', true)
ON CONFLICT (id) DO NOTHING;

-- Re-runnable: CREATE POLICY has no IF NOT EXISTS.
DROP POLICY IF EXISTS "Authenticated can view assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete assets" ON storage.objects;

-- SELECT is scoped to authenticated rather than left open to the public role.
-- The emailed download does not need it: 20260817000000 records that public
-- reads are served by the storage API without consulting RLS. An open SELECT
-- would only add list(), letting anyone with the anon key enumerate the bucket.
-- authenticated covers the admin storage screen, which lists through
-- storageManager.listFiles (src/lib/storage-manager.ts:482).
CREATE POLICY "Authenticated can view assets"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'Assets');

CREATE POLICY "Authenticated can upload assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'Assets');

CREATE POLICY "Authenticated can update assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'Assets');

CREATE POLICY "Authenticated can delete assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'Assets');
