-- Revenue Operations Command Center Database Schema
-- This migration creates the necessary tables and functions for revenue ops, churn prevention, and growth optimization

-- ============================================================================
-- 1. CHURN PREDICTION SCORES
-- ============================================================================

CREATE TABLE IF NOT EXISTS revenue_churn_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Churn prediction
  churn_probability NUMERIC(3,2) NOT NULL CHECK (churn_probability >= 0 AND churn_probability <= 1),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),

  -- Contributing factors (scored 0-100)
  risk_factors JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    Risk factors include:
    - engagement_score: 0-100 (low engagement = high risk)
    - feature_adoption_score: 0-100
    - error_frequency_score: 0-100
    - payment_health_score: 0-100
    - support_satisfaction_score: 0-100
  */

  -- Prediction metadata
  model_version TEXT DEFAULT 'rule_based_v1',
  confidence_score NUMERIC(3,2),

  -- Temporal tracking
  last_calculated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prediction_expires TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',

  -- Historical tracking
  previous_probability NUMERIC(3,2),
  trend TEXT CHECK (trend IN ('improving', 'stable', 'declining')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

CREATE INDEX idx_churn_predictions_user_id ON revenue_churn_predictions(user_id);
CREATE INDEX idx_churn_predictions_risk_level ON revenue_churn_predictions(risk_level);
CREATE INDEX idx_churn_predictions_expires ON revenue_churn_predictions(prediction_expires);

-- ============================================================================
-- 2. AUTOMATED REVENUE INTERVENTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS revenue_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Intervention details
  intervention_type TEXT NOT NULL CHECK (intervention_type IN (
    'win_back_email',
    'feature_nudge',
    'payment_recovery',
    'upsell_annual',
    'retention_discount',
    'onboarding_reminder',
    'success_call',
    'churn_survey'
  )),

  -- Campaign tracking
  campaign_id UUID,
  campaign_name TEXT,

  -- Trigger information
  triggered_by TEXT CHECK (triggered_by IN ('churn_risk', 'payment_failure', 'low_engagement', 'manual')),
  trigger_data JSONB DEFAULT '{}'::jsonb,

  -- Execution
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'sent',
    'engaged',
    'converted',
    'failed',
    'cancelled'
  )),

  -- Results
  result_data JSONB DEFAULT '{}'::jsonb,
  /*
    Result data includes:
    - email_opened: boolean
    - email_clicked: boolean
    - conversion_achieved: boolean
    - revenue_retained: numeric
    - churn_prevented: boolean
  */

  -- Effectiveness
  engagement_score NUMERIC(3,2), -- How engaged was the user with intervention
  conversion_achieved BOOLEAN DEFAULT false,
  revenue_impact NUMERIC(10,2), -- Estimated revenue saved/generated

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interventions_user_id ON revenue_interventions(user_id);
CREATE INDEX idx_interventions_type ON revenue_interventions(intervention_type);
CREATE INDEX idx_interventions_status ON revenue_interventions(status);
CREATE INDEX idx_interventions_scheduled ON revenue_interventions(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_interventions_triggered ON revenue_interventions(triggered_at);

-- ============================================================================
-- 3. PAYMENT RECOVERY & DUNNING
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_recovery_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Payment failure details
  payment_intent_id TEXT,
  failure_reason TEXT,
  failure_code TEXT,
  failed_amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',

  -- Recovery attempt
  attempt_number INTEGER NOT NULL DEFAULT 1,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_retry_at TIMESTAMPTZ,

  -- Result
  result TEXT NOT NULL CHECK (result IN ('success', 'failed', 'pending')),
  recovery_method TEXT, -- 'auto_retry', 'updated_payment_method', 'manual'

  -- Dunning communication
  dunning_email_sent BOOLEAN DEFAULT false,
  dunning_email_sent_at TIMESTAMPTZ,
  payment_method_updated BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_recovery_subscription ON payment_recovery_attempts(subscription_id);
CREATE INDEX idx_payment_recovery_user ON payment_recovery_attempts(user_id);
CREATE INDEX idx_payment_recovery_next_retry ON payment_recovery_attempts(next_retry_at) WHERE result = 'pending';

-- ============================================================================
-- 4. REVENUE COHORTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS revenue_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_month DATE NOT NULL, -- First day of signup month
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Acquisition data
  acquisition_channel TEXT, -- 'organic', 'paid', 'referral', 'social', etc.
  initial_plan TEXT,
  initial_mrr NUMERIC(10,2),

  -- Lifetime tracking
  total_revenue NUMERIC(10,2) DEFAULT 0,
  total_payments INTEGER DEFAULT 0,
  churned_at TIMESTAMPTZ,
  churn_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(cohort_month, user_id)
);

CREATE INDEX idx_cohorts_month ON revenue_cohorts(cohort_month);
CREATE INDEX idx_cohorts_user ON revenue_cohorts(user_id);
CREATE INDEX idx_cohorts_channel ON revenue_cohorts(acquisition_channel);
CREATE INDEX idx_cohorts_churned ON revenue_cohorts(churned_at);

-- ============================================================================
-- 5. REVENUE FORECASTS (Cached Predictions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS revenue_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Forecast metadata
  forecast_date DATE NOT NULL, -- Date forecast was generated
  forecast_month DATE NOT NULL, -- Month being forecasted
  scenario TEXT NOT NULL CHECK (scenario IN ('conservative', 'base', 'optimistic')),

  -- Predictions
  predicted_mrr NUMERIC(10,2) NOT NULL,
  predicted_arr NUMERIC(10,2) NOT NULL,
  predicted_new_customers INTEGER,
  predicted_churned_customers INTEGER,
  predicted_churn_rate NUMERIC(5,4),

  -- Assumptions used
  assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  /*
    Assumptions include:
    - growth_rate: numeric
    - churn_rate: numeric
    - avg_subscription_value: numeric
    - new_signups_per_month: integer
  */

  -- Confidence
  confidence_level NUMERIC(3,2),

  generated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(forecast_date, forecast_month, scenario)
);

CREATE INDEX idx_forecasts_month ON revenue_forecasts(forecast_month);
CREATE INDEX idx_forecasts_scenario ON revenue_forecasts(scenario);
CREATE INDEX idx_forecasts_generated ON revenue_forecasts(generated_at);

-- ============================================================================
-- 6. MATERIALIZED VIEW: COHORT RETENTION ANALYSIS
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS revenue_cohort_retention AS
WITH cohort_data AS (
  SELECT
    DATE_TRUNC('month', p.created_at)::DATE as cohort_month,
    p.id as user_id,
    p.created_at as signup_date,
    s.id as subscription_id,
    s.status as subscription_status,
    s.created_at as subscription_start,
    CASE 
      WHEN s.status = 'canceled' THEN s.updated_at
      ELSE NULL 
    END as subscription_end,
    COALESCE(sp.price_monthly, 0) as mrr
  FROM profiles p
  LEFT JOIN user_subscriptions s ON p.id = s.user_id
  LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
  WHERE p.created_at >= NOW() - INTERVAL '12 months'
),
monthly_retention AS (
  SELECT
    cd.cohort_month,
    COUNT(DISTINCT cd.user_id) as cohort_size,
    SUM(cd.mrr) as cohort_initial_mrr,

    -- Month 0 (signup month)
    COUNT(DISTINCT cd.user_id) as m0_users,
    SUM(CASE WHEN cd.subscription_status IN ('active', 'trialing') THEN cd.mrr ELSE 0 END) as m0_mrr,

    -- Month 1
    COUNT(DISTINCT CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '1 month')
      THEN cd.user_id END) as m1_users,
    SUM(CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '1 month')
      THEN cd.mrr ELSE 0 END) as m1_mrr,

    -- Month 2
    COUNT(DISTINCT CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '2 months')
      THEN cd.user_id END) as m2_users,
    SUM(CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '2 months')
      THEN cd.mrr ELSE 0 END) as m2_mrr,

    -- Month 3
    COUNT(DISTINCT CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '3 months')
      THEN cd.user_id END) as m3_users,
    SUM(CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '3 months')
      THEN cd.mrr ELSE 0 END) as m3_mrr,

    -- Month 6
    COUNT(DISTINCT CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '6 months')
      THEN cd.user_id END) as m6_users,
    SUM(CASE
      WHEN cd.subscription_status IN ('active', 'trialing')
      AND (cd.subscription_end IS NULL OR cd.subscription_end >= cd.signup_date + INTERVAL '6 months')
      THEN cd.mrr ELSE 0 END) as m6_mrr,

    -- Average LTV calculation
    AVG(CASE
      WHEN cd.subscription_end IS NOT NULL
      THEN EXTRACT(EPOCH FROM (cd.subscription_end - cd.subscription_start)) / (86400 * 30) * cd.mrr
      ELSE EXTRACT(EPOCH FROM (NOW() - cd.subscription_start)) / (86400 * 30) * cd.mrr
    END) as avg_ltv

  FROM cohort_data cd
  GROUP BY cd.cohort_month
)
SELECT
  mr.cohort_month,
  mr.cohort_size,
  mr.cohort_initial_mrr,

  -- Retention percentages
  ROUND(mr.m0_users::NUMERIC / NULLIF(mr.cohort_size, 0) * 100, 1) as m0_retention_pct,
  ROUND(mr.m1_users::NUMERIC / NULLIF(mr.cohort_size, 0) * 100, 1) as m1_retention_pct,
  ROUND(mr.m2_users::NUMERIC / NULLIF(mr.cohort_size, 0) * 100, 1) as m2_retention_pct,
  ROUND(mr.m3_users::NUMERIC / NULLIF(mr.cohort_size, 0) * 100, 1) as m3_retention_pct,
  ROUND(mr.m6_users::NUMERIC / NULLIF(mr.cohort_size, 0) * 100, 1) as m6_retention_pct,

  -- MRR retention
  mr.m0_mrr,
  mr.m1_mrr,
  mr.m2_mrr,
  mr.m3_mrr,
  mr.m6_mrr,

  -- LTV
  ROUND(mr.avg_ltv, 2) as avg_ltv

FROM monthly_retention mr
ORDER BY mr.cohort_month DESC;

CREATE UNIQUE INDEX idx_cohort_retention_month ON revenue_cohort_retention(cohort_month);

-- ============================================================================
-- 7. MATERIALIZED VIEW: REVENUE METRICS DAILY
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS revenue_metrics_daily AS
WITH daily_metrics AS (
  SELECT
    DATE(s.created_at) as metric_date,

    -- MRR calculation (active subscriptions)
    COUNT(DISTINCT CASE WHEN s.status IN ('active', 'trialing') THEN s.id END) as active_subscriptions,
    SUM(CASE
      WHEN s.status IN ('active', 'trialing')
      THEN (SELECT price_monthly FROM subscription_plans WHERE id = s.plan_id)
      ELSE 0
    END) as mrr,

    -- New subscriptions
    COUNT(CASE WHEN DATE(s.created_at) = DATE(NOW()) THEN 1 END) as new_subscriptions_today,

    -- Churned subscriptions (using updated_at when status became 'canceled')
    COUNT(CASE WHEN s.status = 'canceled' AND DATE(s.updated_at) = DATE(NOW()) THEN 1 END) as churned_subscriptions_today,

    -- Revenue
    SUM(CASE WHEN DATE(s.created_at) = DATE(NOW()) THEN
      (SELECT price_monthly FROM subscription_plans WHERE id = s.plan_id)
    ELSE 0 END) as new_mrr_today,

    SUM(CASE WHEN s.status = 'canceled' AND DATE(s.updated_at) = DATE(NOW()) THEN
      (SELECT price_monthly FROM subscription_plans WHERE id = s.plan_id)
    ELSE 0 END) as churned_mrr_today

  FROM user_subscriptions s
  WHERE s.created_at >= NOW() - INTERVAL '90 days'
  GROUP BY DATE(s.created_at)
)
SELECT
  dm.metric_date,
  dm.active_subscriptions,
  dm.mrr,
  dm.mrr * 12 as arr,
  dm.new_subscriptions_today,
  dm.churned_subscriptions_today,
  dm.new_mrr_today,
  dm.churned_mrr_today,
  dm.new_mrr_today - dm.churned_mrr_today as net_new_mrr,

  -- Growth rates
  ROUND(
    (dm.mrr - LAG(dm.mrr) OVER (ORDER BY dm.metric_date)) /
    NULLIF(LAG(dm.mrr) OVER (ORDER BY dm.metric_date), 0) * 100,
    2
  ) as mrr_growth_pct,

  -- Churn rate (trailing 30 days)
  ROUND(
    dm.churned_subscriptions_today::NUMERIC /
    NULLIF(dm.active_subscriptions, 0) * 100,
    2
  ) as churn_rate_pct

FROM daily_metrics dm
ORDER BY dm.metric_date DESC;

CREATE UNIQUE INDEX idx_revenue_metrics_date ON revenue_metrics_daily(metric_date);

-- ============================================================================
-- 8. FUNCTION: CALCULATE CHURN PROBABILITY
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_churn_probability(p_user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_probability NUMERIC := 0.0;
  v_engagement_score INTEGER;
  v_feature_adoption INTEGER;
  v_error_frequency INTEGER;
  v_payment_health INTEGER;
  v_days_since_login INTEGER;
  v_subscription_status TEXT;
  v_cancel_attempts INTEGER;
BEGIN
  -- Get user intelligence data
  SELECT
    health_score,
    features_adopted,
    errors_7d,
    subscription_status,
    EXTRACT(DAY FROM NOW() - last_login)::INTEGER
  INTO
    v_engagement_score,
    v_feature_adoption,
    v_error_frequency,
    v_subscription_status,
    v_days_since_login
  FROM admin_user_intelligence
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RETURN 0.5; -- Default probability if no data
  END IF;

  -- Calculate churn probability based on signals (0.0 to 1.0)

  -- Engagement score (inverse - low score = high churn risk)
  v_probability := v_probability + ((100 - COALESCE(v_engagement_score, 50)) / 100.0 * 0.3);

  -- Days since last login
  IF v_days_since_login > 30 THEN
    v_probability := v_probability + 0.25;
  ELSIF v_days_since_login > 14 THEN
    v_probability := v_probability + 0.15;
  ELSIF v_days_since_login > 7 THEN
    v_probability := v_probability + 0.08;
  END IF;

  -- Feature adoption (low adoption = higher risk)
  IF COALESCE(v_feature_adoption, 0) < 2 THEN
    v_probability := v_probability + 0.15;
  ELSIF v_feature_adoption < 4 THEN
    v_probability := v_probability + 0.08;
  END IF;

  -- Error frequency
  IF COALESCE(v_error_frequency, 0) > 5 THEN
    v_probability := v_probability + 0.12;
  ELSIF v_error_frequency > 2 THEN
    v_probability := v_probability + 0.06;
  END IF;

  -- Subscription status
  IF v_subscription_status = 'past_due' THEN
    v_probability := v_probability + 0.20;
  ELSIF v_subscription_status = 'canceled' THEN
    RETURN 1.0; -- Already churned
  END IF;

  -- Check for cancel attempts
  SELECT COUNT(*)
  INTO v_cancel_attempts
  FROM admin_live_activity
  WHERE user_id = p_user_id
    AND activity_type = 'subscription_cancel_attempt'
    AND created_at > NOW() - INTERVAL '30 days';

  IF v_cancel_attempts > 0 THEN
    v_probability := v_probability + 0.18;
  END IF;

  -- Ensure probability is between 0 and 1
  RETURN LEAST(1.0, GREATEST(0.0, v_probability));
END;
$$;

-- ============================================================================
-- 9. FUNCTION: UPDATE CHURN PREDICTIONS FOR ALL USERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_all_churn_predictions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_user RECORD;
  v_probability NUMERIC;
  v_risk_level TEXT;
  v_previous_prob NUMERIC;
  v_trend TEXT;
BEGIN
  -- Loop through active subscription users
  FOR v_user IN
    SELECT DISTINCT p.id as user_id
    FROM profiles p
    JOIN user_subscriptions s ON p.id = s.user_id
    WHERE s.status IN ('active', 'trialing', 'past_due')
  LOOP
    -- Calculate churn probability
    v_probability := calculate_churn_probability(v_user.user_id);

    -- Determine risk level
    IF v_probability >= 0.7 THEN
      v_risk_level := 'critical';
    ELSIF v_probability >= 0.5 THEN
      v_risk_level := 'high';
    ELSIF v_probability >= 0.3 THEN
      v_risk_level := 'medium';
    ELSE
      v_risk_level := 'low';
    END IF;

    -- Get previous probability
    SELECT churn_probability INTO v_previous_prob
    FROM revenue_churn_predictions
    WHERE user_id = v_user.user_id;

    -- Determine trend
    IF v_previous_prob IS NOT NULL THEN
      IF v_probability < v_previous_prob - 0.1 THEN
        v_trend := 'improving';
      ELSIF v_probability > v_previous_prob + 0.1 THEN
        v_trend := 'declining';
      ELSE
        v_trend := 'stable';
      END IF;
    ELSE
      v_trend := 'stable';
    END IF;

    -- Upsert prediction
    INSERT INTO revenue_churn_predictions (
      user_id,
      churn_probability,
      risk_level,
      risk_factors,
      previous_probability,
      trend,
      last_calculated,
      prediction_expires
    ) VALUES (
      v_user.user_id,
      v_probability,
      v_risk_level,
      '{}'::jsonb, -- TODO: Add detailed risk factors
      v_previous_prob,
      v_trend,
      NOW(),
      NOW() + INTERVAL '7 days'
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      churn_probability = EXCLUDED.churn_probability,
      risk_level = EXCLUDED.risk_level,
      previous_probability = EXCLUDED.previous_probability,
      trend = EXCLUDED.trend,
      last_calculated = EXCLUDED.last_calculated,
      prediction_expires = EXCLUDED.prediction_expires,
      updated_at = NOW();

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN v_updated_count;
END;
$$;

-- ============================================================================
-- 10. FUNCTION: TRIGGER INTERVENTION FOR AT-RISK USERS
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_churn_interventions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_triggered_count INTEGER := 0;
  v_user RECORD;
BEGIN
  -- Find high-risk users without recent interventions
  FOR v_user IN
    SELECT
      rcp.user_id,
      rcp.churn_probability,
      rcp.risk_level,
      aui.subscription_status,
      aui.last_login
    FROM revenue_churn_predictions rcp
    JOIN admin_user_intelligence aui ON rcp.user_id = aui.id
    WHERE rcp.risk_level IN ('high', 'critical')
      AND rcp.churn_probability >= 0.5
      -- No intervention in last 7 days
      AND NOT EXISTS (
        SELECT 1 FROM revenue_interventions
        WHERE user_id = rcp.user_id
          AND triggered_at > NOW() - INTERVAL '7 days'
          AND intervention_type = 'win_back_email'
      )
    LIMIT 50 -- Process in batches
  LOOP
    -- Create win-back intervention
    INSERT INTO revenue_interventions (
      user_id,
      intervention_type,
      triggered_by,
      trigger_data,
      scheduled_for,
      status
    ) VALUES (
      v_user.user_id,
      'win_back_email',
      'churn_risk',
      jsonb_build_object(
        'churn_probability', v_user.churn_probability,
        'risk_level', v_user.risk_level
      ),
      NOW() + INTERVAL '1 hour', -- Schedule for 1 hour from now
      'scheduled'
    );

    v_triggered_count := v_triggered_count + 1;
  END LOOP;

  RETURN v_triggered_count;
END;
$$;

-- ============================================================================
-- 11. FUNCTION: SCHEDULE PAYMENT RETRY
-- ============================================================================

CREATE OR REPLACE FUNCTION schedule_payment_retry(
  p_subscription_id UUID,
  p_user_id UUID,
  p_failed_amount NUMERIC,
  p_failure_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_attempt_id UUID;
  v_attempt_count INTEGER;
  v_next_retry TIMESTAMPTZ;
BEGIN
  -- Count existing attempts
  SELECT COUNT(*) INTO v_attempt_count
  FROM payment_recovery_attempts
  WHERE subscription_id = p_subscription_id
    AND result = 'failed';

  -- Calculate next retry time based on attempt number
  CASE v_attempt_count + 1
    WHEN 1 THEN v_next_retry := NOW() + INTERVAL '3 days';
    WHEN 2 THEN v_next_retry := NOW() + INTERVAL '7 days';
    WHEN 3 THEN v_next_retry := NOW() + INTERVAL '14 days';
    ELSE v_next_retry := NULL; -- No more retries
  END CASE;

  -- Create recovery attempt record
  INSERT INTO payment_recovery_attempts (
    subscription_id,
    user_id,
    failure_reason,
    failed_amount,
    attempt_number,
    next_retry_at,
    result
  ) VALUES (
    p_subscription_id,
    p_user_id,
    p_failure_reason,
    p_failed_amount,
    v_attempt_count + 1,
    v_next_retry,
    'pending'
  )
  RETURNING id INTO v_attempt_id;

  -- Create dunning intervention
  INSERT INTO revenue_interventions (
    user_id,
    intervention_type,
    triggered_by,
    trigger_data,
    scheduled_for,
    status
  ) VALUES (
    p_user_id,
    'payment_recovery',
    'payment_failure',
    jsonb_build_object(
      'attempt_number', v_attempt_count + 1,
      'failed_amount', p_failed_amount,
      'failure_reason', p_failure_reason
    ),
    NOW() + INTERVAL '1 hour',
    'scheduled'
  );

  RETURN v_attempt_id;
END;
$$;

-- ============================================================================
-- 12. FUNCTION: REFRESH MATERIALIZED VIEWS
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_revenue_metrics()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY revenue_cohort_retention;
  REFRESH MATERIALIZED VIEW CONCURRENTLY revenue_metrics_daily;
END;
$$;

-- ============================================================================
-- 13. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE revenue_churn_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_recovery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_forecasts ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY revenue_churn_admin ON revenue_churn_predictions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY revenue_interventions_admin ON revenue_interventions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY payment_recovery_admin ON payment_recovery_attempts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY revenue_cohorts_admin ON revenue_cohorts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY revenue_forecasts_admin ON revenue_forecasts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- 14. GRANTS
-- ============================================================================

GRANT SELECT ON revenue_cohort_retention TO authenticated;
GRANT SELECT ON revenue_metrics_daily TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_churn_probability(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION update_all_churn_predictions() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_churn_interventions() TO authenticated;
GRANT EXECUTE ON FUNCTION schedule_payment_retry(UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_revenue_metrics() TO authenticated;

-- ============================================================================
-- 15. INITIAL DATA & CRON JOBS (Comments for setup)
-- ============================================================================

-- Run initial churn prediction calculation
SELECT update_all_churn_predictions();

-- Initial materialized view refresh
SELECT refresh_revenue_metrics();

-- Setup cron jobs (requires pg_cron extension):
-- Daily churn prediction update:
-- SELECT cron.schedule('update-churn-predictions', '0 2 * * *', $$SELECT update_all_churn_predictions()$$);

-- Daily intervention triggers:
-- SELECT cron.schedule('trigger-interventions', '0 8 * * *', $$SELECT trigger_churn_interventions()$$);

-- Hourly metrics refresh:
-- SELECT cron.schedule('refresh-revenue-metrics', '0 * * * *', $$SELECT refresh_revenue_metrics()$$);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON TABLE revenue_churn_predictions IS 'ML-based churn prediction scores for active subscribers with risk factors and trending';
COMMENT ON TABLE revenue_interventions IS 'Automated intervention campaigns for churn prevention, upsells, and engagement';
COMMENT ON TABLE payment_recovery_attempts IS 'Smart dunning management with automatic retry scheduling';
COMMENT ON TABLE revenue_cohorts IS 'User cohort tracking for retention analysis and LTV calculation';
COMMENT ON TABLE revenue_forecasts IS 'Revenue forecasting with multiple scenarios (conservative, base, optimistic)';
COMMENT ON MATERIALIZED VIEW revenue_cohort_retention IS 'Cohort retention analysis by month with MRR and LTV metrics';
COMMENT ON MATERIALIZED VIEW revenue_metrics_daily IS 'Daily revenue metrics including MRR, ARR, growth rate, and churn rate';
COMMENT ON FUNCTION calculate_churn_probability(UUID) IS 'Calculates churn probability (0-1) for a user based on engagement, errors, and payment health';
COMMENT ON FUNCTION update_all_churn_predictions() IS 'Batch update churn predictions for all active subscribers';
COMMENT ON FUNCTION trigger_churn_interventions() IS 'Automatically trigger win-back interventions for high-risk users';
COMMENT ON FUNCTION schedule_payment_retry(UUID, UUID, NUMERIC, TEXT) IS 'Schedule smart payment retry with exponential backoff (3d, 7d, 14d)';
