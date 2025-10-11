-- ============================================================================
-- AUTOMATED BACKUP SYSTEM
-- ============================================================================
-- Daily automated backups with compression and retention management

-- ============================================================================
-- BACKUP LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  backup_type TEXT NOT NULL, -- 'daily', 'weekly', 'manual', 'export'
  status TEXT NOT NULL, -- 'pending', 'in_progress', 'completed', 'failed'
  file_path TEXT,
  file_size_bytes BIGINT,
  compressed_size_bytes BIGINT,
  compression_ratio DECIMAL(5,2),
  records_count JSONB, -- { "foods": 100, "recipes": 50, "plan_entries": 200, ... }
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  retention_days INTEGER DEFAULT 30,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_backup_logs_user_date ON backup_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_logs_status ON backup_logs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_logs_expires ON backup_logs(expires_at) WHERE status = 'completed';

-- Enable RLS
ALTER TABLE backup_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own backup logs"
  ON backup_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can manage backup logs"
  ON backup_logs FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- BACKUP CONFIGURATION TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS backup_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  frequency TEXT DEFAULT 'daily', -- 'daily', 'weekly', 'monthly'
  retention_days INTEGER DEFAULT 30,
  include_images BOOLEAN DEFAULT false, -- Whether to backup profile pictures
  auto_cleanup BOOLEAN DEFAULT true,
  last_backup_at TIMESTAMPTZ,
  next_backup_at TIMESTAMPTZ,
  email_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE backup_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own backup config"
  ON backup_config FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- BACKUP DATA EXTRACTION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION extract_user_backup_data(
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_backup JSONB;
  v_kids_data JSONB;
  v_foods_data JSONB;
  v_recipes_data JSONB;
  v_plan_entries_data JSONB;
  v_food_attempts_data JSONB;
  v_grocery_data JSONB;
  v_meal_creations_data JSONB;
  v_achievements_data JSONB;
  v_ai_conversations_data JSONB;
  v_profile_data JSONB;
BEGIN
  -- Extract profile
  SELECT jsonb_build_object(
    'id', p.id,
    'email', u.email,
    'full_name', p.full_name,
    'created_at', p.created_at
  ) INTO v_profile_data
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id = p_user_id;

  -- Extract kids
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', k.id,
      'name', k.name,
      'age', k.age,
      'date_of_birth', k.date_of_birth,
      'allergens', k.allergens,
      'pickiness_level', k.pickiness_level,
      'favorite_foods', k.favorite_foods,
      'texture_preferences', k.texture_preferences,
      'texture_dislikes', k.texture_dislikes,
      'flavor_preferences', k.flavor_preferences,
      'dietary_restrictions', k.dietary_restrictions,
      'created_at', k.created_at
    )
  ) INTO v_kids_data
  FROM kids k
  WHERE k.user_id = p_user_id;

  -- Extract foods
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', f.id,
      'name', f.name,
      'category', f.category,
      'is_safe', f.is_safe,
      'is_try_bite', f.is_try_bite,
      'allergens', f.allergens,
      'aisle', f.aisle,
      'quantity', f.quantity,
      'unit', f.unit,
      'created_at', f.created_at
    )
  ) INTO v_foods_data
  FROM foods f
  WHERE f.user_id = p_user_id;

  -- Extract recipes
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'description', r.description,
      'food_ids', r.food_ids,
      'category', r.category,
      'instructions', r.instructions,
      'prep_time', r.prep_time,
      'cook_time', r.cook_time,
      'servings', r.servings,
      'created_at', r.created_at
    )
  ) INTO v_recipes_data
  FROM recipes r
  WHERE r.user_id = p_user_id;

  -- Extract plan entries (last 90 days)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pe.id,
      'kid_id', pe.kid_id,
      'date', pe.date,
      'meal_slot', pe.meal_slot,
      'food_id', pe.food_id,
      'recipe_id', pe.recipe_id,
      'result', pe.result,
      'notes', pe.notes,
      'created_at', pe.created_at
    )
  ) INTO v_plan_entries_data
  FROM plan_entries pe
  WHERE pe.user_id = p_user_id
    AND pe.date >= CURRENT_DATE - INTERVAL '90 days';

  -- Extract food attempts (last 90 days)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', fa.id,
      'kid_id', fa.kid_id,
      'food_id', fa.food_id,
      'attempted_at', fa.attempted_at,
      'stage', fa.stage,
      'outcome', fa.outcome,
      'bites_taken', fa.bites_taken,
      'amount_consumed', fa.amount_consumed,
      'mood_before', fa.mood_before,
      'mood_after', fa.mood_after,
      'parent_notes', fa.parent_notes,
      'is_milestone', fa.is_milestone
    )
  ) INTO v_food_attempts_data
  FROM food_attempts fa
  WHERE fa.user_id = p_user_id
    AND fa.attempted_at >= NOW() - INTERVAL '90 days';

  -- Extract grocery items
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', gi.id,
      'name', gi.name,
      'quantity', gi.quantity,
      'unit', gi.unit,
      'category', gi.category,
      'aisle', gi.aisle,
      'checked', gi.checked,
      'priority', gi.priority,
      'created_at', gi.created_at
    )
  ) INTO v_grocery_data
  FROM grocery_items gi
  WHERE gi.user_id = p_user_id
    AND gi.checked = false;

  -- Extract meal creations
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', kmc.id,
      'kid_id', kmc.kid_id,
      'name', kmc.name,
      'description', kmc.description,
      'food_ids', kmc.food_ids,
      'times_requested', kmc.times_requested,
      'kid_approved', kmc.kid_approved,
      'created_at', kmc.created_at
    )
  ) INTO v_meal_creations_data
  FROM kid_meal_creations kmc
  JOIN kids k ON k.id = kmc.kid_id
  WHERE k.user_id = p_user_id;

  -- Extract achievements
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ka.id,
      'kid_id', ka.kid_id,
      'achievement_type', ka.achievement_type,
      'title', ka.title,
      'description', ka.description,
      'earned_at', ka.earned_at
    )
  ) INTO v_achievements_data
  FROM kid_achievements ka
  JOIN kids k ON k.id = ka.kid_id
  WHERE k.user_id = p_user_id;

  -- Extract AI conversations (last 30 days, without full message history)
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ac.id,
      'title', ac.title,
      'message_count', (
        SELECT COUNT(*) FROM ai_coach_messages acm WHERE acm.conversation_id = ac.id
      ),
      'created_at', ac.created_at,
      'updated_at', ac.updated_at
    )
  ) INTO v_ai_conversations_data
  FROM ai_coach_conversations ac
  WHERE ac.user_id = p_user_id
    AND ac.updated_at >= NOW() - INTERVAL '30 days';

  -- Build final backup structure
  v_backup := jsonb_build_object(
    'version', '1.0',
    'backup_date', NOW(),
    'profile', v_profile_data,
    'kids', COALESCE(v_kids_data, '[]'::jsonb),
    'foods', COALESCE(v_foods_data, '[]'::jsonb),
    'recipes', COALESCE(v_recipes_data, '[]'::jsonb),
    'plan_entries', COALESCE(v_plan_entries_data, '[]'::jsonb),
    'food_attempts', COALESCE(v_food_attempts_data, '[]'::jsonb),
    'grocery_items', COALESCE(v_grocery_data, '[]'::jsonb),
    'meal_creations', COALESCE(v_meal_creations_data, '[]'::jsonb),
    'achievements', COALESCE(v_achievements_data, '[]'::jsonb),
    'ai_conversations', COALESCE(v_ai_conversations_data, '[]'::jsonb),
    'record_counts', jsonb_build_object(
      'kids', COALESCE(jsonb_array_length(v_kids_data), 0),
      'foods', COALESCE(jsonb_array_length(v_foods_data), 0),
      'recipes', COALESCE(jsonb_array_length(v_recipes_data), 0),
      'plan_entries', COALESCE(jsonb_array_length(v_plan_entries_data), 0),
      'food_attempts', COALESCE(jsonb_array_length(v_food_attempts_data), 0),
      'grocery_items', COALESCE(jsonb_array_length(v_grocery_data), 0),
      'meal_creations', COALESCE(jsonb_array_length(v_meal_creations_data), 0),
      'achievements', COALESCE(jsonb_array_length(v_achievements_data), 0),
      'ai_conversations', COALESCE(jsonb_array_length(v_ai_conversations_data), 0)
    )
  );

  RETURN v_backup;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- BACKUP CLEANUP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_backups()
RETURNS TABLE(
  deleted_count INTEGER,
  freed_bytes BIGINT
) AS $$
DECLARE
  v_deleted_count INTEGER;
  v_freed_bytes BIGINT;
BEGIN
  -- Calculate space freed
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM(file_size_bytes), 0)
  INTO v_deleted_count, v_freed_bytes
  FROM backup_logs
  WHERE expires_at < NOW()
    AND status = 'completed';

  -- Delete expired backups
  DELETE FROM backup_logs
  WHERE expires_at < NOW()
    AND status = 'completed';

  RETURN QUERY SELECT v_deleted_count, v_freed_bytes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- SCHEDULE NEXT BACKUP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION schedule_next_backup()
RETURNS INTEGER AS $$
DECLARE
  v_scheduled_count INTEGER := 0;
  v_user RECORD;
BEGIN
  -- For each user with backups enabled
  FOR v_user IN
    SELECT user_id, frequency, retention_days
    FROM backup_config
    WHERE enabled = true
      AND (next_backup_at IS NULL OR next_backup_at <= NOW())
  LOOP
    -- Create backup log entry
    INSERT INTO backup_logs (
      user_id,
      backup_type,
      status,
      retention_days,
      expires_at
    ) VALUES (
      v_user.user_id,
      v_user.frequency,
      'pending',
      v_user.retention_days,
      NOW() + (v_user.retention_days || ' days')::INTERVAL
    );

    -- Update next backup time
    UPDATE backup_config
    SET
      next_backup_at = CASE v_user.frequency
        WHEN 'daily' THEN NOW() + INTERVAL '1 day'
        WHEN 'weekly' THEN NOW() + INTERVAL '7 days'
        WHEN 'monthly' THEN NOW() + INTERVAL '30 days'
        ELSE NOW() + INTERVAL '1 day'
      END,
      updated_at = NOW()
    WHERE user_id = v_user.user_id;

    v_scheduled_count := v_scheduled_count + 1;
  END LOOP;

  RETURN v_scheduled_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- BACKUP STATISTICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW backup_statistics AS
SELECT
  bl.user_id,
  COUNT(*) as total_backups,
  COUNT(*) FILTER (WHERE bl.status = 'completed') as successful_backups,
  COUNT(*) FILTER (WHERE bl.status = 'failed') as failed_backups,
  MAX(bl.completed_at) as last_successful_backup,
  SUM(bl.file_size_bytes) FILTER (WHERE bl.status = 'completed') as total_size_bytes,
  AVG(bl.compression_ratio) FILTER (WHERE bl.status = 'completed') as avg_compression_ratio,
  AVG(EXTRACT(EPOCH FROM (bl.completed_at - bl.started_at))) FILTER (WHERE bl.status = 'completed') as avg_duration_seconds
FROM backup_logs bl
JOIN profiles p ON p.id = bl.user_id
GROUP BY bl.user_id;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_backup_logs_updated_at
  BEFORE UPDATE ON backup_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_backup_config_updated_at
  BEFORE UPDATE ON backup_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIALIZE DEFAULT BACKUP CONFIGS FOR EXISTING USERS
-- ============================================================================

INSERT INTO backup_config (user_id, next_backup_at)
SELECT id, NOW() + INTERVAL '1 day'
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE backup_logs IS 'Tracks backup operations for users';
COMMENT ON TABLE backup_config IS 'User backup preferences and scheduling';
COMMENT ON FUNCTION extract_user_backup_data IS 'Extracts all user data in JSON format for backup';
COMMENT ON FUNCTION cleanup_expired_backups IS 'Removes expired backup records';
COMMENT ON FUNCTION schedule_next_backup IS 'Creates pending backup jobs for users';
COMMENT ON VIEW backup_statistics IS 'Aggregated backup statistics per user';
