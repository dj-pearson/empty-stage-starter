-- Agentic OS — US-497: churn-risk scoring.
CREATE TABLE IF NOT EXISTS public.agent_churn_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  risk TEXT NOT NULL CHECK (risk IN ('low', 'medium', 'high')),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast "latest score per household" lookups (previous-week comparison).
CREATE INDEX IF NOT EXISTS idx_agent_churn_scores_household_scored
  ON public.agent_churn_scores(household_id, scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_churn_scores_risk ON public.agent_churn_scores(risk);

COMMENT ON TABLE public.agent_churn_scores IS
  'Weekly churn-risk scores per household (0-100 + low/medium/high) with top reasons.';

ALTER TABLE public.agent_churn_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage churn scores"
  ON public.agent_churn_scores FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );

-- Seed the churn-score agent (weekly, disabled by default).
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'churn-score',
  'growth',
  'Weekly per-household churn-risk score (0-100 + low/medium/high) with top reasons and a suggested action.',
  'You assess churn risk for EatPal households from activity features. Weigh recency of meal planning and grocery activity, subscription state, and setup completeness. Output a 0-100 score (higher = more likely to churn), a risk band, 2-4 concise reasons, and one suggested retention action. JSON only.',
  'claude-haiku-4-5-20251001',
  '0 6 * * 1',
  '{}'::jsonb,
  5,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
