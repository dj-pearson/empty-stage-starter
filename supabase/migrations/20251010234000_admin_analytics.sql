-- ============================================================================
-- ADMIN ANALYTICS & MONITORING SYSTEM
-- ============================================================================
-- Comprehensive analytics views and metrics for platform monitoring

-- ============================================================================
-- PLATFORM HEALTH METRICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW admin_platform_health AS
SELECT
  -- User metrics
  (SELECT COUNT(*) FROM profiles) as total_users,
  (SELECT COUNT(*) FROM profiles WHERE created_at >= NOW() - INTERVAL '7 days') as new_users_7d,
  (SELECT COUNT(*) FROM profiles WHERE created_at >= NOW() - INTERVAL '30 days') as new_users_30d,

  -- Activity metrics
  (SELECT COUNT(DISTINCT user_id) FROM plan_entries WHERE date >= CURRENT_DATE - 7) as active_users_7d,
  (SELECT COUNT(DISTINCT user_id) FROM plan_entries WHERE date >= CURRENT_DATE - 30) as active_users_30d,

  -- Content metrics
  (SELECT COUNT(*) FROM kids) as total_kids,
  (SELECT COUNT(*) FROM foods) as total_foods,
  (SELECT COUNT(*) FROM recipes) as total_recipes,
  (SELECT COUNT(*) FROM plan_entries) as total_plan_entries,
  (SELECT COUNT(*) FROM food_attempts) as total_food_attempts,

  -- Success metrics
  (SELECT COUNT(*) FROM food_attempts WHERE outcome IN ('success', 'partial') AND attempted_at >= NOW() - INTERVAL '7 days') as successful_attempts_7d,
  (SELECT COUNT(*) FROM kid_achievements WHERE earned_at >= NOW() - INTERVAL '7 days') as achievements_7d,

  -- System health
  (SELECT COUNT(*) FROM rate_limits WHERE window_start >= NOW() - INTERVAL '1 hour') as rate_limit_hits_1h,
  (SELECT COUNT(*) FROM backup_logs WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours') as failed_backups_24h,
  (SELECT COUNT(*) FROM automation_email_queue WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours') as failed_emails_24h,

  NOW() as snapshot_at;

-- ============================================================================
-- USER ENGAGEMENT METRICS
-- ============================================================================

CREATE OR REPLACE VIEW admin_user_engagement AS
SELECT
  p.id as user_id,
  p.full_name,
  p.created_at as joined_at,

  -- Kids & content
  (SELECT COUNT(*) FROM kids WHERE user_id = p.id) as kids_count,
  (SELECT COUNT(*) FROM foods WHERE user_id = p.id) as foods_count,
  (SELECT COUNT(*) FROM recipes WHERE user_id = p.id) as recipes_count,

  -- Activity metrics
  (SELECT COUNT(*) FROM plan_entries WHERE user_id = p.id) as total_plan_entries,
  (SELECT COUNT(*) FROM food_attempts fa JOIN kids k ON k.id = fa.kid_id WHERE k.user_id = p.id) as total_food_attempts,
  (SELECT MAX(date) FROM plan_entries WHERE user_id = p.id) as last_plan_date,
  (SELECT MAX(attempted_at) FROM food_attempts fa JOIN kids k ON k.id = fa.kid_id WHERE k.user_id = p.id) as last_attempt_date,

  -- Engagement score (0-100)
  LEAST(100, GREATEST(0,
    COALESCE((SELECT COUNT(*) FROM plan_entries WHERE user_id = p.id AND date >= CURRENT_DATE - 7), 0) * 5 +
    COALESCE((SELECT COUNT(*) FROM food_attempts fa JOIN kids k ON k.id = fa.kid_id WHERE k.user_id = p.id AND fa.attempted_at >= NOW() - INTERVAL '7 days'), 0) * 3 +
    COALESCE((SELECT COUNT(*) FROM recipes WHERE user_id = p.id), 0) * 2
  )) as engagement_score,

  -- User tier
  CASE
    WHEN (SELECT COUNT(*) FROM plan_entries WHERE user_id = p.id AND date >= CURRENT_DATE - 7) >= 7 THEN 'power_user'
    WHEN (SELECT COUNT(*) FROM plan_entries WHERE user_id = p.id AND date >= CURRENT_DATE - 30) >= 7 THEN 'active'
    WHEN (SELECT COUNT(*) FROM plan_entries WHERE user_id = p.id) >= 1 THEN 'casual'
    ELSE 'inactive'
  END as user_tier

FROM profiles p
ORDER BY engagement_score DESC;

-- ============================================================================
-- DAILY ACTIVITY METRICS
-- ============================================================================

CREATE OR REPLACE VIEW admin_daily_activity AS
SELECT
  date_series.date,

  -- User activity
  COUNT(DISTINCT pe.user_id) as active_users,
  COUNT(pe.id) as plan_entries_created,
  COUNT(pe.id) FILTER (WHERE pe.result IS NOT NULL) as meals_logged,

  -- Food attempts
  COUNT(DISTINCT fa.id) as food_attempts_created,
  COUNT(fa.id) FILTER (WHERE fa.outcome IN ('success', 'partial')) as successful_attempts,

  -- New content
  COUNT(DISTINCT f.id) as foods_added,
  COUNT(DISTINCT r.id) as recipes_created,

  -- Achievements
  COUNT(DISTINCT ka.id) as achievements_earned

FROM generate_series(
  CURRENT_DATE - INTERVAL '30 days',
  CURRENT_DATE,
  '1 day'::interval
) AS date_series(date)

LEFT JOIN plan_entries pe ON pe.date = date_series.date::date
LEFT JOIN food_attempts fa ON fa.attempted_at::date = date_series.date::date
LEFT JOIN foods f ON f.created_at::date = date_series.date::date
LEFT JOIN recipes r ON r.created_at::date = date_series.date::date
LEFT JOIN kid_achievements ka ON ka.earned_at::date = date_series.date::date

GROUP BY date_series.date
ORDER BY date_series.date DESC;

-- ============================================================================
-- AI USAGE METRICS
-- ============================================================================

CREATE OR REPLACE VIEW admin_ai_usage AS
SELECT
  rl.endpoint,
  rlc.description,
  COUNT(*) as total_requests,
  COUNT(DISTINCT rl.user_id) as unique_users,
  COUNT(*) FILTER (WHERE rl.window_start >= NOW() - INTERVAL '24 hours') as requests_24h,
  COUNT(*) FILTER (WHERE rl.window_start >= NOW() - INTERVAL '7 days') as requests_7d,
  MAX(rl.window_start) as last_request_at,

  -- Average requests per user
  ROUND(COUNT(*)::NUMERIC / NULLIF(COUNT(DISTINCT rl.user_id), 0), 2) as avg_requests_per_user,

  -- Peak usage
  MAX(rl.request_count) as peak_requests_per_minute

FROM rate_limits rl
LEFT JOIN rate_limit_config rlc ON rlc.endpoint = rl.endpoint
WHERE rl.window_start >= NOW() - INTERVAL '30 days'
GROUP BY rl.endpoint, rlc.description
ORDER BY total_requests DESC;

-- ============================================================================
-- CONTENT QUALITY METRICS
-- ============================================================================

CREATE OR REPLACE VIEW admin_content_quality AS
SELECT
  'foods' as content_type,
  COUNT(*) as total_items,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as added_7d,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as added_30d,
  ROUND(AVG(CHAR_LENGTH(name))) as avg_name_length,
  COUNT(*) FILTER (WHERE allergens IS NOT NULL AND array_length(allergens, 1) > 0) as items_with_allergens,
  COUNT(*) FILTER (WHERE quantity IS NOT NULL) as items_with_quantity
FROM foods

UNION ALL

SELECT
  'recipes' as content_type,
  COUNT(*) as total_items,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as added_7d,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as added_30d,
  ROUND(AVG(CHAR_LENGTH(name))) as avg_name_length,
  COUNT(*) FILTER (WHERE description IS NOT NULL) as items_with_allergens,
  COUNT(*) FILTER (WHERE array_length(food_ids, 1) > 3) as items_with_quantity
FROM recipes

UNION ALL

SELECT
  'kids' as content_type,
  COUNT(*) as total_items,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as added_7d,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as added_30d,
  ROUND(AVG(CHAR_LENGTH(name))) as avg_name_length,
  COUNT(*) FILTER (WHERE allergens IS NOT NULL AND array_length(allergens, 1) > 0) as items_with_allergens,
  COUNT(*) FILTER (WHERE profile_completed = true) as items_with_quantity
FROM kids;

-- ============================================================================
-- ERROR TRACKING VIEW
-- ============================================================================

CREATE OR REPLACE VIEW admin_error_tracking AS
SELECT
  'backup_failures' as error_type,
  COUNT(*) as error_count,
  MAX(created_at) as last_occurrence,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'user_id', user_id,
      'error', error_message,
      'timestamp', created_at
    ) ORDER BY created_at DESC
  ) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as recent_errors
FROM backup_logs
WHERE status = 'failed'
  AND created_at >= NOW() - INTERVAL '7 days'

UNION ALL

SELECT
  'email_failures' as error_type,
  COUNT(*) as error_count,
  MAX(created_at) as last_occurrence,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'user_id', user_id,
      'template', template_key,
      'error', error_message,
      'timestamp', created_at
    ) ORDER BY created_at DESC
  ) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as recent_errors
FROM automation_email_queue
WHERE status = 'failed'
  AND created_at >= NOW() - INTERVAL '7 days';

-- ============================================================================
-- USER RETENTION COHORT ANALYSIS
-- ============================================================================

CREATE OR REPLACE VIEW admin_user_retention AS
WITH cohorts AS (
  SELECT
    DATE_TRUNC('month', created_at) as cohort_month,
    id as user_id
  FROM profiles
  WHERE created_at >= NOW() - INTERVAL '6 months'
),
user_activity AS (
  SELECT
    user_id,
    DATE_TRUNC('month', date) as activity_month
  FROM plan_entries
  WHERE date >= CURRENT_DATE - INTERVAL '6 months'
  GROUP BY user_id, DATE_TRUNC('month', date)
)
SELECT
  c.cohort_month,
  COUNT(DISTINCT c.user_id) as cohort_size,
  COUNT(DISTINCT ua0.user_id) as month_0,
  COUNT(DISTINCT ua1.user_id) as month_1,
  COUNT(DISTINCT ua2.user_id) as month_2,
  COUNT(DISTINCT ua3.user_id) as month_3,

  -- Retention percentages
  ROUND(COUNT(DISTINCT ua1.user_id)::NUMERIC / NULLIF(COUNT(DISTINCT c.user_id), 0) * 100, 1) as retention_month_1_pct,
  ROUND(COUNT(DISTINCT ua2.user_id)::NUMERIC / NULLIF(COUNT(DISTINCT c.user_id), 0) * 100, 1) as retention_month_2_pct,
  ROUND(COUNT(DISTINCT ua3.user_id)::NUMERIC / NULLIF(COUNT(DISTINCT c.user_id), 0) * 100, 1) as retention_month_3_pct

FROM cohorts c
LEFT JOIN user_activity ua0 ON ua0.user_id = c.user_id AND ua0.activity_month = c.cohort_month
LEFT JOIN user_activity ua1 ON ua1.user_id = c.user_id AND ua1.activity_month = c.cohort_month + INTERVAL '1 month'
LEFT JOIN user_activity ua2 ON ua2.user_id = c.user_id AND ua2.activity_month = c.cohort_month + INTERVAL '2 months'
LEFT JOIN user_activity ua3 ON ua3.user_id = c.user_id AND ua3.activity_month = c.cohort_month + INTERVAL '3 months'
GROUP BY c.cohort_month
ORDER BY c.cohort_month DESC;

-- ============================================================================
-- FEATURE ADOPTION METRICS
-- ============================================================================

CREATE OR REPLACE VIEW admin_feature_adoption AS
WITH user_totals AS (
  SELECT COUNT(*) as total_users FROM profiles
)
SELECT
  'Meal Planning' as feature,
  COUNT(DISTINCT pe.user_id) as users_using,
  ROUND(COUNT(DISTINCT pe.user_id)::NUMERIC / ut.total_users * 100, 1) as adoption_rate_pct,
  COUNT(pe.id) as total_usage_count,
  MAX(pe.date) as last_used
FROM plan_entries pe
CROSS JOIN user_totals ut
GROUP BY ut.total_users

UNION ALL

SELECT
  'Food Tracking' as feature,
  COUNT(DISTINCT k.user_id) as users_using,
  ROUND(COUNT(DISTINCT k.user_id)::NUMERIC / ut.total_users * 100, 1) as adoption_rate_pct,
  COUNT(fa.id) as total_usage_count,
  MAX(fa.attempted_at) as last_used
FROM food_attempts fa
JOIN kids k ON k.id = fa.kid_id
CROSS JOIN user_totals ut
GROUP BY ut.total_users

UNION ALL

SELECT
  'Recipes' as feature,
  COUNT(DISTINCT r.user_id) as users_using,
  ROUND(COUNT(DISTINCT r.user_id)::NUMERIC / ut.total_users * 100, 1) as adoption_rate_pct,
  COUNT(r.id) as total_usage_count,
  MAX(r.created_at) as last_used
FROM recipes r
CROSS JOIN user_totals ut
GROUP BY ut.total_users

UNION ALL

SELECT
  'AI Coach' as feature,
  COUNT(DISTINCT ac.user_id) as users_using,
  ROUND(COUNT(DISTINCT ac.user_id)::NUMERIC / ut.total_users * 100, 1) as adoption_rate_pct,
  COUNT(ac.id) as total_usage_count,
  MAX(ac.updated_at) as last_used
FROM ai_coach_conversations ac
CROSS JOIN user_totals ut
GROUP BY ut.total_users

UNION ALL

SELECT
  'Meal Builder' as feature,
  COUNT(DISTINCT k.user_id) as users_using,
  ROUND(COUNT(DISTINCT k.user_id)::NUMERIC / ut.total_users * 100, 1) as adoption_rate_pct,
  COUNT(kmc.id) as total_usage_count,
  MAX(kmc.created_at) as last_used
FROM kid_meal_creations kmc
JOIN kids k ON k.id = kmc.kid_id
CROSS JOIN user_totals ut
GROUP BY ut.total_users;

-- ============================================================================
-- ADMIN NOTIFICATION TRIGGERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT NOT NULL, -- 'alert', 'warning', 'info'
  severity TEXT NOT NULL, -- 'critical', 'high', 'medium', 'low'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON admin_notifications(is_read, created_at DESC) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_admin_notifications_severity ON admin_notifications(severity, created_at DESC);

-- Enable RLS
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;

-- Only admins can access
CREATE POLICY "Admins can view notifications"
  ON admin_notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage notifications"
  ON admin_notifications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- ============================================================================
-- FUNCTION: CREATE ADMIN NOTIFICATION
-- ============================================================================

CREATE OR REPLACE FUNCTION create_admin_notification(
  p_type TEXT,
  p_severity TEXT,
  p_title TEXT,
  p_message TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO admin_notifications (
    notification_type,
    severity,
    title,
    message,
    metadata
  ) VALUES (
    p_type,
    p_severity,
    p_title,
    p_message,
    p_metadata
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- MONITORING TRIGGERS
-- ============================================================================

-- Alert when backups fail
CREATE OR REPLACE FUNCTION check_backup_failures()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'failed' THEN
    PERFORM create_admin_notification(
      'alert',
      'high',
      'Backup Failed',
      'User backup failed: ' || COALESCE(NEW.error_message, 'Unknown error'),
      jsonb_build_object('backup_id', NEW.id, 'user_id', NEW.user_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_backup_failure
  AFTER UPDATE ON backup_logs
  FOR EACH ROW
  WHEN (OLD.status != 'failed' AND NEW.status = 'failed')
  EXECUTE FUNCTION check_backup_failures();

-- Alert when rate limits are frequently hit
CREATE OR REPLACE FUNCTION check_rate_limit_abuse()
RETURNS TRIGGER AS $$
DECLARE
  v_recent_hits INTEGER;
BEGIN
  -- Check if user has hit rate limit more than 5 times in last hour
  SELECT COUNT(*) INTO v_recent_hits
  FROM rate_limits
  WHERE user_id = NEW.user_id
    AND endpoint = NEW.endpoint
    AND window_start >= NOW() - INTERVAL '1 hour'
    AND request_count >= (
      SELECT free_tier_limit FROM rate_limit_config WHERE endpoint = NEW.endpoint
    );

  IF v_recent_hits >= 5 THEN
    PERFORM create_admin_notification(
      'warning',
      'medium',
      'Potential Rate Limit Abuse',
      'User hitting rate limits frequently: ' || NEW.endpoint,
      jsonb_build_object('user_id', NEW.user_id, 'endpoint', NEW.endpoint, 'hits', v_recent_hits)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_rate_limit_hit
  AFTER INSERT ON rate_limits
  FOR EACH ROW
  WHEN (NEW.request_count >= 10)
  EXECUTE FUNCTION check_rate_limit_abuse();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON VIEW admin_platform_health IS 'High-level platform health metrics snapshot';
COMMENT ON VIEW admin_user_engagement IS 'Per-user engagement scores and activity metrics';
COMMENT ON VIEW admin_daily_activity IS 'Daily activity trends over last 30 days';
COMMENT ON VIEW admin_ai_usage IS 'AI endpoint usage statistics and costs';
COMMENT ON VIEW admin_content_quality IS 'Content creation and quality metrics';
COMMENT ON VIEW admin_error_tracking IS 'System errors and failures tracking';
COMMENT ON VIEW admin_user_retention IS 'Cohort-based user retention analysis';
COMMENT ON VIEW admin_feature_adoption IS 'Feature usage and adoption rates';
COMMENT ON TABLE admin_notifications IS 'System notifications for administrators';
COMMENT ON FUNCTION create_admin_notification IS 'Create a new admin notification';
