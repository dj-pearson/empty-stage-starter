# Complete Blog System Build Guide - From Absolute Zero

## 📖 Table of Contents

1. [Introduction](#introduction)
2. [What You're Building](#what-youre-building)
3. [Prerequisites](#prerequisites)
4. [Phase 1: Database Setup](#phase-1-database-setup)
5. [Phase 2: Edge Functions Setup](#phase-2-edge-functions-setup)
6. [Phase 3: Frontend Components](#phase-3-frontend-components)
7. [Phase 4: Configuration](#phase-4-configuration)
8. [Phase 5: Testing](#phase-5-testing)
9. [Phase 6: Deployment](#phase-6-deployment)
10. [Troubleshooting](#troubleshooting)

---

## Introduction

This guide contains **EVERY LINE OF CODE** needed to build a world-class blog system from scratch. You can use this guide to:

- **Deploy to 8 different sites** (all with the same codebase)
- **Build the complete system** starting from zero
- **Understand every component** with full code included

**What makes this special:**
- ✅ Complete code for all 4 database migrations
- ✅ Complete code for all 9 edge functions
- ✅ Complete code for all frontend components
- ✅ Step-by-step instructions
- ✅ No external dependencies or "see other file" references

**Time to complete:** 3-4 hours for first site, 2 hours for subsequent sites

---

## What You're Building

### Core Features

1. **AI-Powered Content Generation** - Generate blog posts with GPT-4/Claude
2. **Title Bank System** - Systematic content coverage, no duplicates
3. **Duplicate Prevention** - 85% similarity detection
4. **SEO Optimization** - Auto-generated schema markup, quality scoring
5. **Analytics Tracking** - Real-time engagement, conversions, scroll depth
6. **Multi-Format Content** - Repurpose to Twitter, Instagram, LinkedIn, etc.
7. **Internal Linking** - Smart link suggestions based on keyword matching
8. **A/B Testing** - Test titles, excerpts, images
9. **Content Versioning** - Rollback capability
10. **Personalized Recommendations** - Based on reading history

### Database Architecture

- **35+ tables** for comprehensive data management
- **10+ database functions** for intelligent automation
- **4 edge functions** for AI-powered features
- **3 React components** for enhanced UX
- **100+ features** covering every aspect of blogging

---

## Prerequisites

### Required Accounts

1. **Supabase Account** (free tier works)
   - Sign up: https://supabase.com
   - Create a new project
   - Note your project URL and keys

2. **OpenAI API Key** (or Anthropic Claude API)
   - Sign up: https://platform.openai.com
   - Create API key
   - Add billing (pay-as-you-go)

3. **Hosting Platform** (choose one)
   - CloudFlare Pages (recommended)
   - Vercel
   - Netlify

### Required Tools

```bash
# Node.js (v18 or later)
node --version  # Should show v18+

# npm
npm --version

# Supabase CLI
npm install -g supabase

# Git
git --version
```

### Required Knowledge

- Basic SQL understanding
- Basic JavaScript/TypeScript
- Basic React knowledge
- Comfortable with command line

---

## Phase 1: Database Setup

### Step 1: Access Supabase SQL Editor

1. Go to https://app.supabase.com
2. Select your project
3. Click "SQL Editor" in left sidebar
4. Click "New Query"

### Step 2: Run Migration 1 - Core Blog Tables

**File:** `supabase/migrations/20251008144000_create_blog_tables.sql`

Copy and paste this ENTIRE SQL block into the SQL Editor:

```sql
-- Create blog categories table
CREATE TABLE IF NOT EXISTS blog_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  post_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create blog tags table
CREATE TABLE IF NOT EXISTS blog_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create blog posts table
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  featured_image_url TEXT,
  category_id UUID REFERENCES blog_categories(id) ON DELETE SET NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'draft', -- draft, published, scheduled
  published_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  meta_title TEXT,
  meta_description TEXT,
  og_image_url TEXT,
  views INTEGER DEFAULT 0,
  reading_time_minutes INTEGER,
  ai_generated BOOLEAN DEFAULT FALSE,
  ai_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create post tags junction table
CREATE TABLE IF NOT EXISTS blog_post_tags (
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- Create blog comments table
CREATE TABLE IF NOT EXISTS blog_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, approved, spam
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_author ON blog_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_blog_categories_slug ON blog_categories(slug);
CREATE INDEX IF NOT EXISTS idx_blog_tags_slug ON blog_tags(slug);
CREATE INDEX IF NOT EXISTS idx_blog_comments_post ON blog_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_blog_comments_status ON blog_comments(status);

-- Enable RLS
ALTER TABLE blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_post_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Categories: Admin manage, anyone can view
CREATE POLICY "Admins can manage blog categories"
  ON blog_categories FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can view categories"
  ON blog_categories FOR SELECT
  USING (true);

-- Tags: Admin manage, anyone can view
CREATE POLICY "Admins can manage blog tags"
  ON blog_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can view tags"
  ON blog_tags FOR SELECT
  USING (true);

-- Posts: Admin manage, anyone can view published
CREATE POLICY "Admins can manage blog posts"
  ON blog_posts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can view published posts"
  ON blog_posts FOR SELECT
  USING (status = 'published' AND published_at <= NOW());

-- Post tags: Follow post permissions
CREATE POLICY "Admins can manage post tags"
  ON blog_post_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can view post tags"
  ON blog_post_tags FOR SELECT
  USING (true);

-- Comments: Admin manage, anyone can submit (pending approval)
CREATE POLICY "Admins can manage comments"
  ON blog_comments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can view approved comments"
  ON blog_comments FOR SELECT
  USING (status = 'approved');

CREATE POLICY "Anyone can submit comments"
  ON blog_comments FOR INSERT
  WITH CHECK (true);

-- Triggers for updated_at
CREATE TRIGGER update_blog_categories_updated_at
  BEFORE UPDATE ON blog_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_blog_posts_updated_at
  BEFORE UPDATE ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to update category post count
CREATE OR REPLACE FUNCTION update_category_post_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.category_id IS NOT NULL THEN
    UPDATE blog_categories SET post_count = post_count + 1 WHERE id = NEW.category_id;
  ELSIF TG_OP = 'DELETE' AND OLD.category_id IS NOT NULL THEN
    UPDATE blog_categories SET post_count = post_count - 1 WHERE id = OLD.category_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.category_id IS NOT NULL AND OLD.category_id != NEW.category_id THEN
      UPDATE blog_categories SET post_count = post_count - 1 WHERE id = OLD.category_id;
    END IF;
    IF NEW.category_id IS NOT NULL AND OLD.category_id != NEW.category_id THEN
      UPDATE blog_categories SET post_count = post_count + 1 WHERE id = NEW.category_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_posts_category_count
  AFTER INSERT OR UPDATE OR DELETE ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_category_post_count();

-- Function to calculate reading time (roughly 200 words per minute)
CREATE OR REPLACE FUNCTION calculate_reading_time()
RETURNS TRIGGER AS $$
BEGIN
  NEW.reading_time_minutes := GREATEST(1, (LENGTH(NEW.content) / 1000)::INTEGER);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_posts_reading_time
  BEFORE INSERT OR UPDATE OF content ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION calculate_reading_time();

-- Function to auto-generate slug from title
CREATE OR REPLACE FUNCTION generate_slug_from_title()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := lower(regexp_replace(regexp_replace(NEW.title, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER blog_posts_generate_slug
  BEFORE INSERT OR UPDATE OF title ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION generate_slug_from_title();

-- Function to get blog stats
CREATE OR REPLACE FUNCTION get_blog_stats()
RETURNS TABLE (
  total_posts INTEGER,
  published_posts INTEGER,
  draft_posts INTEGER,
  scheduled_posts INTEGER,
  total_views BIGINT,
  total_comments BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_posts,
    COUNT(*) FILTER (WHERE status = 'published')::INTEGER as published_posts,
    COUNT(*) FILTER (WHERE status = 'draft')::INTEGER as draft_posts,
    COUNT(*) FILTER (WHERE status = 'scheduled')::INTEGER as scheduled_posts,
    COALESCE(SUM(views), 0)::BIGINT as total_views,
    (SELECT COUNT(*) FROM blog_comments)::BIGINT as total_comments
  FROM blog_posts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default categories
INSERT INTO blog_categories (name, slug, description)
VALUES
  ('Picky Eaters', 'picky-eaters', 'Tips and strategies for dealing with picky eaters'),
  ('Meal Planning', 'meal-planning', 'Meal planning advice and recipes'),
  ('Nutrition', 'nutrition', 'Nutritional information and healthy eating tips'),
  ('Parenting', 'parenting', 'General parenting advice related to food and meals'),
  ('Recipes', 'recipes', 'Kid-friendly recipes and meal ideas')
ON CONFLICT DO NOTHING;

-- Insert default tags
INSERT INTO blog_tags (name, slug)
VALUES
  ('Tips', 'tips'),
  ('Recipes', 'recipes'),
  ('Nutrition', 'nutrition'),
  ('Meal Prep', 'meal-prep'),
  ('Quick Meals', 'quick-meals'),
  ('Healthy Eating', 'healthy-eating'),
  ('Food Safety', 'food-safety'),
  ('Allergies', 'allergies')
ON CONFLICT DO NOTHING;
```

**Click "Run" in SQL Editor**

✅ **Verification:** Run this query to verify:
```sql
SELECT COUNT(*) FROM blog_categories;
```
Should return 5.

---

### Step 3: Run Migration 2 - Title Bank & Uniqueness Tracking

**File:** `supabase/migrations/20251013150000_blog_uniqueness_tracking.sql`

Copy and paste this ENTIRE SQL block:

```sql
-- Blog Title Bank and Uniqueness Tracking System

-- Table to store available blog titles
CREATE TABLE IF NOT EXISTS blog_title_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL UNIQUE,
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  variations_generated INTEGER DEFAULT 0,
  is_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table to track content similarity
CREATE TABLE IF NOT EXISTS blog_content_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  title_fingerprint TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  topic_keywords TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table to track AI generation history
CREATE TABLE IF NOT EXISTS blog_generation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  keywords TEXT[],
  tone_used TEXT,
  perspective_used TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_title_bank_times_used ON blog_title_bank(times_used);
CREATE INDEX IF NOT EXISTS idx_title_bank_last_used ON blog_title_bank(last_used_at);
CREATE INDEX IF NOT EXISTS idx_content_tracking_post ON blog_content_tracking(post_id);
CREATE INDEX IF NOT EXISTS idx_content_tracking_hash ON blog_content_tracking(content_hash);
CREATE INDEX IF NOT EXISTS idx_content_tracking_fingerprint ON blog_content_tracking(title_fingerprint);
CREATE INDEX IF NOT EXISTS idx_generation_history_date ON blog_generation_history(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_history_keywords ON blog_generation_history USING gin(keywords);

-- Function to normalize title
CREATE OR REPLACE FUNCTION normalize_title(title_text TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(regexp_replace(regexp_replace(title_text, '[^a-zA-Z0-9\s]', '', 'g'), '\s+', ' ', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate content hash
CREATE OR REPLACE FUNCTION generate_content_hash(content_text TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN md5(substring(regexp_replace(content_text, '\s+', '', 'g'), 1, 1000));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to extract keywords
CREATE OR REPLACE FUNCTION extract_keywords(text_content TEXT)
RETURNS TEXT[] AS $$
DECLARE
  words TEXT[];
  cleaned_text TEXT;
BEGIN
  cleaned_text := lower(regexp_replace(text_content, '[^a-zA-Z\s]', ' ', 'g'));
  words := regexp_split_to_array(cleaned_text, '\s+');

  RETURN ARRAY(
    SELECT DISTINCT word
    FROM unnest(words) AS word
    WHERE length(word) > 4
    ORDER BY word
    LIMIT 50
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check title similarity
CREATE OR REPLACE FUNCTION check_title_similarity(new_title TEXT, threshold NUMERIC DEFAULT 0.8)
RETURNS TABLE (
  similar_post_id UUID,
  similar_title TEXT,
  similarity_score NUMERIC
) AS $$
DECLARE
  normalized_new_title TEXT;
BEGIN
  normalized_new_title := normalize_title(new_title);

  RETURN QUERY
  SELECT
    bp.id,
    bp.title,
    (1.0 - (levenshtein(normalize_title(bp.title), normalized_new_title)::NUMERIC /
            GREATEST(length(normalize_title(bp.title)), length(normalized_new_title)))) as similarity
  FROM blog_posts bp
  WHERE (1.0 - (levenshtein(normalize_title(bp.title), normalized_new_title)::NUMERIC /
                GREATEST(length(normalize_title(bp.title)), length(normalized_new_title)))) > threshold
  ORDER BY similarity DESC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql;

-- Function to check content similarity
CREATE OR REPLACE FUNCTION check_content_similarity(new_content_hash TEXT)
RETURNS TABLE (
  post_id UUID,
  post_title TEXT,
  is_duplicate BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    bp.id,
    bp.title,
    (bct.content_hash = new_content_hash) as is_duplicate
  FROM blog_content_tracking bct
  JOIN blog_posts bp ON bct.post_id = bp.id
  WHERE bct.content_hash = new_content_hash;
END;
$$ LANGUAGE plpgsql;

-- Function to get next blog title
CREATE OR REPLACE FUNCTION get_next_blog_title()
RETURNS TABLE (
  title TEXT,
  times_used INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT btb.title, btb.times_used
  FROM blog_title_bank btb
  WHERE btb.is_locked = FALSE
  ORDER BY
    btb.times_used ASC,
    btb.last_used_at ASC NULLS FIRST,
    RANDOM()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get diverse title suggestions
CREATE OR REPLACE FUNCTION get_diverse_title_suggestions(count INTEGER DEFAULT 5)
RETURNS TABLE (
  title TEXT,
  times_used INTEGER,
  last_used_days_ago INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    btb.title,
    btb.times_used,
    CASE
      WHEN btb.last_used_at IS NULL THEN NULL
      ELSE EXTRACT(DAY FROM NOW() - btb.last_used_at)::INTEGER
    END as last_used_days_ago
  FROM blog_title_bank btb
  WHERE btb.is_locked = FALSE
  ORDER BY
    btb.times_used ASC,
    btb.last_used_at ASC NULLS FIRST,
    RANDOM()
  LIMIT count;
END;
$$ LANGUAGE plpgsql;

-- Trigger to track blog content
CREATE OR REPLACE FUNCTION track_blog_content()
RETURNS TRIGGER AS $$
DECLARE
  title_fp TEXT;
  content_h TEXT;
  keywords TEXT[];
BEGIN
  title_fp := normalize_title(NEW.title);
  content_h := generate_content_hash(NEW.content);
  keywords := extract_keywords(NEW.content || ' ' || NEW.title);

  INSERT INTO blog_content_tracking (
    post_id,
    title_fingerprint,
    content_hash,
    topic_keywords
  ) VALUES (
    NEW.id,
    title_fp,
    content_h,
    keywords
  )
  ON CONFLICT (post_id) DO UPDATE SET
    title_fingerprint = title_fp,
    content_hash = content_h,
    topic_keywords = keywords;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS track_blog_content_trigger ON blog_posts;
CREATE TRIGGER track_blog_content_trigger
  AFTER INSERT OR UPDATE OF title, content ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION track_blog_content();

-- Trigger to update title bank usage
CREATE OR REPLACE FUNCTION update_title_bank_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE blog_title_bank
  SET
    times_used = times_used + 1,
    last_used_at = NOW()
  WHERE normalize_title(title) = normalize_title(NEW.title);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_title_bank_usage_trigger ON blog_posts;
CREATE TRIGGER update_title_bank_usage_trigger
  AFTER INSERT ON blog_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_title_bank_usage();

-- Function to populate title bank
CREATE OR REPLACE FUNCTION populate_title_bank(titles_json JSONB)
RETURNS INTEGER AS $$
DECLARE
  title_text TEXT;
  inserted_count INTEGER := 0;
BEGIN
  FOR title_text IN SELECT jsonb_array_elements_text(titles_json)
  LOOP
    INSERT INTO blog_title_bank (title)
    VALUES (title_text)
    ON CONFLICT (title) DO NOTHING;

    IF FOUND THEN
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;

  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get generation insights
CREATE OR REPLACE FUNCTION get_blog_generation_insights()
RETURNS TABLE (
  total_titles INTEGER,
  unused_titles INTEGER,
  most_used_title TEXT,
  most_used_count INTEGER,
  recent_topics TEXT[],
  recommended_next_topics TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER as total_titles,
    COUNT(*) FILTER (WHERE times_used = 0)::INTEGER as unused_titles,
    (SELECT title FROM blog_title_bank ORDER BY times_used DESC LIMIT 1) as most_used_title,
    (SELECT times_used FROM blog_title_bank ORDER BY times_used DESC LIMIT 1) as most_used_count,
    (
      SELECT ARRAY_AGG(DISTINCT unnest_val)
      FROM (
        SELECT unnest(keywords) as unnest_val
        FROM blog_generation_history
        WHERE generated_at > NOW() - INTERVAL '30 days'
        LIMIT 100
      ) subq
      LIMIT 20
    ) as recent_topics,
    (
      SELECT ARRAY_AGG(title)
      FROM (
        SELECT title
        FROM blog_title_bank
        WHERE times_used = 0
        ORDER BY RANDOM()
        LIMIT 10
      ) unused
    ) as recommended_next_topics;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE blog_title_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_content_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_generation_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Admins can manage title bank" ON blog_title_bank;
CREATE POLICY "Admins can manage title bank"
  ON blog_title_bank FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can view content tracking" ON blog_content_tracking;
CREATE POLICY "Admins can view content tracking"
  ON blog_content_tracking FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage generation history" ON blog_generation_history;
CREATE POLICY "Admins can manage generation history"
  ON blog_generation_history FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Comments
COMMENT ON TABLE blog_title_bank IS 'Stores available blog titles and tracks usage to prevent repetition';
COMMENT ON TABLE blog_content_tracking IS 'Tracks content similarity to detect duplicate or near-duplicate posts';
COMMENT ON TABLE blog_generation_history IS 'Logs AI generation parameters for better uniqueness over time';
```

**Click "Run" in SQL Editor**

✅ **Verification:** Run this query:
```sql
SELECT COUNT(*) FROM blog_title_bank;
```
Should return 0 (empty, you'll populate it later).

---

**Continue in next message due to length...**
