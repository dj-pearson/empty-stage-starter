-- Add unique constraint required by track_blog_content() trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'blog_content_tracking_post_id_key'
      AND conrelid = 'public.blog_content_tracking'::regclass
  ) THEN
    ALTER TABLE public.blog_content_tracking
    ADD CONSTRAINT blog_content_tracking_post_id_key UNIQUE (post_id);
  END IF;
END$$;