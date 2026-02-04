-- Coolify Centralized AI Configuration Migration
-- This migration enables centralized AI model management via Coolify Team Shared Variables

-- Create ai_model_configurations table if it doesn't exist
CREATE TABLE IF NOT EXISTS ai_model_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_display_name TEXT NOT NULL,
  task_type TEXT DEFAULT 'standard' CHECK (task_type IN ('standard', 'lightweight')),
  env_var_model_override TEXT,
  usage_category TEXT CHECK (usage_category IN ('general', 'content_generation', 'analysis', 'chat', 'code')),
  is_active BOOLEAN DEFAULT false,
  speed_rating INTEGER CHECK (speed_rating >= 1 AND speed_rating <= 10),
  quality_rating INTEGER CHECK (quality_rating >= 1 AND quality_rating <= 10),
  cost_rating INTEGER CHECK (cost_rating >= 1 AND cost_rating <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, model_name)
);

-- Add columns if table already exists (for existing installations)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_model_configurations') THEN
    ALTER TABLE ai_model_configurations
    ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'standard' CHECK (task_type IN ('standard', 'lightweight')),
    ADD COLUMN IF NOT EXISTS env_var_model_override TEXT,
    ADD COLUMN IF NOT EXISTS usage_category TEXT CHECK (usage_category IN ('general', 'content_generation', 'analysis', 'chat', 'code'));
  END IF;
END $$;

-- Enable RLS on ai_model_configurations
ALTER TABLE ai_model_configurations ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_model_configurations (root_admin can manage, authenticated users can read)
DROP POLICY IF EXISTS "ai_model_configurations_read" ON ai_model_configurations;
CREATE POLICY "ai_model_configurations_read" ON ai_model_configurations
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ai_model_configurations_root_admin_all" ON ai_model_configurations;
CREATE POLICY "ai_model_configurations_root_admin_all" ON ai_model_configurations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role::text = 'root_admin'
    )
  );

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_ai_model_task_type ON ai_model_configurations(task_type) WHERE is_active = true;

-- Add comment
COMMENT ON COLUMN ai_model_configurations.task_type IS 'Model task type: standard for complex tasks, lightweight for simple/fast tasks';
COMMENT ON COLUMN ai_model_configurations.env_var_model_override IS 'Environment variable name that can override this model selection';
COMMENT ON COLUMN ai_model_configurations.usage_category IS 'Specialized category for automatic model selection';

-- Insert Claude Haiku models for lightweight tasks
INSERT INTO ai_model_configurations (
  provider,
  model_name,
  model_display_name,
  task_type,
  is_active,
  speed_rating,
  quality_rating,
  cost_rating
) VALUES
  ('claude', 'claude-3-5-haiku-20241022', 'Claude 3.5 Haiku', 'lightweight', true, 10, 8, 10),
  ('claude', 'claude-3-haiku-20240307', 'Claude 3 Haiku (Legacy)', 'lightweight', false, 9, 7, 10)
ON CONFLICT (provider, model_name) DO UPDATE SET
  task_type = EXCLUDED.task_type,
  is_active = EXCLUDED.is_active;

-- Update existing models to be 'standard' type if not set
UPDATE ai_model_configurations
SET task_type = 'standard'
WHERE task_type IS NULL;

-- Create table to track Coolify environment variables
CREATE TABLE IF NOT EXISTS ai_environment_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT NOT NULL UNIQUE,
  coolify_variable TEXT NOT NULL,
  description TEXT,
  is_required BOOLEAN DEFAULT false,
  default_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert environment variable mappings
INSERT INTO ai_environment_config (config_key, coolify_variable, description, is_required, default_value) VALUES
  ('AI_DEFAULT_PROVIDER', 'AI_DEFAULT_PROVIDER', 'Primary AI provider (anthropic, openai, gemini)', true, 'anthropic'),
  ('CLAUDE_API_KEY', 'CLAUDE_API_KEY', 'Anthropic Claude API key', true, NULL),
  ('OPENAI_GLOBAL_API', 'OPENAI_GLOBAL_API', 'OpenAI API key (optional)', false, NULL),
  ('DEFAULT_AI_MODEL', 'DEFAULT_AI_MODEL', 'Default model for standard/complex tasks', true, 'claude-sonnet-4-5-20250929'),
  ('LIGHTWEIGHT_AI_MODEL', 'LIGHTWEIGHT_AI_MODEL', 'Default model for lightweight/fast tasks', true, 'claude-3-5-haiku-20241022'),
  ('AI_MAX_RETRIES', 'AI_MAX_RETRIES', 'Maximum retry attempts for failed requests', false, '3'),
  ('AI_TIMEOUT_MS', 'AI_TIMEOUT_MS', 'Request timeout in milliseconds', false, '30000'),
  ('AI_TEMPERATURE', 'AI_TEMPERATURE', 'AI temperature setting (0-1)', false, '0.7'),
  ('AI_ENABLE_CACHING', 'AI_ENABLE_CACHING', 'Enable response caching', false, 'true')
ON CONFLICT (config_key) DO UPDATE SET
  coolify_variable = EXCLUDED.coolify_variable,
  description = EXCLUDED.description,
  is_required = EXCLUDED.is_required,
  default_value = EXCLUDED.default_value,
  updated_at = NOW();

-- Enable RLS
ALTER TABLE ai_environment_config ENABLE ROW LEVEL SECURITY;

-- RLS policies (root_admin only)
DROP POLICY IF EXISTS "ai_environment_config_root_admin_select" ON ai_environment_config;
CREATE POLICY "ai_environment_config_root_admin_select" ON ai_environment_config
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role::text = 'root_admin'
    )
  );

DROP POLICY IF EXISTS "ai_environment_config_root_admin_all" ON ai_environment_config;
CREATE POLICY "ai_environment_config_root_admin_all" ON ai_environment_config
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role::text = 'root_admin'
    )
  );

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_ai_environment_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ai_environment_config_updated_at
  BEFORE UPDATE ON ai_environment_config
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_environment_config_updated_at();

-- Add comments
COMMENT ON TABLE ai_environment_config IS 'Tracks Coolify Team Shared Variables for centralized AI configuration';
COMMENT ON COLUMN ai_environment_config.config_key IS 'Internal configuration key name';
COMMENT ON COLUMN ai_environment_config.coolify_variable IS 'Coolify Team Shared Variable name';
COMMENT ON COLUMN ai_environment_config.is_required IS 'Whether this variable must be set for AI features to work';
COMMENT ON COLUMN ai_environment_config.default_value IS 'Default value if environment variable is not set';
