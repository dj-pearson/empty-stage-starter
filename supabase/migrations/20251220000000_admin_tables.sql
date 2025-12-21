-- Admin Tables Migration
-- Creates tables for admin dashboard components that were using @ts-nocheck
-- These tables enable: alerts, system health monitoring, CRM integration,
-- workflow automation, and revenue operations.

-- ============================================================================
-- 1. Admin Alerts Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL, -- e.g., 'payment_failed', 'high_churn_risk', 'api_error', 'security'
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  alert_data JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT FALSE,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for admin_alerts
CREATE INDEX IF NOT EXISTS idx_admin_alerts_severity ON public.admin_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_created_at ON public.admin_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_unresolved ON public.admin_alerts(is_resolved) WHERE is_resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_admin_alerts_unread ON public.admin_alerts(is_read) WHERE is_read = FALSE;

-- RLS for admin_alerts
ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view alerts"
  ON public.admin_alerts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage alerts"
  ON public.admin_alerts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Enable realtime for alerts
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_alerts;

-- ============================================================================
-- 2. Admin System Health Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admin_system_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type TEXT NOT NULL, -- e.g., 'api_response_time_p50', 'error_rate', 'ai_cost_daily'
  metric_value NUMERIC NOT NULL,
  metric_unit TEXT, -- e.g., 'ms', '%', '$', 'count'
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for system health
CREATE INDEX IF NOT EXISTS idx_admin_system_health_type ON public.admin_system_health(metric_type);
CREATE INDEX IF NOT EXISTS idx_admin_system_health_recorded ON public.admin_system_health(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_system_health_type_time ON public.admin_system_health(metric_type, recorded_at DESC);

-- RLS for system health
ALTER TABLE public.admin_system_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view system health"
  ON public.admin_system_health FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "System can insert metrics"
  ON public.admin_system_health FOR INSERT
  WITH CHECK (TRUE); -- Allow Edge Functions to insert via service role

-- ============================================================================
-- 3. CRM Integration Tables
-- ============================================================================

-- CRM Connections
CREATE TABLE IF NOT EXISTS public.crm_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('hubspot', 'salesforce')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  api_key_encrypted TEXT, -- Encrypted API key
  instance_url TEXT,
  last_sync TIMESTAMPTZ,
  sync_enabled BOOLEAN DEFAULT FALSE,
  field_mappings JSONB DEFAULT '[]'::jsonb,
  sync_settings JSONB DEFAULT '{
    "sync_frequency": "daily",
    "sync_on_create": true,
    "sync_on_update": true,
    "sync_on_delete": false
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CRM Sync Logs
CREATE TABLE IF NOT EXISTS public.crm_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.crm_connections(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('push', 'pull')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
  records_processed INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for CRM tables
CREATE INDEX IF NOT EXISTS idx_crm_connections_provider ON public.crm_connections(provider);
CREATE INDEX IF NOT EXISTS idx_crm_connections_status ON public.crm_connections(status);
CREATE INDEX IF NOT EXISTS idx_crm_sync_logs_connection ON public.crm_sync_logs(connection_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_logs_created ON public.crm_sync_logs(created_at DESC);

-- RLS for CRM tables
ALTER TABLE public.crm_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage CRM connections"
  ON public.crm_connections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can view sync logs"
  ON public.crm_sync_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "System can insert sync logs"
  ON public.crm_sync_logs FOR INSERT
  WITH CHECK (TRUE); -- Allow Edge Functions to insert via service role

-- ============================================================================
-- 4. Automation Workflows Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.automation_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT FALSE,
  trigger_type TEXT NOT NULL, -- e.g., 'lead_created', 'trial_started', 'subscription_canceled'
  trigger_config JSONB DEFAULT '{}'::jsonb,
  nodes JSONB DEFAULT '[]'::jsonb, -- Array of workflow nodes
  stats JSONB DEFAULT '{"runs": 0, "successful": 0, "failed": 0}'::jsonb,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow execution logs
CREATE TABLE IF NOT EXISTS public.workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
  trigger_data JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  current_node INTEGER DEFAULT 0,
  execution_log JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes for workflows
CREATE INDEX IF NOT EXISTS idx_automation_workflows_active ON public.automation_workflows(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_automation_workflows_trigger ON public.automation_workflows(trigger_type);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow ON public.workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON public.workflow_executions(status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_started ON public.workflow_executions(started_at DESC);

-- RLS for workflows
ALTER TABLE public.automation_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage workflows"
  ON public.automation_workflows FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can view executions"
  ON public.workflow_executions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "System can manage executions"
  ON public.workflow_executions FOR ALL
  WITH CHECK (TRUE); -- Allow Edge Functions via service role

-- ============================================================================
-- 5. Revenue Operations Tables
-- ============================================================================

-- Daily revenue metrics
CREATE TABLE IF NOT EXISTS public.revenue_metrics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL UNIQUE,
  active_subscriptions INTEGER DEFAULT 0,
  mrr NUMERIC(12, 2) DEFAULT 0,
  arr NUMERIC(12, 2) DEFAULT 0,
  new_subscriptions_today INTEGER DEFAULT 0,
  churned_subscriptions_today INTEGER DEFAULT 0,
  net_new_mrr NUMERIC(12, 2) DEFAULT 0,
  mrr_growth_pct NUMERIC(5, 2) DEFAULT 0,
  churn_rate_pct NUMERIC(5, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Churn predictions
CREATE TABLE IF NOT EXISTS public.revenue_churn_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  churn_probability NUMERIC(5, 4) NOT NULL CHECK (churn_probability >= 0 AND churn_probability <= 1),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_factors JSONB DEFAULT '{}'::jsonb,
  trend TEXT DEFAULT 'stable' CHECK (trend IN ('improving', 'stable', 'declining')),
  last_calculated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Revenue interventions (actions taken to prevent churn)
CREATE TABLE IF NOT EXISTS public.revenue_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intervention_type TEXT NOT NULL, -- e.g., 'discount_offered', 'personal_outreach', 'feature_unlock'
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'accepted', 'declined', 'expired')),
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  executed_at TIMESTAMPTZ,
  conversion_achieved BOOLEAN DEFAULT FALSE,
  revenue_impact NUMERIC(12, 2) DEFAULT 0,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cohort retention analysis
CREATE TABLE IF NOT EXISTS public.revenue_cohort_retention (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_month DATE NOT NULL UNIQUE,
  cohort_size INTEGER DEFAULT 0,
  m0_retention_pct NUMERIC(5, 2) DEFAULT 100,
  m1_retention_pct NUMERIC(5, 2),
  m2_retention_pct NUMERIC(5, 2),
  m3_retention_pct NUMERIC(5, 2),
  m6_retention_pct NUMERIC(5, 2),
  m12_retention_pct NUMERIC(5, 2),
  avg_ltv NUMERIC(12, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for revenue tables
CREATE INDEX IF NOT EXISTS idx_revenue_metrics_date ON public.revenue_metrics_daily(metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_churn_user ON public.revenue_churn_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_revenue_churn_risk ON public.revenue_churn_predictions(risk_level);
CREATE INDEX IF NOT EXISTS idx_revenue_interventions_user ON public.revenue_interventions(user_id);
CREATE INDEX IF NOT EXISTS idx_revenue_interventions_status ON public.revenue_interventions(status);
CREATE INDEX IF NOT EXISTS idx_revenue_cohort_month ON public.revenue_cohort_retention(cohort_month DESC);

-- RLS for revenue tables
ALTER TABLE public.revenue_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_churn_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_cohort_retention ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view revenue metrics"
  ON public.revenue_metrics_daily FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can view churn predictions"
  ON public.revenue_churn_predictions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage interventions"
  ON public.revenue_interventions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can view cohort data"
  ON public.revenue_cohort_retention FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- System policies for automated updates
CREATE POLICY "System can update revenue metrics"
  ON public.revenue_metrics_daily FOR ALL
  WITH CHECK (TRUE);

CREATE POLICY "System can update churn predictions"
  ON public.revenue_churn_predictions FOR ALL
  WITH CHECK (TRUE);

CREATE POLICY "System can update cohort data"
  ON public.revenue_cohort_retention FOR ALL
  WITH CHECK (TRUE);

-- ============================================================================
-- 6. Quiz Responses Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.quiz_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  personality_type TEXT NOT NULL,
  secondary_type TEXT,
  scores JSONB DEFAULT '{}'::jsonb,
  completion_time_seconds INTEGER,
  email TEXT,
  child_name TEXT,
  parent_name TEXT,
  email_captured BOOLEAN DEFAULT FALSE,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  ab_test_variant TEXT,
  device_type TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quiz leads table (for marketing)
CREATE TABLE IF NOT EXISTS public.quiz_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  child_name TEXT,
  parent_name TEXT,
  quiz_response_id UUID REFERENCES public.quiz_responses(id),
  personality_type TEXT,
  accepts_marketing BOOLEAN DEFAULT FALSE,
  referral_code TEXT UNIQUE,
  converted_to_user BOOLEAN DEFAULT FALSE,
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for quiz tables
CREATE INDEX IF NOT EXISTS idx_quiz_responses_session ON public.quiz_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_user ON public.quiz_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_type ON public.quiz_responses(personality_type);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_created ON public.quiz_responses(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_leads_email ON public.quiz_leads(email);
CREATE INDEX IF NOT EXISTS idx_quiz_leads_referral ON public.quiz_leads(referral_code);

-- RLS for quiz tables
ALTER TABLE public.quiz_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_leads ENABLE ROW LEVEL SECURITY;

-- Allow anonymous quiz submissions
CREATE POLICY "Anyone can insert quiz responses"
  ON public.quiz_responses FOR INSERT
  WITH CHECK (TRUE);

-- Users can view their own responses
CREATE POLICY "Users can view own quiz responses"
  ON public.quiz_responses FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Admins can view all quiz data
CREATE POLICY "Admins can view all quiz data"
  ON public.quiz_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Anyone can insert quiz leads"
  ON public.quiz_leads FOR INSERT
  WITH CHECK (TRUE);

CREATE POLICY "Admins can manage quiz leads"
  ON public.quiz_leads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- ============================================================================
-- 7. Helper Functions
-- ============================================================================

-- Function to calculate churn probability
CREATE OR REPLACE FUNCTION calculate_churn_risk(p_user_id UUID)
RETURNS TABLE (
  probability NUMERIC,
  risk_level TEXT,
  factors JSONB
) AS $$
DECLARE
  v_last_login TIMESTAMPTZ;
  v_days_since_login INTEGER;
  v_subscription_age INTEGER;
  v_support_tickets INTEGER;
  v_feature_usage_score NUMERIC;
  v_probability NUMERIC;
  v_risk_level TEXT;
  v_factors JSONB;
BEGIN
  -- Get user activity metrics
  SELECT last_sign_in_at INTO v_last_login
  FROM auth.users WHERE id = p_user_id;

  v_days_since_login := COALESCE(
    EXTRACT(DAY FROM NOW() - v_last_login)::INTEGER,
    30
  );

  -- Calculate probability based on factors
  v_probability := 0;
  v_factors := '{}'::jsonb;

  -- Days since login (max 40% contribution)
  IF v_days_since_login > 14 THEN
    v_probability := v_probability + LEAST(v_days_since_login::NUMERIC / 75, 0.4);
    v_factors := v_factors || jsonb_build_object('inactivity', v_days_since_login || ' days since login');
  END IF;

  -- Cap probability at 0.95
  v_probability := LEAST(v_probability, 0.95);

  -- Determine risk level
  v_risk_level := CASE
    WHEN v_probability >= 0.75 THEN 'critical'
    WHEN v_probability >= 0.5 THEN 'high'
    WHEN v_probability >= 0.25 THEN 'medium'
    ELSE 'low'
  END;

  RETURN QUERY SELECT v_probability, v_risk_level, v_factors;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update all churn predictions
CREATE OR REPLACE FUNCTION update_all_churn_predictions()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_user RECORD;
  v_result RECORD;
BEGIN
  FOR v_user IN
    SELECT DISTINCT us.user_id
    FROM public.user_subscriptions us
    WHERE us.status = 'active'
  LOOP
    SELECT * INTO v_result FROM calculate_churn_risk(v_user.user_id);

    INSERT INTO public.revenue_churn_predictions
      (user_id, churn_probability, risk_level, risk_factors, last_calculated)
    VALUES
      (v_user.user_id, v_result.probability, v_result.risk_level, v_result.factors, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      churn_probability = EXCLUDED.churn_probability,
      risk_level = EXCLUDED.risk_level,
      risk_factors = EXCLUDED.risk_factors,
      last_calculated = NOW();

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to trigger churn interventions
CREATE OR REPLACE FUNCTION trigger_churn_interventions()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_prediction RECORD;
BEGIN
  FOR v_prediction IN
    SELECT rcp.*
    FROM public.revenue_churn_predictions rcp
    WHERE rcp.risk_level IN ('high', 'critical')
    AND NOT EXISTS (
      SELECT 1 FROM public.revenue_interventions ri
      WHERE ri.user_id = rcp.user_id
      AND ri.status IN ('pending', 'sent')
      AND ri.created_at > NOW() - INTERVAL '7 days'
    )
  LOOP
    INSERT INTO public.revenue_interventions
      (user_id, intervention_type, status, triggered_at)
    VALUES
      (v_prediction.user_id,
       CASE WHEN v_prediction.risk_level = 'critical' THEN 'discount_offered' ELSE 'personal_outreach' END,
       'pending',
       NOW());

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. Comments
-- ============================================================================
COMMENT ON TABLE public.admin_alerts IS 'System alerts for admin dashboard';
COMMENT ON TABLE public.admin_system_health IS 'System health metrics for monitoring';
COMMENT ON TABLE public.crm_connections IS 'CRM integration connections (HubSpot, Salesforce)';
COMMENT ON TABLE public.crm_sync_logs IS 'CRM sync operation logs';
COMMENT ON TABLE public.automation_workflows IS 'Automation workflow definitions';
COMMENT ON TABLE public.workflow_executions IS 'Workflow execution history';
COMMENT ON TABLE public.revenue_metrics_daily IS 'Daily revenue and subscription metrics';
COMMENT ON TABLE public.revenue_churn_predictions IS 'ML-based churn predictions per user';
COMMENT ON TABLE public.revenue_interventions IS 'Churn prevention interventions';
COMMENT ON TABLE public.revenue_cohort_retention IS 'Monthly cohort retention analysis';
COMMENT ON TABLE public.quiz_responses IS 'Picky eater quiz responses';
COMMENT ON TABLE public.quiz_leads IS 'Email leads from quiz completions';
