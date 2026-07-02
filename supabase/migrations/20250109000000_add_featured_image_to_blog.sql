-- Add featured_image column to blog_posts table.
-- CI-fix: this migration's timestamp sorts before create_blog_tables, so guard
-- the body for a clean replay where blog_posts does not exist yet. Idempotent;
-- existing environments are unchanged.
DO $$
BEGIN
  IF to_regclass('public.blog_posts') IS NOT NULL THEN
    ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS featured_image TEXT;
    CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
    CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
    CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts(published_at);
  END IF;
END $$;
