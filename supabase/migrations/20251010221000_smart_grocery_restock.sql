-- ============================================================================
-- SMART GROCERY RESTOCK SYSTEM
-- ============================================================================
-- Automatically detects when foods need restocking based on:
-- 1. Low/out of stock items with upcoming plan entries
-- 2. High consumption velocity foods
-- 3. Foods eaten frequently in the past week

-- Add metadata to grocery_items for smarter management
ALTER TABLE grocery_items
ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS restock_reason TEXT,
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
ADD COLUMN IF NOT EXISTS aisle TEXT;

-- Create index for auto-generated items
CREATE INDEX IF NOT EXISTS idx_grocery_items_auto ON grocery_items(auto_generated, checked);

-- ============================================================================
-- RESTOCK DETECTION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION detect_restock_needs(
  p_user_id UUID,
  p_kid_id UUID DEFAULT NULL
)
RETURNS TABLE (
  food_id UUID,
  food_name TEXT,
  current_quantity INTEGER,
  recommended_quantity INTEGER,
  reason TEXT,
  priority TEXT,
  category TEXT,
  aisle TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH upcoming_meals AS (
    -- Get foods in upcoming plan (next 7 days)
    SELECT
      pe.food_id,
      COUNT(*) as times_planned
    FROM plan_entries pe
    WHERE pe.user_id = p_user_id
      AND (p_kid_id IS NULL OR pe.kid_id = p_kid_id)
      AND pe.date >= CURRENT_DATE
      AND pe.date <= CURRENT_DATE + INTERVAL '7 days'
    GROUP BY pe.food_id
  ),
  recent_consumption AS (
    -- Get foods eaten in last 7 days
    SELECT
      pe.food_id,
      COUNT(*) as times_eaten
    FROM plan_entries pe
    WHERE pe.user_id = p_user_id
      AND (p_kid_id IS NULL OR pe.kid_id = p_kid_id)
      AND pe.date >= CURRENT_DATE - INTERVAL '7 days'
      AND pe.date < CURRENT_DATE
      AND pe.result = 'ate'
    GROUP BY pe.food_id
  ),
  food_stats AS (
    SELECT
      f.id,
      f.name,
      f.category,
      f.aisle,
      COALESCE(f.quantity, 0) as current_qty,
      COALESCE(um.times_planned, 0) as planned,
      COALESCE(rc.times_eaten, 0) as eaten,
      -- Calculate recommended quantity
      GREATEST(
        COALESCE(um.times_planned, 0) - COALESCE(f.quantity, 0),
        CASE
          WHEN COALESCE(rc.times_eaten, 0) >= 5 THEN 7  -- Frequently eaten
          WHEN COALESCE(rc.times_eaten, 0) >= 3 THEN 5  -- Regularly eaten
          WHEN COALESCE(um.times_planned, 0) > 0 THEN 3  -- Planned but low stock
          ELSE 0
        END
      ) as recommended,
      -- Determine reason and priority
      CASE
        WHEN COALESCE(f.quantity, 0) = 0 AND COALESCE(um.times_planned, 0) > 0
          THEN 'Out of stock with upcoming meals'
        WHEN COALESCE(f.quantity, 0) <= 2 AND COALESCE(um.times_planned, 0) > 0
          THEN 'Low stock with ' || COALESCE(um.times_planned, 0) || ' meals planned'
        WHEN COALESCE(rc.times_eaten, 0) >= 5
          THEN 'Frequently eaten (' || COALESCE(rc.times_eaten, 0) || ' times last week)'
        WHEN COALESCE(rc.times_eaten, 0) >= 3
          THEN 'Regularly eaten (' || COALESCE(rc.times_eaten, 0) || ' times last week)'
        ELSE 'Proactive restock'
      END as restock_reason,
      CASE
        WHEN COALESCE(f.quantity, 0) = 0 AND COALESCE(um.times_planned, 0) > 0
          THEN 'high'
        WHEN COALESCE(f.quantity, 0) <= 2 AND COALESCE(um.times_planned, 0) > 0
          THEN 'high'
        WHEN COALESCE(rc.times_eaten, 0) >= 5
          THEN 'high'
        WHEN COALESCE(rc.times_eaten, 0) >= 3
          THEN 'medium'
        ELSE 'low'
      END as priority_level
    FROM foods f
    LEFT JOIN upcoming_meals um ON um.food_id = f.id
    LEFT JOIN recent_consumption rc ON rc.food_id = f.id
    WHERE f.user_id = p_user_id
      AND f.is_safe = true  -- Only restock safe foods
      AND (
        -- Include if: out of stock OR low stock OR frequently eaten
        COALESCE(f.quantity, 0) = 0
        OR COALESCE(f.quantity, 0) <= 2
        OR COALESCE(rc.times_eaten, 0) >= 3
      )
  )
  SELECT
    fs.id,
    fs.name,
    fs.current_qty,
    fs.recommended::INTEGER,
    fs.restock_reason,
    fs.priority_level,
    fs.category,
    fs.aisle
  FROM food_stats fs
  WHERE fs.recommended > 0
  ORDER BY
    CASE fs.priority_level
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      ELSE 3
    END,
    fs.recommended DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- AUTO-ADD RESTOCK ITEMS TO GROCERY LIST
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_add_restock_items(
  p_user_id UUID,
  p_kid_id UUID DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_restock_record RECORD;
  v_existing_item RECORD;
  v_items_added INTEGER := 0;
BEGIN
  -- Loop through restock recommendations
  FOR v_restock_record IN
    SELECT * FROM detect_restock_needs(p_user_id, p_kid_id)
  LOOP
    -- Check if item already exists in grocery list (unchecked)
    SELECT * INTO v_existing_item
    FROM grocery_items
    WHERE user_id = p_user_id
      AND LOWER(name) = LOWER(v_restock_record.food_name)
      AND checked = false;

    IF v_existing_item.id IS NOT NULL THEN
      -- Update existing item if recommended quantity is higher
      IF v_restock_record.recommended_quantity > v_existing_item.quantity THEN
        UPDATE grocery_items
        SET
          quantity = v_restock_record.recommended_quantity,
          restock_reason = v_restock_record.reason,
          priority = v_restock_record.priority,
          auto_generated = true,
          updated_at = NOW()
        WHERE id = v_existing_item.id;

        v_items_added := v_items_added + 1;
      END IF;
    ELSE
      -- Insert new grocery item
      INSERT INTO grocery_items (
        user_id,
        name,
        quantity,
        unit,
        category,
        aisle,
        checked,
        auto_generated,
        restock_reason,
        priority
      ) VALUES (
        p_user_id,
        v_restock_record.food_name,
        v_restock_record.recommended_quantity,
        'servings',
        v_restock_record.category,
        v_restock_record.aisle,
        false,
        true,
        v_restock_record.reason,
        v_restock_record.priority
      );

      v_items_added := v_items_added + 1;
    END IF;
  END LOOP;

  RETURN v_items_added;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SCHEDULED AUTO-RESTOCK (Called by cron or manually)
-- ============================================================================

-- Function to be called daily/weekly to auto-restock all users
CREATE OR REPLACE FUNCTION scheduled_auto_restock()
RETURNS TABLE (
  user_id UUID,
  items_added INTEGER
) AS $$
DECLARE
  v_user RECORD;
  v_count INTEGER;
BEGIN
  -- Loop through all users with recent activity
  FOR v_user IN
    SELECT DISTINCT u.id
    FROM auth.users u
    JOIN plan_entries pe ON pe.user_id = u.id
    WHERE pe.date >= CURRENT_DATE - INTERVAL '7 days'
  LOOP
    SELECT auto_add_restock_items(v_user.id) INTO v_count;

    RETURN QUERY SELECT v_user.id, v_count;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEW FOR GROCERY LIST WITH RESTOCK INFO
-- ============================================================================

CREATE OR REPLACE VIEW grocery_list_with_context AS
SELECT
  gi.*,
  f.quantity as current_pantry_quantity,
  CASE
    WHEN gi.priority = 'high' THEN 1
    WHEN gi.priority = 'medium' THEN 2
    ELSE 3
  END as sort_priority
FROM grocery_items gi
LEFT JOIN foods f ON f.name = gi.name AND f.user_id = gi.user_id
ORDER BY
  gi.checked ASC,
  sort_priority ASC,
  CASE WHEN gi.aisle IS NOT NULL THEN 0 ELSE 1 END,
  gi.aisle,
  gi.category;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN grocery_items.auto_generated IS 'True if item was auto-added by restock system';
COMMENT ON COLUMN grocery_items.restock_reason IS 'Why this item was recommended for restock';
COMMENT ON COLUMN grocery_items.priority IS 'Urgency level: high, medium, or low';

COMMENT ON FUNCTION detect_restock_needs IS 'Analyzes pantry, plan, and consumption to recommend restock items';
COMMENT ON FUNCTION auto_add_restock_items IS 'Automatically adds restock recommendations to grocery list';
COMMENT ON FUNCTION scheduled_auto_restock IS 'Cron job function to auto-restock all active users';

COMMENT ON VIEW grocery_list_with_context IS 'Grocery list with pantry context and smart sorting';
