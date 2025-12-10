-- Add featured_image column to blog_posts table
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS featured_image TEXT;

-- Add comment to document the column
COMMENT ON COLUMN blog_posts.featured_image IS 'URL or path to the blog post featured image. Used for Open Graph and social media previews. Falls back to Cover.png if not set.';

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts(published_at);
