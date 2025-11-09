-- User Intelligence Dashboard
-- This migration creates the necessary views and functions for the unified user intelligence dashboard

-- ============================================================================
-- 1. USER ENGAGEMENT STATS (Materialized View for Performance)
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS user_engagement_stats AS
SELECT
  p.id as user_id,
  -- Login activity
  COUNT(DISTINCT ala.id) FILTER (WHERE ala.activity_type = 'login' AND ala.created_at > NOW() - INTERVAL '30 days') as logins_30d,
  COUNT(DISTINCT ala.id) FILTER (WHERE ala.activity_type = 'login' AND ala.created_at > NOW() - INTERVAL '7 days') as logins_7d,
  MAX(ala.created_at) FILTER (WHERE ala.activity_type = 'login') as last_login,

  -- Content creation activity
  COUNT(DISTINCT pe.id) FILTER (WHERE pe.created_at > NOW() - INTERVAL '30 days') as meal_plans_30d,
  COUNT(DISTINCT r.id) FILTER (WHERE r.created_at > NOW() - INTERVAL '30 days') as recipes_30d,
  COUNT(DISTINCT f.id) FILTER (WHERE f.created_at > NOW() - INTERVAL '30 days') as foods_30d,

  -- Engagement metrics
  COUNT(DISTINCT fa.id) FILTER (WHERE fa.created_at > NOW() - INTERVAL '30 days') as food_attempts_30d,
  COUNT(DISTINCT ka.id) FILTER (WHERE ka.created_at > NOW() - INTERVAL '30 days') as achievements_30d,

  -- Error tracking
  COUNT(DISTINCT ala.id) FILTER (WHERE ala.severity = 'error' AND ala.created_at > NOW() - INTERVAL '7 days') as errors_7d,

  -- Feature adoption (count of distinct feature types used)
  COUNT(DISTINCT CASE
    WHEN pe.id IS NOT NULL THEN 'meal_plans'
    WHEN r.id IS NOT NULL THEN 'recipes'
    WHEN fa.id IS NOT NULL THEN 'food_tracking'
    WHEN ka.id IS NOT NULL THEN 'achievements'
  END) as features_adopted,

  -- Last activity timestamp
  GREATEST(
    MAX(ala.created_at),
    MAX(pe.created_at),
    MAX(r.created_at),
    MAX(f.created_at)
  ) as last_activity

FROM profiles p
LEFT JOIN admin_live_activity ala ON p.id = ala.user_id
LEFT JOIN plan_entries pe ON p.id = pe.user_id
LEFT JOIN recipes r ON p.id = r.user_id
LEFT JOIN foods f ON p.id = f.user_id
LEFT JOIN food_attempts fa ON p.id = fa.user_id
LEFT JOIN kid_achievements ka ON EXISTS (SELECT 1 FROM kids k WHERE k.user_id = p.id AND k.id = ka.kid_id)
GROUP BY p.id;

-- Create index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_engagement_stats_user_id ON user_engagement_stats(user_id);

-- ============================================================================
-- 2. USER TICKET SUMMARY VIEW
-- ============================================================================

CREATE OR REPLACE VIEW user_ticket_summary AS
SELECT
  st.user_id,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE st.status IN ('new', 'in_progress', 'waiting_user')) as open_count,
  COUNT(*) FILTER (WHERE st.status IN ('resolved', 'closed')) as closed_count,
  MAX(st.created_at) as last_ticket_date,
  AVG(EXTRACT(EPOCH FROM (st.updated_at - st.created_at)) / 3600) FILTER (WHERE st.status IN ('resolved', 'closed')) as avg_resolution_hours
FROM support_tickets st
GROUP BY st.user_id;

-- ============================================================================
-- 3. HEALTH SCORE CALCULATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_user_health_score(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_score INTEGER := 100;
  v_days_since_login INTEGER;
  v_engagement_stats RECORD;
BEGIN
  -- Get engagement stats
  SELECT * INTO v_engagement_stats
  FROM user_engagement_stats
  WHERE user_id = p_user_id;

  IF v_engagement_stats IS NULL THEN
    RETURN 50; -- Default score for users with no data
  END IF;

  -- Calculate days since last login
  v_days_since_login := EXTRACT(DAY FROM NOW() - v_engagement_stats.last_login);

  -- Deduct points based on inactivity
  IF v_days_since_login > 30 THEN
    v_score := v_score - 40;
  ELSIF v_days_since_login > 14 THEN
    v_score := v_score - 25;
  ELSIF v_days_since_login > 7 THEN
    v_score := v_score - 15;
  END IF;

  -- Deduct points for low login frequency
  IF v_engagement_stats.logins_30d < 4 THEN
    v_score := v_score - 20;
  ELSIF v_engagement_stats.logins_30d < 8 THEN
    v_score := v_score - 10;
  END IF;

  -- Deduct points for low content creation
  IF v_engagement_stats.meal_plans_30d = 0 THEN
    v_score := v_score - 15;
  END IF;

  -- Deduct points for low feature adoption
  IF v_engagement_stats.features_adopted < 2 THEN
    v_score := v_score - 15;
  ELSIF v_engagement_stats.features_adopted < 3 THEN
    v_score := v_score - 10;
  END IF;

  -- Deduct points for errors
  IF v_engagement_stats.errors_7d > 5 THEN
    v_score := v_score - 15;
  ELSIF v_engagement_stats.errors_7d > 2 THEN
    v_score := v_score - 10;
  END IF;

  -- Add points for high engagement
  IF v_engagement_stats.logins_30d > 20 THEN
    v_score := v_score + 10;
  END IF;

  IF v_engagement_stats.meal_plans_30d > 10 THEN
    v_score := v_score + 5;
  END IF;

  -- Ensure score is between 0 and 100
  RETURN GREATEST(0, LEAST(100, v_score));
END;
$$;

-- ============================================================================
-- 4. USER INTELLIGENCE VIEW (Main Consolidated View)
-- ============================================================================

CREATE OR REPLACE VIEW admin_user_intelligence AS
SELECT
  p.id,
  p.email,
  p.name,
  p.created_at,

  -- Health scoring
  calculate_user_health_score(p.id) as health_score,
  CASE
    WHEN calculate_user_health_score(p.id) >= 70 THEN 'healthy'
    WHEN calculate_user_health_score(p.id) >= 40 THEN 'at_risk'
    ELSE 'critical'
  END as health_status,

  -- Subscription data
  s.id as subscription_id,
  s.status as subscription_status,
  s.stripe_subscription_id,
  s.stripe_customer_id,
  s.current_period_end as next_billing_date,
  s.cancel_at_period_end,
  COALESCE(spm.price_monthly, 0) as mrr,

  -- Calculate LTV (simplified: months active * MRR)
  ROUND(
    EXTRACT(EPOCH FROM (COALESCE(s.canceled_at, NOW()) - s.created_at)) / (86400 * 30) *
    COALESCE(spm.price_monthly, 0)
  ) as estimated_ltv,

  -- Calculate account age in days
  EXTRACT(DAY FROM NOW() - p.created_at)::INTEGER as account_age_days,

  -- Engagement metrics from materialized view
  ues.logins_30d,
  ues.logins_7d,
  ues.last_login,
  ues.last_activity,
  ues.meal_plans_30d,
  ues.recipes_30d,
  ues.foods_30d,
  ues.food_attempts_30d,
  ues.achievements_30d,
  ues.errors_7d,
  ues.features_adopted,

  -- Engagement tier classification
  CASE
    WHEN ues.logins_30d >= 20 AND ues.meal_plans_30d >= 10 THEN 'power_user'
    WHEN ues.logins_30d >= 8 AND ues.meal_plans_30d >= 4 THEN 'active'
    WHEN ues.logins_30d >= 2 THEN 'casual'
    ELSE 'inactive'
  END as user_tier,

  -- Support metrics
  uts.total_count as total_tickets,
  uts.open_count as open_tickets,
  uts.closed_count as closed_tickets,
  uts.last_ticket_date,
  uts.avg_resolution_hours,

  -- Kids count
  (SELECT COUNT(*) FROM kids k WHERE k.user_id = p.id) as kids_count,

  -- Risk indicators
  CASE
    WHEN EXTRACT(DAY FROM NOW() - ues.last_activity) > 7 THEN true
    ELSE false
  END as at_risk_inactive,

  CASE
    WHEN ues.errors_7d > 3 THEN true
    ELSE false
  END as at_risk_errors,

  CASE
    WHEN s.status = 'past_due' OR s.cancel_at_period_end THEN true
    ELSE false
  END as at_risk_payment

FROM profiles p
LEFT JOIN subscriptions s ON p.id = s.user_id AND s.status IN ('active', 'trialing', 'past_due')
LEFT JOIN stripe_product_mapping spm ON s.stripe_price_id = spm.stripe_price_id
LEFT JOIN user_engagement_stats ues ON p.id = ues.user_id
LEFT JOIN user_ticket_summary uts ON p.id = uts.user_id;

-- ============================================================================
-- 5. USER ACTIVITY TIMELINE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_activity_timeline(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  activity_date TIMESTAMPTZ,
  activity_type TEXT,
  activity_description TEXT,
  severity TEXT,
  metadata JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH all_activities AS (
    -- Admin live activity
    SELECT
      ala.created_at as activity_date,
      ala.activity_type,
      ala.activity_description,
      ala.severity,
      ala.metadata
    FROM admin_live_activity ala
    WHERE ala.user_id = p_user_id

    UNION ALL

    -- Support tickets
    SELECT
      st.created_at as activity_date,
      'support_ticket' as activity_type,
      'Support ticket opened: ' || st.subject as activity_description,
      CASE st.priority
        WHEN 'urgent' THEN 'error'
        WHEN 'high' THEN 'warning'
        ELSE 'info'
      END as severity,
      jsonb_build_object(
        'ticket_id', st.id,
        'status', st.status,
        'category', st.category,
        'priority', st.priority
      ) as metadata
    FROM support_tickets st
    WHERE st.user_id = p_user_id

    UNION ALL

    -- Subscription events
    SELECT
      s.created_at as activity_date,
      'subscription_created' as activity_type,
      'Subscription started' as activity_description,
      'info' as severity,
      jsonb_build_object(
        'subscription_id', s.id,
        'status', s.status
      ) as metadata
    FROM subscriptions s
    WHERE s.user_id = p_user_id

    UNION ALL

    -- Payment events
    SELECT
      sp.created_at as activity_date,
      'payment_' || sp.status as activity_type,
      'Payment ' || sp.status || ': $' || sp.amount as activity_description,
      CASE sp.status
        WHEN 'succeeded' THEN 'info'
        WHEN 'failed' THEN 'error'
        ELSE 'warning'
      END as severity,
      jsonb_build_object(
        'payment_id', sp.id,
        'amount', sp.amount,
        'status', sp.status
      ) as metadata
    FROM subscription_payments sp
    WHERE sp.user_id = p_user_id
  )
  SELECT *
  FROM all_activities
  ORDER BY activity_date DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ============================================================================
-- 6. QUICK USER SEARCH FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION search_users_intelligence(
  p_search_term TEXT,
  p_filter TEXT DEFAULT NULL, -- 'at_risk', 'payment_failed', 'has_tickets', 'churned', 'vip'
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  name TEXT,
  health_score INTEGER,
  health_status TEXT,
  subscription_status TEXT,
  mrr NUMERIC,
  user_tier TEXT,
  match_rank REAL
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    aui.id,
    aui.email,
    aui.name,
    aui.health_score,
    aui.health_status,
    aui.subscription_status,
    aui.mrr,
    aui.user_tier,
    -- Simple relevance scoring
    CASE
      WHEN aui.email ILIKE p_search_term THEN 1.0
      WHEN aui.email ILIKE p_search_term || '%' THEN 0.9
      WHEN aui.email ILIKE '%' || p_search_term || '%' THEN 0.7
      WHEN aui.name ILIKE '%' || p_search_term || '%' THEN 0.6
      ELSE 0.5
    END as match_rank
  FROM admin_user_intelligence aui
  WHERE
    -- Search filter
    (
      p_search_term IS NULL OR
      p_search_term = '' OR
      aui.email ILIKE '%' || p_search_term || '%' OR
      aui.name ILIKE '%' || p_search_term || '%' OR
      aui.id::TEXT = p_search_term
    )
    -- Quick filters
    AND (
      p_filter IS NULL OR
      (p_filter = 'at_risk' AND aui.health_status IN ('at_risk', 'critical')) OR
      (p_filter = 'payment_failed' AND aui.subscription_status = 'past_due') OR
      (p_filter = 'has_tickets' AND aui.open_tickets > 0) OR
      (p_filter = 'churned' AND (aui.subscription_status IS NULL OR aui.subscription_status = 'canceled')) OR
      (p_filter = 'vip' AND aui.user_tier = 'power_user')
    )
  ORDER BY match_rank DESC, aui.health_score ASC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 7. REFRESH FUNCTION FOR MATERIALIZED VIEW
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_user_engagement_stats()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_engagement_stats;
END;
$$;

-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on views is not needed, but ensure base tables have it

-- Grant access to authenticated users (admins will be checked at app level)
GRANT SELECT ON user_engagement_stats TO authenticated;
GRANT SELECT ON user_ticket_summary TO authenticated;
GRANT SELECT ON admin_user_intelligence TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_user_health_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_activity_timeline(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION search_users_intelligence(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_user_engagement_stats() TO authenticated;

-- ============================================================================
-- 9. SCHEDULED REFRESH (Optional - requires pg_cron extension)
-- ============================================================================

-- Uncomment if pg_cron is available
-- SELECT cron.schedule(
--   'refresh-user-engagement-stats',
--   '*/15 * * * *', -- Every 15 minutes
--   $$SELECT refresh_user_engagement_stats()$$
-- );

-- ============================================================================
-- 10. INITIAL MATERIALIZED VIEW REFRESH
-- ============================================================================

REFRESH MATERIALIZED VIEW user_engagement_stats;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON MATERIALIZED VIEW user_engagement_stats IS 'Materialized view containing user engagement metrics for fast queries. Refresh every 15 minutes.';
COMMENT ON VIEW user_ticket_summary IS 'Summary of support tickets per user';
COMMENT ON VIEW admin_user_intelligence IS 'Consolidated view of all user intelligence data for admin dashboard';
COMMENT ON FUNCTION calculate_user_health_score(UUID) IS 'Calculates a health score (0-100) for a user based on engagement metrics';
COMMENT ON FUNCTION get_user_activity_timeline(UUID, INTEGER, INTEGER) IS 'Returns paginated activity timeline for a user across all systems';
COMMENT ON FUNCTION search_users_intelligence(TEXT, TEXT, INTEGER) IS 'Search users with optional filters (at_risk, payment_failed, has_tickets, churned, vip)';
