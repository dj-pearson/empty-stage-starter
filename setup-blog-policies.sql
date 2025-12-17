-- ============================================================================
-- Blog Public Access Policies
-- Run this on your self-hosted Supabase database to enable blog functionality
-- ============================================================================

-- Enable RLS on blog tables (if not already enabled)
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_categories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Public can read published blog posts" ON blog_posts;
DROP POLICY IF EXISTS "Public can read blog categories" ON blog_categories;
DROP POLICY IF EXISTS "Admins can manage blog posts" ON blog_posts;
DROP POLICY IF EXISTS "Admins can manage categories" ON blog_categories;

-- ============================================================================
-- PUBLIC READ POLICIES (Required for blog to work on public website)
-- ============================================================================

-- Allow anyone to read published blog posts
CREATE POLICY "Public can read published blog posts"
ON blog_posts
FOR SELECT
TO public
USING (status = 'published' AND published_at <= now());

-- Allow anyone to read blog categories
CREATE POLICY "Public can read blog categories"
ON blog_categories
FOR SELECT
TO public
USING (true);

-- ============================================================================
-- ADMIN MANAGEMENT POLICIES (For content management in admin panel)
-- ============================================================================

-- Admins can do everything with blog posts
CREATE POLICY "Admins can manage blog posts"
ON blog_posts
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Admins can manage categories
CREATE POLICY "Admins can manage categories"
ON blog_categories
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Check that policies are created
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename IN ('blog_posts', 'blog_categories')
ORDER BY tablename, policyname;

-- Test query (should work without authentication)
SELECT id, title, slug, published_at
FROM blog_posts
WHERE status = 'published'
ORDER BY published_at DESC
LIMIT 5;
