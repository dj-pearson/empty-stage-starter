-- Add short_form_content and long_form_content to social_posts table
-- This allows storing different versions of content for different platforms

ALTER TABLE social_posts
ADD COLUMN IF NOT EXISTS short_form_content TEXT,
ADD COLUMN IF NOT EXISTS long_form_content TEXT;

-- Add webhook_url to store a global webhook URL for automation
ALTER TABLE social_posts
ADD COLUMN IF NOT EXISTS webhook_url TEXT;

COMMENT ON COLUMN social_posts.short_form_content IS 'Short form content for Twitter/X and similar platforms (under 280 chars)';
COMMENT ON COLUMN social_posts.long_form_content IS 'Long form content for Facebook, LinkedIn and similar platforms';
COMMENT ON COLUMN social_posts.webhook_url IS 'Global webhook URL to send all post data when published';

-- Update social_accounts table to support a single webhook configuration
ALTER TABLE social_accounts
ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN social_accounts.is_global IS 'If true, this is a global webhook that receives all posts regardless of platform';

