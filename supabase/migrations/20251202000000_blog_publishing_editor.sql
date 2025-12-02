-- Migration: Blog Publishing Editor Features
-- Adds: Prompt Versioning System, Scheduled Publishing Support
-- Date: 2025-12-02

-- ============================================
-- PART 1: PROMPT VERSIONING SYSTEM
-- ============================================

-- Create prompt templates table
CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'blog', -- blog, social, email, etc.
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb, -- Array of variable names expected in templates
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create prompt template versions table for version history
CREATE TABLE IF NOT EXISTS prompt_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES prompt_templates(id) ON DELETE CASCADE NOT NULL,
  version_number INTEGER NOT NULL,
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  change_notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(template_id, version_number)
);

-- Create prompt usage tracking table
CREATE TABLE IF NOT EXISTS prompt_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES prompt_templates(id) ON DELETE SET NULL,
  version_number INTEGER,
  used_for TEXT, -- 'blog_generation', 'social_content', etc.
  input_variables JSONB,
  output_summary TEXT, -- Brief summary of what was generated
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  tokens_used INTEGER,
  generation_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for prompt tables
CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_active ON prompt_templates(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_prompt_versions_template ON prompt_template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_prompt_usage_template ON prompt_usage_log(template_id);
CREATE INDEX IF NOT EXISTS idx_prompt_usage_created ON prompt_usage_log(created_at DESC);

-- Function to create a new version when template is updated
CREATE OR REPLACE FUNCTION create_prompt_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  -- Only create version if system_prompt or user_prompt_template changed
  IF OLD.system_prompt IS DISTINCT FROM NEW.system_prompt
     OR OLD.user_prompt_template IS DISTINCT FROM NEW.user_prompt_template
     OR OLD.variables IS DISTINCT FROM NEW.variables THEN

    -- Get next version number
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
    FROM prompt_template_versions
    WHERE template_id = NEW.id;

    -- Insert new version
    INSERT INTO prompt_template_versions (
      template_id,
      version_number,
      system_prompt,
      user_prompt_template,
      variables,
      change_notes,
      created_by
    ) VALUES (
      NEW.id,
      next_version,
      NEW.system_prompt,
      NEW.user_prompt_template,
      NEW.variables,
      'Auto-saved on update',
      NEW.created_by
    );
  END IF;

  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for version tracking
DROP TRIGGER IF EXISTS prompt_template_version_trigger ON prompt_templates;
CREATE TRIGGER prompt_template_version_trigger
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION create_prompt_version();

-- Function to get template with version history
CREATE OR REPLACE FUNCTION get_prompt_template_with_versions(p_template_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  category TEXT,
  system_prompt TEXT,
  user_prompt_template TEXT,
  variables JSONB,
  is_active BOOLEAN,
  is_default BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  versions JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pt.id,
    pt.name,
    pt.description,
    pt.category,
    pt.system_prompt,
    pt.user_prompt_template,
    pt.variables,
    pt.is_active,
    pt.is_default,
    pt.created_at,
    pt.updated_at,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'version_number', pv.version_number,
          'system_prompt', pv.system_prompt,
          'user_prompt_template', pv.user_prompt_template,
          'variables', pv.variables,
          'change_notes', pv.change_notes,
          'created_at', pv.created_at
        ) ORDER BY pv.version_number DESC
      )
      FROM prompt_template_versions pv
      WHERE pv.template_id = pt.id),
      '[]'::jsonb
    ) as versions
  FROM prompt_templates pt
  WHERE pt.id = p_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to restore a specific version
CREATE OR REPLACE FUNCTION restore_prompt_version(
  p_template_id UUID,
  p_version_number INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_version prompt_template_versions%ROWTYPE;
BEGIN
  -- Get the version to restore
  SELECT * INTO v_version
  FROM prompt_template_versions
  WHERE template_id = p_template_id
    AND version_number = p_version_number;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Update the template with the version's content
  UPDATE prompt_templates
  SET
    system_prompt = v_version.system_prompt,
    user_prompt_template = v_version.user_prompt_template,
    variables = v_version.variables
  WHERE id = p_template_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 2: SCHEDULED PUBLISHING ENHANCEMENTS
-- ============================================

-- Add index for scheduled posts (existing column, new index for cron efficiency)
CREATE INDEX IF NOT EXISTS idx_blog_posts_scheduled
  ON blog_posts(scheduled_for)
  WHERE status = 'scheduled' AND scheduled_for IS NOT NULL;

-- Create scheduled tasks tracking table
CREATE TABLE IF NOT EXISTS scheduled_publish_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending', -- pending, published, failed, cancelled
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_publish_status ON scheduled_publish_log(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_publish_post ON scheduled_publish_log(post_id);

-- Function to get posts due for publishing
CREATE OR REPLACE FUNCTION get_posts_due_for_publishing()
RETURNS TABLE (
  id UUID,
  title TEXT,
  slug TEXT,
  scheduled_for TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    bp.id,
    bp.title,
    bp.slug,
    bp.scheduled_for
  FROM blog_posts bp
  WHERE bp.status = 'scheduled'
    AND bp.scheduled_for IS NOT NULL
    AND bp.scheduled_for <= NOW()
  ORDER BY bp.scheduled_for ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to publish a scheduled post
CREATE OR REPLACE FUNCTION publish_scheduled_post(p_post_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_post blog_posts%ROWTYPE;
BEGIN
  -- Get the post
  SELECT * INTO v_post
  FROM blog_posts
  WHERE id = p_post_id
    AND status = 'scheduled';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Update post to published
  UPDATE blog_posts
  SET
    status = 'published',
    published_at = NOW(),
    updated_at = NOW()
  WHERE id = p_post_id;

  -- Log the publish event
  INSERT INTO scheduled_publish_log (post_id, scheduled_for, published_at, status)
  VALUES (p_post_id, v_post.scheduled_for, NOW(), 'published');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PART 3: RLS POLICIES
-- ============================================

-- Enable RLS on new tables
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_publish_log ENABLE ROW LEVEL SECURITY;

-- Prompt templates: Admins can manage, all authenticated users can view active templates
CREATE POLICY "Admins can manage prompt templates"
  ON prompt_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can view active prompt templates"
  ON prompt_templates FOR SELECT
  USING (is_active = true AND auth.uid() IS NOT NULL);

-- Prompt versions: Same as templates
CREATE POLICY "Admins can manage prompt versions"
  ON prompt_template_versions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can view prompt versions"
  ON prompt_template_versions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Prompt usage log: Admin only
CREATE POLICY "Admins can view prompt usage"
  ON prompt_usage_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Scheduled publish log: Admin only
CREATE POLICY "Admins can view scheduled publish log"
  ON scheduled_publish_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- ============================================
-- PART 4: INSERT DEFAULT PROMPT TEMPLATES
-- ============================================

INSERT INTO prompt_templates (name, description, category, system_prompt, user_prompt_template, variables, is_active, is_default)
VALUES
(
  'Blog Article Generator',
  'Standard blog post generation prompt for EatPal parenting content',
  'blog',
  'You are an expert content writer specializing in parenting, child nutrition, and family wellness.

WRITING STYLE:
- Tone: {{tone}}
- Approach: {{perspective}}
- Must be completely unique and different from generic parenting advice
- Avoid clichés and overused phrases
- Bring fresh insights and actionable value

Create comprehensive, SEO-optimized blog content that is engaging, informative, and actionable for parents.',
  'Create a complete blog article about: {{topic}}

{{#if keywords}}Focus on these keywords: {{keywords}}{{/if}}
{{#if targetAudience}}Target audience: {{targetAudience}}{{else}}Target audience: Parents of picky eaters and young children{{/if}}

UNIQUENESS REQUIREMENTS:
- Approach from a FRESH angle
- Use the {{tone}} tone throughout
- Frame the content through {{perspective}}
- Provide specific, actionable advice
- Include unique examples and scenarios

Generate a comprehensive blog post with:
1. Title: Engaging, SEO-friendly (60 chars max)
2. SEO Title: Optimized meta title (60 chars max)
3. SEO Description: Compelling meta description (150-160 chars)
4. Excerpt: Brief hook (150-200 words)
5. Body Content: ~1000-1400 words with clear headings
6. FAQ Section: 5-7 questions with detailed answers

Return ONLY valid JSON with keys: title, seo_title, seo_description, excerpt, body, faq',
  '["topic", "keywords", "targetAudience", "tone", "perspective"]'::jsonb,
  true,
  true
),
(
  'Quick Tips Generator',
  'Generates shorter, tip-focused blog posts',
  'blog',
  'You are a parenting expert creating quick, actionable tips for busy parents. Keep content concise but valuable.',
  'Create a quick tips article about: {{topic}}

Generate:
1. Catchy title (under 60 chars)
2. Brief intro (2-3 sentences)
3. 5-7 actionable tips with brief explanations
4. Quick summary/takeaway

Return as JSON with keys: title, intro, tips (array), summary',
  '["topic"]'::jsonb,
  true,
  false
),
(
  'Social Media Snippets',
  'Generates social media content from blog posts',
  'social',
  'You are a social media expert creating engaging, shareable content for parents.',
  'Create social media content for this blog post:

Title: {{title}}
Excerpt: {{excerpt}}
URL: {{url}}

Generate platform-specific posts:
- Twitter/X: Under 280 chars, engaging hook
- Facebook: 1-2 paragraphs, conversational
- Instagram: Caption with emojis, call-to-action
- LinkedIn: Professional tone, value-focused

Return as JSON with keys: twitter, facebook, instagram, linkedin',
  '["title", "excerpt", "url"]'::jsonb,
  true,
  false
)
ON CONFLICT DO NOTHING;

-- Insert initial versions for the default templates
INSERT INTO prompt_template_versions (template_id, version_number, system_prompt, user_prompt_template, variables, change_notes)
SELECT
  id,
  1,
  system_prompt,
  user_prompt_template,
  variables,
  'Initial version'
FROM prompt_templates
WHERE is_default = true
ON CONFLICT DO NOTHING;

-- ============================================
-- PART 5: UPDATE TRIGGERS
-- ============================================

-- Trigger for prompt_templates updated_at
CREATE TRIGGER update_prompt_templates_updated_at
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
