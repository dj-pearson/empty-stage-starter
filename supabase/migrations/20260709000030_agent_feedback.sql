-- Agentic OS — US-514: approval feedback records + self-eval agent seed.
--
-- Every approval decision (approve / edit / reject) writes an agent_feedback row
-- linked to the originating agent_runs row, so the weekly self-eval agent can
-- turn real human feedback into per-agent quality metrics. Additive only.

-- ---------------------------------------------------------------------------
-- 1. agent_feedback — one row per approval decision.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_feedback (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id      UUID REFERENCES public.agent_approvals(id) ON DELETE SET NULL,
  run_id           UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  agent_id         UUID REFERENCES public.agent_definitions(id) ON DELETE SET NULL,
  action_type      TEXT,
  decision         TEXT NOT NULL CHECK (decision IN ('approved', 'edited', 'rejected')),
  -- Levenshtein distance between the draft and the approved payload; NULL unless edited.
  edit_distance    INTEGER,
  rejection_reason TEXT,
  reviewed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_feedback_agent ON public.agent_feedback(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_run ON public.agent_feedback(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_created ON public.agent_feedback(created_at DESC);

ALTER TABLE public.agent_feedback ENABLE ROW LEVEL SECURITY;

-- Admins (the reviewers) may read and insert feedback; the service role (the
-- self-eval agent) reads via bypass. No UPDATE/DELETE — feedback is append-only.
CREATE POLICY "Admins can view agent feedback"
  ON public.agent_feedback FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert agent feedback"
  ON public.agent_feedback FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

COMMENT ON TABLE public.agent_feedback IS
  'US-514: one row per approval decision (approve/edit/reject) linked to the originating run; feeds the weekly self-eval quality report.';

-- ---------------------------------------------------------------------------
-- 2. Seed the self-eval agent (weekly, disabled by default).
-- ---------------------------------------------------------------------------
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'self-eval',
  'dev_maintenance',
  'Weekly per-agent quality report from approval feedback: approval/edit rates, avg edit distance, top rejection reasons, cost per approved action; suggests prompt tweaks.',
  'You improve AI agent prompts from real reviewer feedback. Given a week of rejections and edits for one agent, propose specific, minimal system_prompt changes that would reduce those rejections/edits. Quote the concrete failure patterns. Do not rewrite the whole prompt.',
  'claude-haiku-4-5-20251001',
  '0 9 * * 1',
  '{}'::jsonb,
  3,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
