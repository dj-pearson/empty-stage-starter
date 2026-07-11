-- Agentic OS — US-496: lifecycle event detection.
-- agent_events records key user lifecycle moments so nurture automation (US-498+)
-- has reliable triggers. Additive only.

CREATE TABLE IF NOT EXISTS public.agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID,
  user_id UUID,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_events_household ON public.agent_events(household_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_type_created ON public.agent_events(event_type, created_at DESC);

-- Partial unique index: once-only events fire at most once per household. The
-- inactivity events (inactive_7d/14d/30d) are intentionally NOT covered, so they
-- can re-arm after the user becomes active again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_events_once
  ON public.agent_events(household_id, event_type)
  WHERE event_type IN (
    'signup', 'first_kid_added', 'first_plan_created', 'first_grocery_list',
    'subscription_started', 'subscription_canceled'
  );

COMMENT ON TABLE public.agent_events IS
  'Lifecycle events feeding nurture automation. Once-only events deduped by idx_agent_events_once; inactivity events re-arm.';

ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage agent events"
  ON public.agent_events FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );

-- Seed the event-detector agent (hourly, disabled by default).
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'event-detector',
  'growth',
  'Detects lifecycle events (signup, first-kid, first-plan, inactivity, subscription changes) from existing tables.',
  'Deterministic detector — no LLM generation required.',
  'claude-haiku-4-5-20251001',
  '0 * * * *',
  '{}'::jsonb,
  1,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
