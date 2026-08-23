-- US-643: declare the blog-images bucket that two edge functions already use.
--
-- functions/agent-blog-writer/index.ts uploads a hero image here and then calls
-- getPublicUrl on it, storing that URL on the blog post. No migration ever
-- created the bucket, so it exists only because someone clicked in the Supabase
-- dashboard: a fresh environment comes up without it, and the failure is
-- silent. agent-blog-writer:69 catches the upload error and falls back to the
-- provider URL; getPublicUrl never checks that anything exists, it only builds
-- a string. So a rebuilt instance keeps publishing posts whose images point at
-- a bucket that is not there.
--
-- CORRECTED: the first version of this comment named a second writer,
-- functions/update-blog-image/index.ts. That copy is DEAD. update-blog-image is
-- one of the 14 cross-tree collisions check-function-trees.sh tracks, and
-- supabase/config.toml:174 registers it WITHOUT an entrypoint -- which
-- config.toml:16 documents as resolving to supabase/functions/NAME. The
-- deployed copy is supabase/functions/update-blog-image/index.ts, and it writes
-- to generated-images, not here. agent-blog-writer is live because
-- config.toml:100 gives it an explicit `entrypoint = "../functions/..."`.
--
-- So this bucket has exactly ONE live writer, and the dead namesake beside it
-- stores to a different bucket entirely. That is the US-519 shape the function-
-- tree gate exists to catch: a fix applied to the copy the runtime never loads.
-- Resolving that collision is the gate's tracked work, not this migration's.
--
-- public = true is read off the call sites, not guessed: the stored URL is a
-- getPublicUrl result rendered in a public blog post, so anonymous read is the
-- feature. ON CONFLICT DO NOTHING means production's own flag is left exactly
-- as it is; this only decides what a fresh environment gets.
--
-- Additive only (new bucket + new policies) -- safe for shipped iOS clients,
-- none of which touch this bucket.
--
-- One caveat worth naming, since CREATE POLICY has no ON CONFLICT: if
-- production already carries its own policies for this bucket, these are added
-- alongside rather than replacing them, and permissive RLS policies are OR'd.
-- That can only widen. It is acceptable here and NOT acceptable for the
-- `images` bucket (US-635), which holds photographs of children -- which is why
-- that one still waits on a production read and this one does not.

INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-images', 'blog-images', true)
ON CONFLICT (id) DO NOTHING;

-- Re-runnable: the bucket may already exist in an environment that recorded an
-- earlier version, and CREATE POLICY has no IF NOT EXISTS.
DROP POLICY IF EXISTS "Authenticated can view blog images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload blog images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update blog images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete blog images" ON storage.objects;

-- SELECT is scoped to authenticated, NOT left open to the public role.
--
-- An open SELECT would not be what makes the blog images load: 20260817000000
-- records that public reads are served by the storage API without consulting
-- RLS, which is why scoping profile-pictures did not stop shipped iOS builds
-- rendering photos. What an open SELECT adds is list(), so the only thing a
-- `USING (bucket_id = 'blog-images')` policy with no TO clause would buy is
-- letting anyone holding the anon key enumerate the bucket -- the precise hole
-- US-627 spent a migration closing on profile-pictures.
--
-- generated-images (20260630000000) has the open form. It was copied here in
-- the first draft of this migration and is wrong for the same reason; that
-- bucket is a separate cleanup, not something to spread.
--
-- authenticated covers the one caller that genuinely lists: the admin storage
-- screen, through storageManager.listFiles (src/lib/storage-manager.ts:482).
CREATE POLICY "Authenticated can view blog images"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'blog-images');

-- Writes are for the edge functions, which use the service role and bypass RLS
-- entirely. These cover the admin UI's client-side upload path.
CREATE POLICY "Authenticated can upload blog images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'blog-images');

CREATE POLICY "Authenticated can update blog images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'blog-images');

CREATE POLICY "Authenticated can delete blog images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'blog-images');
