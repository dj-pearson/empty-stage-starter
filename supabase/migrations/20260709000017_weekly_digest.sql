-- Agentic OS — US-501: weekly household digest opt-in + agent.
-- Additive: a nullable opt-in flag on households (safe for old clients).
ALTER TABLE public.households ADD COLUMN IF NOT EXISTS weekly_digest_opt_in BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.households.weekly_digest_opt_in IS
  'Opt-in for the weekly recap email (US-501). Default off.';

CREATE INDEX IF NOT EXISTS idx_households_weekly_digest
  ON public.households(weekly_digest_opt_in) WHERE weekly_digest_opt_in = TRUE;

-- Seed the weekly-digest agent (weekly, disabled by default).
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'weekly-digest',
  'growth',
  'Weekly recap email for opted-in active households; deterministic stats + a short encouragement line.',
  'You write a single 1-2 sentence encouragement for a weekly family meal-planning recap. Warm, specific, no greeting or signature.',
  'claude-haiku-4-5-20251001',
  '0 15 * * 0',
  '{}'::jsonb,
  3,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
