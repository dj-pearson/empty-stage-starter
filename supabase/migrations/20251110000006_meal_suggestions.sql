-- Quick Meal Suggestions Feature
-- AI-powered personalized meal recommendations based on household preferences,
-- past votes, available ingredients, and contextual factors

-- Meal suggestions generated for households
CREATE TABLE IF NOT EXISTS meal_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- Suggestion context
  suggested_for_date DATE,
  meal_slot TEXT CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner', 'snack1', 'snack2', 'try_bite')),

  -- Suggested recipe
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,

  -- AI reasoning and metadata
  reasoning TEXT, -- Why this was suggested
  confidence_score DECIMAL(5,2), -- 0-100 how confident the AI is
  match_factors JSONB, -- Factors that influenced the suggestion

  -- Personalization data used
  based_on_votes BOOLEAN DEFAULT false,
  based_on_pantry BOOLEAN DEFAULT false,
  based_on_season BOOLEAN DEFAULT false,
  based_on_preferences BOOLEAN DEFAULT false,
  based_on_variety BOOLEAN DEFAULT false,

  -- Suggestion attributes
  estimated_prep_time INTEGER, -- Minutes
  estimated_cook_time INTEGER,
  difficulty TEXT CHECK (difficulty IN ('easy', 'medium', 'hard')),
  predicted_kid_approval INTEGER, -- 0-100 predicted approval

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'skipped', 'planned')),
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,

  -- Feedback
  feedback_rating INTEGER CHECK (feedback_rating BETWEEN 1 AND 5),
  feedback_text TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days' -- Suggestions expire after 1 week
);

-- User feedback on suggestions (helps improve future recommendations)
CREATE TABLE IF NOT EXISTS suggestion_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  suggestion_id UUID REFERENCES meal_suggestions(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Feedback type
  feedback_type TEXT NOT NULL CHECK (feedback_type IN (
    'thumbs_up',
    'thumbs_down',
    'not_interested',
    'already_planned',
    'missing_ingredients',
    'too_complex',
    'not_kid_friendly',
    'perfect'
  )),

  feedback_text TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- User preferences for meal suggestions
CREATE TABLE IF NOT EXISTS suggestion_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,

  -- Dietary preferences
  dietary_restrictions JSONB DEFAULT '[]', -- ['vegetarian', 'gluten_free', 'dairy_free', 'nut_free']
  allergens JSONB DEFAULT '[]', -- Specific allergens to avoid

  -- Time constraints
  max_prep_time INTEGER, -- Minutes
  max_cook_time INTEGER,
  prefer_quick_meals BOOLEAN DEFAULT false,

  -- Complexity preferences
  preferred_difficulty TEXT[] DEFAULT ARRAY['easy', 'medium'],
  avoid_difficult_recipes BOOLEAN DEFAULT true,

  -- Variety preferences
  avoid_recent_recipes BOOLEAN DEFAULT true, -- Don't suggest recently used
  recent_recipe_window_days INTEGER DEFAULT 14, -- How many days to look back
  prefer_new_recipes BOOLEAN DEFAULT true,

  -- Kid-focused
  prioritize_kid_favorites BOOLEAN DEFAULT true, -- Use voting data
  min_kid_approval INTEGER DEFAULT 70, -- Only suggest meals with >70% approval

  -- Ingredient-based
  use_pantry_items BOOLEAN DEFAULT true, -- Prioritize available ingredients
  allow_missing_ingredients BOOLEAN DEFAULT true,
  max_missing_ingredients INTEGER DEFAULT 3,

  -- Seasonal
  prefer_seasonal BOOLEAN DEFAULT true,
  current_season TEXT, -- 'spring', 'summer', 'fall', 'winter'

  -- Frequency
  auto_generate_suggestions BOOLEAN DEFAULT true,
  suggestion_frequency TEXT DEFAULT 'daily' CHECK (suggestion_frequency IN ('daily', 'weekly', 'on_demand')),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (household_id, user_id)
);

-- Suggestion history for analytics
CREATE TABLE IF NOT EXISTS suggestion_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,

  -- Metrics
  date DATE NOT NULL,
  suggestions_generated INTEGER DEFAULT 0,
  suggestions_accepted INTEGER DEFAULT 0,
  suggestions_rejected INTEGER DEFAULT 0,
  acceptance_rate DECIMAL(5,2),

  -- Top factors
  top_match_factors JSONB,
  avg_confidence_score DECIMAL(5,2),

  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (household_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_meal_suggestions_household ON meal_suggestions(household_id);
CREATE INDEX IF NOT EXISTS idx_meal_suggestions_recipe ON meal_suggestions(recipe_id);
CREATE INDEX IF NOT EXISTS idx_meal_suggestions_status ON meal_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_meal_suggestions_date ON meal_suggestions(suggested_for_date);
CREATE INDEX IF NOT EXISTS idx_meal_suggestions_expires ON meal_suggestions(expires_at);
CREATE INDEX IF NOT EXISTS idx_meal_suggestions_created ON meal_suggestions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_suggestion_feedback_suggestion ON suggestion_feedback(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_feedback_household ON suggestion_feedback(household_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_feedback_type ON suggestion_feedback(feedback_type);

CREATE INDEX IF NOT EXISTS idx_suggestion_preferences_household ON suggestion_preferences(household_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_preferences_user ON suggestion_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_suggestion_analytics_household ON suggestion_analytics(household_id);
CREATE INDEX IF NOT EXISTS idx_suggestion_analytics_date ON suggestion_analytics(date DESC);

-- Row Level Security
ALTER TABLE meal_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestion_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestion_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestion_analytics ENABLE ROW LEVEL SECURITY;

-- meal_suggestions policies
CREATE POLICY "Users can view household suggestions"
  ON meal_suggestions FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can create suggestions"
  ON meal_suggestions FOR INSERT
  WITH CHECK (true); -- Edge function uses service role

CREATE POLICY "Users can update household suggestions"
  ON meal_suggestions FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete household suggestions"
  ON meal_suggestions FOR DELETE
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- suggestion_feedback policies
CREATE POLICY "Users can view household feedback"
  ON suggestion_feedback FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create feedback"
  ON suggestion_feedback FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- suggestion_preferences policies
CREATE POLICY "Users can view their preferences"
  ON suggestion_preferences FOR SELECT
  USING (
    user_id = auth.uid()
    OR household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their preferences"
  ON suggestion_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their preferences"
  ON suggestion_preferences FOR UPDATE
  USING (user_id = auth.uid());

-- suggestion_analytics policies
CREATE POLICY "Users can view household analytics"
  ON suggestion_analytics FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM household_members WHERE user_id = auth.uid()
    )
  );

-- Triggers for updated_at
CREATE TRIGGER update_meal_suggestions_updated_at
  BEFORE UPDATE ON meal_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER update_suggestion_preferences_updated_at
  BEFORE UPDATE ON suggestion_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_updated_at();

-- Function to accept suggestion and add to meal plan
CREATE OR REPLACE FUNCTION accept_meal_suggestion(
  p_suggestion_id UUID,
  p_kid_ids UUID[]
)
RETURNS JSONB AS $$
DECLARE
  v_suggestion meal_suggestions;
  v_plan_entry_ids UUID[] := '{}';
  v_kid_id UUID;
  v_entry_id UUID;
BEGIN
  -- Get suggestion details
  SELECT * INTO v_suggestion
  FROM meal_suggestions
  WHERE id = p_suggestion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion not found';
  END IF;

  -- Create plan entries for each kid
  FOREACH v_kid_id IN ARRAY p_kid_ids
  LOOP
    INSERT INTO plan_entries (
      household_id,
      kid_id,
      recipe_id,
      date,
      meal_slot,
      completed
    ) VALUES (
      v_suggestion.household_id,
      v_kid_id,
      v_suggestion.recipe_id,
      v_suggestion.suggested_for_date,
      v_suggestion.meal_slot,
      false
    )
    RETURNING id INTO v_entry_id;

    v_plan_entry_ids := array_append(v_plan_entry_ids, v_entry_id);
  END LOOP;

  -- Update suggestion status
  UPDATE meal_suggestions
  SET
    status = 'accepted',
    accepted_at = now(),
    updated_at = now()
  WHERE id = p_suggestion_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_entry_ids', v_plan_entry_ids,
    'count', array_length(v_plan_entry_ids, 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reject suggestion with feedback
CREATE OR REPLACE FUNCTION reject_meal_suggestion(
  p_suggestion_id UUID,
  p_feedback_type TEXT,
  p_feedback_text TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_suggestion meal_suggestions;
BEGIN
  -- Get suggestion
  SELECT * INTO v_suggestion
  FROM meal_suggestions
  WHERE id = p_suggestion_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Suggestion not found';
  END IF;

  -- Update suggestion status
  UPDATE meal_suggestions
  SET
    status = 'rejected',
    rejected_at = now(),
    updated_at = now()
  WHERE id = p_suggestion_id;

  -- Record feedback
  INSERT INTO suggestion_feedback (
    suggestion_id,
    household_id,
    user_id,
    feedback_type,
    feedback_text
  ) VALUES (
    p_suggestion_id,
    v_suggestion.household_id,
    auth.uid(),
    p_feedback_type,
    p_feedback_text
  );

  RETURN jsonb_build_object(
    'success', true,
    'status', 'rejected'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get recent recipes for variety checking
CREATE OR REPLACE FUNCTION get_recent_recipe_ids(
  p_household_id UUID,
  p_days_back INTEGER DEFAULT 14
)
RETURNS UUID[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT DISTINCT recipe_id
    FROM plan_entries
    WHERE household_id = p_household_id
      AND recipe_id IS NOT NULL
      AND date >= CURRENT_DATE - p_days_back
  );
END;
$$ LANGUAGE plpgsql;

-- Function to get kid favorite recipes based on votes
CREATE OR REPLACE FUNCTION get_kid_favorite_recipes(
  p_household_id UUID,
  p_min_approval INTEGER DEFAULT 70
)
RETURNS TABLE(
  recipe_id UUID,
  approval_score DECIMAL,
  vote_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mvs.recipe_id,
    mvs.approval_score,
    mvs.total_votes
  FROM meal_vote_summary mvs
  WHERE mvs.household_id = p_household_id
    AND mvs.recipe_id IS NOT NULL
    AND mvs.approval_score >= p_min_approval
    AND mvs.total_votes >= 2 -- At least 2 votes
  ORDER BY mvs.approval_score DESC, mvs.total_votes DESC;
END;
$$ LANGUAGE plpgsql;

-- View for active suggestions
CREATE OR REPLACE VIEW active_suggestions AS
SELECT
  ms.*,
  r.name as recipe_name,
  r.description as recipe_description,
  r.image_url as recipe_image,
  r.servings as recipe_servings,
  (
    SELECT COUNT(*)
    FROM suggestion_feedback sf
    WHERE sf.suggestion_id = ms.id
  ) as feedback_count
FROM meal_suggestions ms
JOIN recipes r ON r.id = ms.recipe_id
WHERE ms.status = 'pending'
  AND ms.expires_at > now()
ORDER BY ms.confidence_score DESC, ms.created_at DESC;

-- Comments for documentation
COMMENT ON TABLE meal_suggestions IS 'AI-generated meal recommendations personalized for each household';
COMMENT ON TABLE suggestion_feedback IS 'User feedback on suggestions to improve future recommendations';
COMMENT ON TABLE suggestion_preferences IS 'User preferences for how suggestions are generated';
COMMENT ON TABLE suggestion_analytics IS 'Daily analytics on suggestion performance';

COMMENT ON COLUMN meal_suggestions.reasoning IS 'AI-generated explanation of why this meal was suggested';
COMMENT ON COLUMN meal_suggestions.confidence_score IS 'AI confidence in this recommendation (0-100)';
COMMENT ON COLUMN meal_suggestions.match_factors IS 'JSON array of factors that influenced this suggestion';
COMMENT ON COLUMN meal_suggestions.predicted_kid_approval IS 'Predicted approval score based on similar past meals';

COMMENT ON FUNCTION accept_meal_suggestion IS 'Accepts a suggestion and creates plan entries for specified kids';
COMMENT ON FUNCTION reject_meal_suggestion IS 'Rejects a suggestion and records feedback for learning';
COMMENT ON FUNCTION get_recent_recipe_ids IS 'Returns recipe IDs used recently to ensure variety';
COMMENT ON FUNCTION get_kid_favorite_recipes IS 'Returns recipes with high kid approval scores';
