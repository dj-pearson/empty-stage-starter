-- AI-generated images for blog & social posts.
-- Additive only (new public bucket + new tracking table) — safe for shipped iOS clients.

-- ─── Storage bucket (public, read-only to the world, admin-writable) ──────────
-- NOTE: the declared `blog-images`/`recipe-images` entries in storage_buckets_config
-- were never created as real storage.buckets. This is the first physically-created
-- bucket dedicated to generated content.
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-images', 'generated-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read (images are surfaced publicly as og:image / on social).
CREATE POLICY "Public can view generated images"
ON storage.objects FOR SELECT
USING (bucket_id = 'generated-images');

-- Only authenticated users may write/replace/remove (edge function uses the
-- service role, which bypasses RLS; this covers any client-side admin upload).
CREATE POLICY "Authenticated can upload generated images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'generated-images');

CREATE POLICY "Authenticated can update generated images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'generated-images');

CREATE POLICY "Authenticated can delete generated images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'generated-images');

-- ─── Tracking table: history / reuse / cost auditing ─────────────────────────
CREATE TABLE IF NOT EXISTS public.generated_images (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text NOT NULL CHECK (source IN ('blog', 'social', 'manual')),
  record_id   uuid,                       -- blog_posts.id or social_posts.id (nullable for ad-hoc)
  image_url   text NOT NULL,
  storage_path text,
  prompt      text NOT NULL,
  provider    text NOT NULL DEFAULT 'openai',
  model       text,
  size        text,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generated_images_record
  ON public.generated_images (source, record_id);
CREATE INDEX IF NOT EXISTS idx_generated_images_created_at
  ON public.generated_images (created_at DESC);

ALTER TABLE public.generated_images ENABLE ROW LEVEL SECURITY;

-- Admins manage all rows. Mirrors the admin-gated pattern used by blog_posts:
-- a row in public.user_roles with role = 'admin' keyed off auth.uid().
CREATE POLICY "Admins manage generated images"
ON public.generated_images FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
  )
);
