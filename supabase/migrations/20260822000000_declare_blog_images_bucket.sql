-- US-643: declare the blog-images bucket that two edge functions already use.
--
-- functions/agent-blog-writer/index.ts and functions/update-blog-image/index.ts
-- both upload a hero image here and then call getPublicUrl on it, storing that
-- URL on the blog post. No migration ever created the bucket, so it exists only
-- because someone clicked in the Supabase dashboard: a fresh environment comes
-- up without it, and the failure is silent. agent-blog-writer:69 catches the
-- upload error and falls back to the provider URL; getPublicUrl never checks
-- that anything exists, it only builds a string. So a rebuilt instance keeps
-- publishing posts whose images point at a bucket that is not there.
--
-- public = true is read off the call sites, not guessed: the stored URL is a
-- getPublicUrl result rendered in a public blog post, so anonymous read is the
-- feature. ON CONFLICT DO NOTHING means production's own flag is left exactly
-- as it is; this only decides what a fresh environment gets.
--
-- Additive only (new bucket + new policies) -- safe for shipped iOS clients,
-- none of which touch this bucket.

INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-images', 'blog-images', true)
ON CONFLICT (id) DO NOTHING;

-- Re-runnable: the bucket may already exist in an environment that recorded an
-- earlier version, and CREATE POLICY has no IF NOT EXISTS.
DROP POLICY IF EXISTS "Public can view blog images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload blog images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update blog images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete blog images" ON storage.objects;

-- Anyone can read: these are hero images on public blog posts. Unlike
-- profile-pictures, nothing here is personal data.
CREATE POLICY "Public can view blog images"
ON storage.objects FOR SELECT
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
