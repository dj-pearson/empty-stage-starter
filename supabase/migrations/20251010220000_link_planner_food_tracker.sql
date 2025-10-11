-- ============================================================================
-- PHASE 1: LINK PLANNER AND FOOD TRACKER
-- ============================================================================
-- This migration creates bidirectional integration between plan_entries and food_attempts
-- to unify quick tracking (Planner) with detailed tracking (Food Tracker)

-- Add food_attempt_id to plan_entries (optional link to detailed tracking)
ALTER TABLE plan_entries
ADD COLUMN IF NOT EXISTS food_attempt_id UUID REFERENCES food_attempts(id) ON DELETE SET NULL;

-- Add plan_entry_id to food_attempts (optional link to scheduled meal)
ALTER TABLE food_attempts
ADD COLUMN IF NOT EXISTS plan_entry_id UUID REFERENCES plan_entries(id) ON DELETE SET NULL;

-- Add recipe_id to plan_entries to track when food is part of a recipe
ALTER TABLE plan_entries
ADD COLUMN IF NOT EXISTS recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_primary_dish BOOLEAN DEFAULT true;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_plan_entries_food_attempt ON plan_entries(food_attempt_id);
CREATE INDEX IF NOT EXISTS idx_plan_entries_recipe ON plan_entries(recipe_id);
CREATE INDEX IF NOT EXISTS idx_food_attempts_plan_entry ON food_attempts(plan_entry_id);

-- ============================================================================
-- HELPER FUNCTIONS FOR UNIFIED TRACKING
-- ============================================================================

-- Function to create a food attempt from a plan entry result
CREATE OR REPLACE FUNCTION create_attempt_from_plan_result()
RETURNS TRIGGER AS $$
DECLARE
  v_attempt_id UUID;
  v_stage TEXT;
  v_outcome TEXT;
  v_amount_consumed TEXT;
BEGIN
  -- Only create attempt if result is being set and no attempt exists yet
  IF NEW.result IS NOT NULL AND OLD.result IS NULL AND NEW.food_attempt_id IS NULL THEN

    -- Map plan entry result to food attempt fields
    CASE NEW.result
      WHEN 'ate' THEN
        v_outcome := 'success';
        v_stage := 'full_portion';
        v_amount_consumed := 'all';
      WHEN 'tasted' THEN
        v_outcome := 'partial';
        v_stage := 'small_bite';
        v_amount_consumed := 'quarter';
      WHEN 'refused' THEN
        v_outcome := 'refused';
        v_stage := 'looking';
        v_amount_consumed := 'none';
      ELSE
        RETURN NEW;
    END CASE;

    -- Create the food attempt
    INSERT INTO food_attempts (
      kid_id,
      food_id,
      attempted_at,
      stage,
      outcome,
      bites_taken,
      amount_consumed,
      meal_slot,
      mood_before,
      parent_notes,
      plan_entry_id
    ) VALUES (
      NEW.kid_id,
      NEW.food_id,
      NOW(),
      v_stage,
      v_outcome,
      CASE NEW.result WHEN 'ate' THEN 5 WHEN 'tasted' THEN 1 ELSE 0 END,
      v_amount_consumed,
      NEW.meal_slot,
      'neutral',
      NEW.notes,
      NEW.id
    )
    RETURNING id INTO v_attempt_id;

    -- Link the attempt back to the plan entry
    NEW.food_attempt_id := v_attempt_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create food attempts when plan entries are marked
DROP TRIGGER IF EXISTS plan_result_creates_attempt ON plan_entries;
CREATE TRIGGER plan_result_creates_attempt
  BEFORE UPDATE ON plan_entries
  FOR EACH ROW
  EXECUTE FUNCTION create_attempt_from_plan_result();

-- Function to sync plan entry result when food attempt is updated
CREATE OR REPLACE FUNCTION sync_plan_result_from_attempt()
RETURNS TRIGGER AS $$
DECLARE
  v_result TEXT;
BEGIN
  -- Only sync if this attempt is linked to a plan entry
  IF NEW.plan_entry_id IS NOT NULL THEN

    -- Map food attempt outcome to plan entry result
    CASE NEW.outcome
      WHEN 'success' THEN
        v_result := 'ate';
      WHEN 'partial' THEN
        v_result := 'tasted';
      WHEN 'refused', 'tantrum' THEN
        v_result := 'refused';
      ELSE
        v_result := NULL;
    END CASE;

    -- Update the plan entry
    UPDATE plan_entries
    SET
      result = v_result,
      notes = COALESCE(NEW.parent_notes, notes),
      updated_at = NOW()
    WHERE id = NEW.plan_entry_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to sync plan entry when attempt is updated
DROP TRIGGER IF EXISTS attempt_syncs_plan_result ON food_attempts;
CREATE TRIGGER attempt_syncs_plan_result
  AFTER INSERT OR UPDATE ON food_attempts
  FOR EACH ROW
  EXECUTE FUNCTION sync_plan_result_from_attempt();

-- ============================================================================
-- RECIPE SCHEDULING HELPERS
-- ============================================================================

-- Function to schedule a complete recipe to the meal plan
CREATE OR REPLACE FUNCTION schedule_recipe_to_plan(
  p_kid_id UUID,
  p_recipe_id UUID,
  p_date DATE,
  p_meal_slot TEXT
)
RETURNS INTEGER AS $$
DECLARE
  v_food_id UUID;
  v_food_ids UUID[];
  v_user_id UUID;
  v_count INTEGER := 0;
  v_is_primary BOOLEAN := true;
BEGIN
  -- Get user_id from kid
  SELECT user_id INTO v_user_id FROM kids WHERE id = p_kid_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Kid not found';
  END IF;

  -- Get recipe food_ids
  SELECT food_ids INTO v_food_ids FROM recipes WHERE id = p_recipe_id;

  IF v_food_ids IS NULL OR array_length(v_food_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Recipe has no foods';
  END IF;

  -- Delete any existing entries for this kid/date/slot/recipe combination
  DELETE FROM plan_entries
  WHERE kid_id = p_kid_id
    AND date = p_date
    AND meal_slot = p_meal_slot
    AND recipe_id = p_recipe_id;

  -- Insert plan entries for each food in recipe
  FOREACH v_food_id IN ARRAY v_food_ids
  LOOP
    INSERT INTO plan_entries (
      user_id,
      kid_id,
      date,
      meal_slot,
      food_id,
      recipe_id,
      is_primary_dish
    ) VALUES (
      v_user_id,
      p_kid_id,
      p_date,
      p_meal_slot,
      v_food_id,
      p_recipe_id,
      v_is_primary
    );

    v_count := v_count + 1;
    v_is_primary := false; -- Only first food is primary
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS FOR UNIFIED TRACKING
-- ============================================================================

-- View showing all tracking data (quick + detailed) for a kid
CREATE OR REPLACE VIEW unified_meal_tracking AS
SELECT
  pe.id as plan_entry_id,
  pe.kid_id,
  pe.date,
  pe.meal_slot,
  pe.food_id,
  f.name as food_name,
  f.category as food_category,
  pe.recipe_id,
  r.name as recipe_name,
  pe.is_primary_dish,
  -- Quick tracking data from plan_entries
  pe.result as quick_result,
  pe.notes as quick_notes,
  -- Detailed tracking data from food_attempts (if exists)
  fa.id as food_attempt_id,
  fa.stage,
  fa.outcome,
  fa.bites_taken,
  fa.amount_consumed,
  fa.mood_before,
  fa.mood_after,
  fa.reaction_notes,
  fa.parent_notes as detailed_notes,
  fa.strategies_used,
  fa.is_milestone,
  fa.attempted_at,
  -- Combined fields
  COALESCE(pe.result,
    CASE fa.outcome
      WHEN 'success' THEN 'ate'
      WHEN 'partial' THEN 'tasted'
      WHEN 'refused' THEN 'refused'
      WHEN 'tantrum' THEN 'refused'
    END
  ) as combined_result,
  CASE WHEN fa.id IS NOT NULL THEN true ELSE false END as has_detailed_tracking,
  pe.created_at,
  pe.updated_at
FROM plan_entries pe
JOIN foods f ON f.id = pe.food_id
LEFT JOIN recipes r ON r.id = pe.recipe_id
LEFT JOIN food_attempts fa ON fa.id = pe.food_attempt_id
ORDER BY pe.date DESC, pe.meal_slot;

-- View for recipe success tracking
CREATE OR REPLACE VIEW recipe_success_stats AS
SELECT
  r.id as recipe_id,
  r.name as recipe_name,
  COUNT(DISTINCT pe.date) as times_scheduled,
  COUNT(DISTINCT pe.id) as total_food_entries,
  COUNT(DISTINCT pe.id) FILTER (WHERE pe.result = 'ate') as foods_eaten,
  COUNT(DISTINCT pe.id) FILTER (WHERE pe.result IN ('ate', 'tasted')) as foods_accepted,
  ROUND(
    COUNT(DISTINCT pe.id) FILTER (WHERE pe.result IN ('ate', 'tasted'))::DECIMAL
    / NULLIF(COUNT(DISTINCT pe.id), 0) * 100,
    2
  ) as acceptance_rate,
  MAX(pe.date) as last_scheduled
FROM recipes r
LEFT JOIN plan_entries pe ON pe.recipe_id = r.id
GROUP BY r.id, r.name;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN plan_entries.food_attempt_id IS 'Links to detailed food tracking if parent wants more detail';
COMMENT ON COLUMN plan_entries.recipe_id IS 'Links to recipe if this food is part of a meal template';
COMMENT ON COLUMN plan_entries.is_primary_dish IS 'True if this is the main dish in a recipe (first food)';
COMMENT ON COLUMN food_attempts.plan_entry_id IS 'Links to planned meal if this was a scheduled attempt';

COMMENT ON FUNCTION create_attempt_from_plan_result() IS 'Auto-creates detailed food attempt when user marks plan entry result';
COMMENT ON FUNCTION sync_plan_result_from_attempt() IS 'Syncs plan entry result when food attempt is updated';
COMMENT ON FUNCTION schedule_recipe_to_plan IS 'Schedules all foods from a recipe to the meal plan';

COMMENT ON VIEW unified_meal_tracking IS 'Combines quick tracking (plan_entries) and detailed tracking (food_attempts) into single view';
COMMENT ON VIEW recipe_success_stats IS 'Shows recipe-level success metrics';
