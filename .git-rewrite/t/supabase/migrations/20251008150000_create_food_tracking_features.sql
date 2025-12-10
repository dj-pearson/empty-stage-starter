-- ============================================================================
-- FOOD CHAINING ALGORITHM & SUCCESS TRACKING
-- ============================================================================

-- Create food properties table for chaining algorithm
CREATE TABLE IF NOT EXISTS food_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id UUID REFERENCES foods(id) ON DELETE CASCADE,
  -- Texture properties
  texture_primary TEXT, -- crunchy, soft, chewy, smooth, crispy, creamy, etc.
  texture_secondary TEXT,
  texture_score INTEGER DEFAULT 50, -- 0-100 (0=very soft, 100=very crunchy)
  -- Flavor properties
  flavor_profile TEXT[], -- sweet, savory, salty, sour, bitter, umami
  flavor_intensity INTEGER DEFAULT 50, -- 0-100 (0=very mild, 100=very strong)
  spice_level INTEGER DEFAULT 0, -- 0-10
  -- Visual properties
  color_primary TEXT,
  color_secondary TEXT,
  visual_complexity TEXT, -- simple, moderate, complex (mixed colors/shapes)
  -- Temperature properties
  typical_temperature TEXT, -- hot, warm, room_temp, cold, frozen
  -- Other sensory
  smell_intensity INTEGER DEFAULT 50, -- 0-100
  requires_chewing BOOLEAN DEFAULT TRUE,
  messy_factor INTEGER DEFAULT 50, -- 0-100 (how messy to eat)
  -- Nutritional category
  food_category TEXT, -- protein, vegetable, fruit, grain, dairy, snack
  protein_source BOOLEAN DEFAULT FALSE,
  vegetable_source BOOLEAN DEFAULT FALSE,
  -- Additional metadata
  common_brands TEXT[], -- ["Brand A", "Brand B"]
  similar_foods TEXT[], -- Manual override for similar foods
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create food attempts/success tracking table
CREATE TABLE IF NOT EXISTS food_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  food_id UUID REFERENCES foods(id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ DEFAULT NOW(),
  -- Attempt stage (for structured exposure)
  stage TEXT DEFAULT 'full_bite', -- looking, touching, smelling, licking, tiny_taste, small_bite, full_bite, full_portion
  -- Outcome
  outcome TEXT NOT NULL, -- success, partial, refused, tantrum
  bites_taken INTEGER DEFAULT 0,
  amount_consumed TEXT, -- none, quarter, half, most, all
  -- Context
  meal_slot TEXT, -- breakfast, lunch, dinner, snack
  preparation_method TEXT, -- raw, steamed, baked, fried, etc.
  presentation_notes TEXT,
  -- Child response
  mood_before TEXT, -- happy, neutral, anxious, resistant
  mood_after TEXT,
  reaction_notes TEXT,
  -- Parent notes
  parent_notes TEXT,
  strategies_used TEXT[], -- ["positive_reinforcement", "modeling", "play", "hunger"]
  -- Photos
  photo_urls TEXT[],
  -- Success metrics
  is_milestone BOOLEAN DEFAULT FALSE, -- Mark significant breakthroughs
  celebration_unlocked TEXT, -- Badge or reward earned
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create food chain suggestions cache (for performance)
CREATE TABLE IF NOT EXISTS food_chain_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_food_id UUID REFERENCES foods(id) ON DELETE CASCADE,
  target_food_id UUID REFERENCES foods(id) ON DELETE CASCADE,
  similarity_score DECIMAL(5,2) DEFAULT 0, -- 0-100
  chain_reason TEXT[], -- ["similar_texture", "similar_flavor", "same_category"]
  recommended_order INTEGER DEFAULT 1, -- Order to try in chain
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_food_id, target_food_id)
);

-- ============================================================================
-- AI MEAL COACH
-- ============================================================================

-- Create conversation history for AI coach
CREATE TABLE IF NOT EXISTS ai_coach_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kid_id UUID REFERENCES kids(id) ON DELETE SET NULL,
  conversation_title TEXT, -- Auto-generated from first message
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_archived BOOLEAN DEFAULT FALSE
);

-- Create individual messages
CREATE TABLE IF NOT EXISTS ai_coach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES ai_coach_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- user, assistant, system
  content TEXT NOT NULL,
  -- Context at time of message (for better responses)
  context_snapshot JSONB, -- Snapshot of kid's safe foods, allergens, recent meals
  -- AI metadata
  model_used TEXT,
  tokens_used INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- VISUAL MEAL BUILDER
-- ============================================================================

-- Create saved kid meal creations
CREATE TABLE IF NOT EXISTS kid_meal_creations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  creation_name TEXT NOT NULL,
  creation_type TEXT DEFAULT 'plate', -- plate, face, shape, custom
  -- Meal composition
  foods JSONB NOT NULL, -- [{"food_id": "uuid", "position": {"x": 10, "y": 20}, "size": "medium", "section": "main"}]
  plate_template TEXT DEFAULT 'standard', -- standard, divided, bento, etc.
  -- Visual data
  thumbnail_url TEXT,
  screenshot_data TEXT, -- Base64 or URL
  -- Engagement
  kid_approved BOOLEAN DEFAULT TRUE,
  times_requested INTEGER DEFAULT 0,
  last_requested_at TIMESTAMPTZ,
  -- Rewards/Gamification
  stars_earned INTEGER DEFAULT 0,
  badges_earned TEXT[],
  -- Sharing
  is_shared_with_family BOOLEAN DEFAULT FALSE,
  shared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create meal builder badges/achievements
CREATE TABLE IF NOT EXISTS kid_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid_id UUID REFERENCES kids(id) ON DELETE CASCADE,
  achievement_type TEXT NOT NULL, -- tried_new_food, completed_week, ate_vegetable, etc.
  achievement_name TEXT NOT NULL,
  achievement_description TEXT,
  icon_name TEXT,
  color TEXT DEFAULT 'primary',
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  points_value INTEGER DEFAULT 10,
  -- What triggered it
  triggered_by_food_id UUID REFERENCES foods(id) ON DELETE SET NULL,
  triggered_by_creation_id UUID REFERENCES kid_meal_creations(id) ON DELETE SET NULL
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_food_properties_food ON food_properties(food_id);
CREATE INDEX IF NOT EXISTS idx_food_properties_texture ON food_properties(texture_primary);
CREATE INDEX IF NOT EXISTS idx_food_properties_category ON food_properties(food_category);

CREATE INDEX IF NOT EXISTS idx_food_attempts_kid ON food_attempts(kid_id);
CREATE INDEX IF NOT EXISTS idx_food_attempts_food ON food_attempts(food_id);
CREATE INDEX IF NOT EXISTS idx_food_attempts_date ON food_attempts(attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_food_attempts_outcome ON food_attempts(outcome);
CREATE INDEX IF NOT EXISTS idx_food_attempts_stage ON food_attempts(stage);

CREATE INDEX IF NOT EXISTS idx_food_chain_source ON food_chain_suggestions(source_food_id);
CREATE INDEX IF NOT EXISTS idx_food_chain_score ON food_chain_suggestions(similarity_score DESC);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_coach_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_kid ON ai_coach_conversations(kid_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_date ON ai_coach_conversations(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_coach_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_date ON ai_coach_messages(created_at ASC);

CREATE INDEX IF NOT EXISTS idx_kid_creations_kid ON kid_meal_creations(kid_id);
CREATE INDEX IF NOT EXISTS idx_kid_creations_requested ON kid_meal_creations(times_requested DESC);

CREATE INDEX IF NOT EXISTS idx_kid_achievements_kid ON kid_achievements(kid_id);
CREATE INDEX IF NOT EXISTS idx_kid_achievements_date ON kid_achievements(earned_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE food_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_chain_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_coach_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_coach_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE kid_meal_creations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kid_achievements ENABLE ROW LEVEL SECURITY;

-- Food properties: Everyone can read, admins can write
CREATE POLICY "Anyone can view food properties"
  ON food_properties FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage food properties"
  ON food_properties FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Food attempts: Users can manage their own kids' attempts
CREATE POLICY "Users can manage their kids' food attempts"
  ON food_attempts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM kids
      WHERE kids.id = food_attempts.kid_id
      AND kids.user_id = auth.uid()
    )
  );

-- Food chain suggestions: Everyone can read
CREATE POLICY "Anyone can view food chain suggestions"
  ON food_chain_suggestions FOR SELECT
  USING (true);

-- AI conversations: Users can manage their own conversations
CREATE POLICY "Users can manage their own conversations"
  ON ai_coach_conversations FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own messages"
  ON ai_coach_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM ai_coach_conversations
      WHERE ai_coach_conversations.id = ai_coach_messages.conversation_id
      AND ai_coach_conversations.user_id = auth.uid()
    )
  );

-- Kid meal creations: Users can manage their own kids' creations
CREATE POLICY "Users can manage their kids' meal creations"
  ON kid_meal_creations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM kids
      WHERE kids.id = kid_meal_creations.kid_id
      AND kids.user_id = auth.uid()
    )
  );

-- Kid achievements: Users can view and insert for their kids
CREATE POLICY "Users can manage their kids' achievements"
  ON kid_achievements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM kids
      WHERE kids.id = kid_achievements.kid_id
      AND kids.user_id = auth.uid()
    )
  );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_food_properties_updated_at
  BEFORE UPDATE ON food_properties
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_conversations_updated_at
  BEFORE UPDATE ON ai_coach_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate food chain similarity score
CREATE OR REPLACE FUNCTION calculate_food_similarity(
  food1_id UUID,
  food2_id UUID
)
RETURNS DECIMAL AS $$
DECLARE
  score DECIMAL := 0;
  props1 RECORD;
  props2 RECORD;
BEGIN
  -- Get properties for both foods
  SELECT * INTO props1 FROM food_properties WHERE food_id = food1_id;
  SELECT * INTO props2 FROM food_properties WHERE food_id = food2_id;

  IF props1 IS NULL OR props2 IS NULL THEN
    RETURN 0;
  END IF;

  -- Texture similarity (40% weight)
  IF props1.texture_primary = props2.texture_primary THEN
    score := score + 40;
  ELSIF props1.texture_secondary = props2.texture_primary OR props1.texture_primary = props2.texture_secondary THEN
    score := score + 20;
  END IF;

  -- Category similarity (30% weight)
  IF props1.food_category = props2.food_category THEN
    score := score + 30;
  END IF;

  -- Flavor similarity (20% weight)
  IF props1.flavor_profile && props2.flavor_profile THEN -- Array overlap
    score := score + 20;
  END IF;

  -- Temperature similarity (10% weight)
  IF props1.typical_temperature = props2.typical_temperature THEN
    score := score + 10;
  END IF;

  RETURN score;
END;
$$ LANGUAGE plpgsql;

-- Function to get food chain suggestions
CREATE OR REPLACE FUNCTION get_food_chain_suggestions(
  source_food UUID,
  limit_count INTEGER DEFAULT 5
)
RETURNS TABLE (
  food_id UUID,
  food_name TEXT,
  similarity_score DECIMAL,
  reasons TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.name,
    fcs.similarity_score,
    fcs.chain_reason
  FROM food_chain_suggestions fcs
  JOIN foods f ON f.id = fcs.target_food_id
  WHERE fcs.source_food_id = source_food
  ORDER BY fcs.similarity_score DESC, fcs.recommended_order ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Function to track achievement unlock
CREATE OR REPLACE FUNCTION check_and_unlock_achievements(
  p_kid_id UUID,
  p_food_id UUID DEFAULT NULL,
  p_attempt_outcome TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  total_attempts INTEGER;
  successful_attempts INTEGER;
  new_foods_tried INTEGER;
BEGIN
  -- Count attempts
  SELECT COUNT(*) INTO total_attempts FROM food_attempts WHERE kid_id = p_kid_id;
  SELECT COUNT(*) INTO successful_attempts FROM food_attempts WHERE kid_id = p_kid_id AND outcome IN ('success', 'partial');
  SELECT COUNT(DISTINCT food_id) INTO new_foods_tried FROM food_attempts WHERE kid_id = p_kid_id AND outcome IN ('success', 'partial');

  -- First attempt achievement
  IF total_attempts = 1 THEN
    INSERT INTO kid_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_value)
    VALUES (p_kid_id, 'first_attempt', 'Brave Beginner', 'Made your first food attempt!', 'star', 10)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 10 foods tried achievement
  IF new_foods_tried = 10 THEN
    INSERT INTO kid_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_value)
    VALUES (p_kid_id, 'foods_milestone', 'Food Explorer', 'Tried 10 different foods!', 'trophy', 50)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 50 foods tried achievement
  IF new_foods_tried = 50 THEN
    INSERT INTO kid_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_value)
    VALUES (p_kid_id, 'foods_milestone', 'Adventurous Eater', 'Tried 50 different foods!', 'medal', 100)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Success rate achievements
  IF total_attempts >= 20 AND successful_attempts::DECIMAL / total_attempts >= 0.75 THEN
    INSERT INTO kid_achievements (kid_id, achievement_type, achievement_name, achievement_description, icon_name, points_value)
    VALUES (p_kid_id, 'success_rate', 'Super Taster', '75% success rate!', 'crown', 75)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-check achievements after food attempt
CREATE OR REPLACE FUNCTION trigger_achievement_check()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM check_and_unlock_achievements(NEW.kid_id, NEW.food_id, NEW.outcome);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_food_attempt_insert
  AFTER INSERT ON food_attempts
  FOR EACH ROW
  EXECUTE FUNCTION trigger_achievement_check();

-- ============================================================================
-- SEED DATA - Default food properties
-- ============================================================================

-- This will be populated as users add foods, but we can seed common ones
-- Example insertions (can be expanded based on existing foods)
INSERT INTO food_properties (food_id, texture_primary, texture_secondary, texture_score, flavor_profile, flavor_intensity, food_category, typical_temperature)
SELECT
  id,
  CASE
    WHEN name ILIKE '%nugget%' OR name ILIKE '%chip%' OR name ILIKE '%cracker%' THEN 'crunchy'
    WHEN name ILIKE '%yogurt%' OR name ILIKE '%pudding%' OR name ILIKE '%applesauce%' THEN 'smooth'
    WHEN name ILIKE '%pasta%' OR name ILIKE '%noodle%' THEN 'soft'
    WHEN name ILIKE '%bread%' OR name ILIKE '%toast%' THEN 'chewy'
    WHEN name ILIKE '%cheese%' THEN 'creamy'
    ELSE 'soft'
  END,
  NULL,
  CASE
    WHEN name ILIKE '%nugget%' OR name ILIKE '%chip%' OR name ILIKE '%cracker%' THEN 75
    WHEN name ILIKE '%yogurt%' OR name ILIKE '%pudding%' THEN 10
    ELSE 50
  END,
  CASE
    WHEN name ILIKE '%sweet%' OR name ILIKE '%fruit%' OR name ILIKE '%apple%' THEN ARRAY['sweet']
    WHEN name ILIKE '%cheese%' OR name ILIKE '%meat%' OR name ILIKE '%chicken%' THEN ARRAY['savory']
    ELSE ARRAY['savory']
  END,
  50,
  CASE
    WHEN name ILIKE '%chicken%' OR name ILIKE '%meat%' OR name ILIKE '%beef%' OR name ILIKE '%nugget%' THEN 'protein'
    WHEN name ILIKE '%carrot%' OR name ILIKE '%broccoli%' OR name ILIKE '%vegetable%' THEN 'vegetable'
    WHEN name ILIKE '%apple%' OR name ILIKE '%banana%' OR name ILIKE '%fruit%' THEN 'fruit'
    WHEN name ILIKE '%bread%' OR name ILIKE '%pasta%' OR name ILIKE '%rice%' THEN 'grain'
    WHEN name ILIKE '%cheese%' OR name ILIKE '%yogurt%' OR name ILIKE '%milk%' THEN 'dairy'
    ELSE 'snack'
  END,
  'warm'
FROM foods
WHERE NOT EXISTS (
  SELECT 1 FROM food_properties WHERE food_properties.food_id = foods.id
);

-- ============================================================================
-- VIEWS FOR EASY QUERYING
-- ============================================================================

-- View for kid's food success rate
CREATE OR REPLACE VIEW kid_food_success_stats AS
SELECT
  k.id as kid_id,
  k.name as kid_name,
  f.id as food_id,
  f.name as food_name,
  COUNT(*) as total_attempts,
  COUNT(*) FILTER (WHERE fa.outcome = 'success') as successful_attempts,
  COUNT(*) FILTER (WHERE fa.outcome = 'partial') as partial_attempts,
  COUNT(*) FILTER (WHERE fa.outcome = 'refused') as refused_attempts,
  MAX(fa.attempted_at) as last_attempted,
  ROUND(COUNT(*) FILTER (WHERE fa.outcome IN ('success', 'partial'))::DECIMAL / COUNT(*) * 100, 2) as success_rate
FROM kids k
CROSS JOIN foods f
LEFT JOIN food_attempts fa ON fa.kid_id = k.id AND fa.food_id = f.id
GROUP BY k.id, k.name, f.id, f.name;
