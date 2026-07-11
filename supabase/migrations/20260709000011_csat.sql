-- Agentic OS — US-495: CSAT (customer satisfaction) follow-up.
-- One rating per resolved ticket + the csat agent seed. Additive only.

-- ============================================================================
-- 1. support_csat — one rating per ticket (unique enforces single-use)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.support_csat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_csat_score ON public.support_csat(score);

COMMENT ON TABLE public.support_csat IS
  'Post-resolution satisfaction ratings (1-5). ticket_id UNIQUE = one rating per ticket (single-use token).';

ALTER TABLE public.support_csat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage csat"
  ON public.support_csat FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );

-- ============================================================================
-- 2. Seed the csat agent (disabled by default)
-- ============================================================================
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'csat',
  'customer_service',
  'Sends a satisfaction rating email 24h after a ticket is resolved; escalates low scores.',
  'You draft short, warm CSAT follow-up emails. Templated — no per-ticket generation needed.',
  'claude-haiku-4-5-20251001',
  '0 * * * *',
  '{}'::jsonb,
  2,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
