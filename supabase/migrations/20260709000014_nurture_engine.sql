-- Agentic OS — US-498: nurture sequence engine schema.
-- Sequences, enrollments, and an email suppression list. Additive only.

-- ============================================================================
-- 1. nurture_sequences
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.nurture_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  trigger_event TEXT NOT NULL,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ delay_hours, template_key, exit_on_events }]
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nurture_sequences_trigger
  ON public.nurture_sequences(trigger_event) WHERE enabled = TRUE;

-- ============================================================================
-- 2. nurture_enrollments
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.nurture_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.nurture_sequences(id) ON DELETE CASCADE,
  household_id UUID,
  user_id UUID,
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'exited', 'suppressed')),
  next_step_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate active enrollment of a household in a sequence.
CREATE UNIQUE INDEX IF NOT EXISTS idx_nurture_enrollments_active
  ON public.nurture_enrollments(sequence_id, household_id)
  WHERE status = 'active';
-- Due-step scan.
CREATE INDEX IF NOT EXISTS idx_nurture_enrollments_due
  ON public.nurture_enrollments(next_step_at) WHERE status = 'active';

-- ============================================================================
-- 3. email_suppressions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.email_suppressions IS
  'Unsubscribe / bounce suppression list. Every nurture send checks it first.';

-- ============================================================================
-- RLS — admin-only management (writes also happen via service role).
-- ============================================================================
ALTER TABLE public.nurture_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nurture_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage nurture sequences" ON public.nurture_sequences FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'));

CREATE POLICY "Admins manage nurture enrollments" ON public.nurture_enrollments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'));

CREATE POLICY "Admins manage email suppressions" ON public.email_suppressions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'));

-- ============================================================================
-- Seed the nurture-engine agent (hourly, disabled by default).
-- ============================================================================
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'nurture-engine',
  'growth',
  'Enrolls households on lifecycle events and advances nurture email sequences (draft-first).',
  'Deterministic sequence engine — no LLM generation.',
  'claude-haiku-4-5-20251001',
  '15 * * * *',
  '{}'::jsonb,
  2,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
