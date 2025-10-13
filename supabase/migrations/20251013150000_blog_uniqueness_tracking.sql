-- Blog Title Bank and Uniqueness Tracking System
-- This migration adds comprehensive duplicate prevention and title management

-- Table to store available blog titles from Blog_Titles.md
CREATE TABLE IF NOT EXISTS blog_title_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL UNIQUE,
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  variations_generated INTEGER DEFAULT 0,
  is_locked BOOLEAN DEFAULT FALSE, -- prevent use if needed
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table to track content similarity and prevent duplicates
CREATE TABLE IF NOT EXISTS blog_content_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES blog_posts(id) ON DELETE CASCADE,
  title_fingerprint TEXT NOT NULL, -- normalized title for comparison
  content_hash TEXT NOT NULL, -- hash of core content
  topic_keywords TEXT[], -- extracted keywords
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table to track AI generation history for better uniqueness
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

-- Function to normalize title for comparison
CREATE OR REPLACE FUNCTION normalize_title(title_text TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Remove punctuation, convert to lowercase, remove extra spaces
  RETURN lower(regexp_replace(regexp_replace(title_text, '[^a-zA-Z0-9\s]', '', 'g'), '\s+', ' ', 'g'));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to generate content hash
CREATE OR REPLACE FUNCTION generate_content_hash(content_text TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Create a hash of the first 1000 characters (core content)
  RETURN md5(substring(regexp_replace(content_text, '\s+', '', 'g'), 1, 1000));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to extract keywords from text
CREATE OR REPLACE FUNCTION extract_keywords(text_content TEXT)
RETURNS TEXT[] AS $$
DECLARE
  words TEXT[];
  cleaned_text TEXT;
BEGIN
  -- Basic keyword extraction (could be enhanced with NLP)
  cleaned_text := lower(regexp_replace(text_content, '[^a-zA-Z\s]', ' ', 'g'));
  words := regexp_split_to_array(cleaned_text, '\s+');
  
  -- Return unique words longer than 4 characters (simple keyword filter)
  RETURN ARRAY(
    SELECT DISTINCT word 
    FROM unnest(words) AS word 
    WHERE length(word) > 4 
    ORDER BY word
    LIMIT 50
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to check if title is too similar to existing posts
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

-- Function to get unused or least-used title from bank
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

-- Trigger to automatically track blog post content on insert/update
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
  
  -- Insert or update content tracking
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

-- Trigger to update title bank when post is created
CREATE OR REPLACE FUNCTION update_title_bank_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- Update title bank if this title exists there
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

-- Function to populate title bank from JSON array
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

-- Function to get blog generation insights
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

-- RLS Policies for title bank
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

DROP POLICY IF EXISTS "Admins can view title bank" ON blog_title_bank;
CREATE POLICY "Admins can view title bank"
  ON blog_title_bank FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- RLS Policies for content tracking
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

-- RLS Policies for generation history
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

-- Add comment explaining the system
COMMENT ON TABLE blog_title_bank IS 'Stores available blog titles and tracks usage to prevent repetition';
COMMENT ON TABLE blog_content_tracking IS 'Tracks content similarity to detect duplicate or near-duplicate posts';
COMMENT ON TABLE blog_generation_history IS 'Logs AI generation parameters for better uniqueness over time';
COMMENT ON FUNCTION get_next_blog_title IS 'Returns the least-used or unused title for next blog generation';
COMMENT ON FUNCTION check_title_similarity IS 'Checks if a proposed title is too similar to existing posts';
COMMENT ON FUNCTION get_blog_generation_insights IS 'Provides insights on blog generation patterns and suggestions';

