-- Create social platforms enum
CREATE TYPE social_platform AS ENUM (
  'facebook',
  'instagram',
  'twitter',
  'linkedin',
  'tiktok',
  'pinterest'
);

-- Create post status enum
CREATE TYPE post_status AS ENUM (
  'draft',
  'scheduled',
  'published',
  'failed',
  'deleted'
);

-- Create social accounts table
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform social_platform NOT NULL,
  account_name TEXT NOT NULL,
  account_id TEXT, -- Platform-specific account ID
  webhook_url TEXT, -- Webhook for posting (Zapier, Make, etc.)
  access_token TEXT, -- Encrypted access token if using direct API
  is_active BOOLEAN DEFAULT TRUE,
  last_posted_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, account_name)
);

-- Create social posts table
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  content TEXT NOT NULL,
  platforms social_platform[] NOT NULL, -- Can post to multiple platforms
  status post_status NOT NULL DEFAULT 'draft',
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  image_urls TEXT[],
  video_url TEXT,
  link_url TEXT,
  hashtags TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb, -- Platform-specific data
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create post analytics table
CREATE TABLE IF NOT EXISTS post_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  platform_post_id TEXT, -- ID from the social platform
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  engagement_rate DECIMAL(5,2) DEFAULT 0,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, platform)
);

-- Create post queue table (for scheduled posts)
CREATE TABLE IF NOT EXISTS post_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  platform social_platform NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create webhook logs table
CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
  platform social_platform NOT NULL,
  webhook_url TEXT NOT NULL,
  request_payload JSONB,
  response_status INTEGER,
  response_body TEXT,
  success BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status);
CREATE INDEX IF NOT EXISTS idx_social_posts_scheduled ON social_posts(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_social_posts_created_at ON social_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_analytics_post_id ON post_analytics(post_id);
CREATE INDEX IF NOT EXISTS idx_post_queue_scheduled ON post_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at DESC);

-- Enable RLS
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Social accounts: Only admins can manage
CREATE POLICY "Admins can manage social accounts"
  ON social_accounts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Social posts: Only admins can manage
CREATE POLICY "Admins can manage social posts"
  ON social_posts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Post analytics: Admins only
CREATE POLICY "Admins can view post analytics"
  ON post_analytics FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Post queue: Admins only
CREATE POLICY "Admins can manage post queue"
  ON post_queue FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Webhook logs: Admins only
CREATE POLICY "Admins can view webhook logs"
  ON webhook_logs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Function to update updated_at timestamp
CREATE TRIGGER update_social_accounts_updated_at
  BEFORE UPDATE ON social_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_social_posts_updated_at
  BEFORE UPDATE ON social_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_post_queue_updated_at
  BEFORE UPDATE ON post_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to get post engagement stats
CREATE OR REPLACE FUNCTION get_post_engagement_summary()
RETURNS TABLE (
  total_posts INTEGER,
  scheduled_posts INTEGER,
  published_posts INTEGER,
  total_impressions BIGINT,
  total_engagement BIGINT,
  avg_engagement_rate DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT sp.id)::INTEGER as total_posts,
    COUNT(DISTINCT sp.id) FILTER (WHERE sp.status = 'scheduled')::INTEGER as scheduled_posts,
    COUNT(DISTINCT sp.id) FILTER (WHERE sp.status = 'published')::INTEGER as published_posts,
    COALESCE(SUM(pa.impressions), 0)::BIGINT as total_impressions,
    COALESCE(SUM(pa.likes + pa.comments + pa.shares), 0)::BIGINT as total_engagement,
    COALESCE(AVG(pa.engagement_rate), 0)::DECIMAL as avg_engagement_rate
  FROM social_posts sp
  LEFT JOIN post_analytics pa ON sp.id = pa.post_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to schedule post to queue
CREATE OR REPLACE FUNCTION schedule_post_to_queue(
  _post_id UUID,
  _platforms social_platform[]
)
RETURNS VOID AS $$
DECLARE
  _platform social_platform;
  _scheduled_time TIMESTAMPTZ;
BEGIN
  -- Get scheduled time from post
  SELECT scheduled_for INTO _scheduled_time
  FROM social_posts
  WHERE id = _post_id;

  -- Create queue entries for each platform
  FOREACH _platform IN ARRAY _platforms
  LOOP
    INSERT INTO post_queue (post_id, platform, scheduled_for, status)
    VALUES (_post_id, _platform, _scheduled_time, 'pending')
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default social accounts (examples)
INSERT INTO social_accounts (platform, account_name, is_active)
VALUES
  ('facebook', 'EatPal Official', false),
  ('instagram', '@eatpal', false),
  ('twitter', '@eatpal_app', false),
  ('linkedin', 'EatPal Company Page', false)
ON CONFLICT DO NOTHING;
