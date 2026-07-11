-- Agentic OS — US-475: Core agent schema
-- Registry of agents (agent_definitions) and an execution log (agent_runs) so
-- that all agent activity is configurable and fully traceable.
--
-- Additive only: two brand-new tables, no changes to existing objects.
-- RLS: admin-only, reusing the user_roles admin-check pattern used by admin_alerts.

-- ============================================================================
-- 1. agent_definitions — registry of every agent
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.agent_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  domain TEXT,
  description TEXT,
  system_prompt TEXT,
  model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  schedule_cron TEXT,
  autonomy_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  daily_cost_cap_usd NUMERIC NOT NULL DEFAULT 5,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_definitions_enabled
  ON public.agent_definitions(enabled) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_agent_definitions_domain
  ON public.agent_definitions(domain);

COMMENT ON TABLE public.agent_definitions IS
  'Registry of Agentic OS agents: prompt, model, schedule, autonomy policy, and budget cap per agent.';

-- Keep updated_at fresh (reuse the repo-wide trigger helper).
DROP TRIGGER IF EXISTS trg_agent_definitions_updated_at ON public.agent_definitions;
CREATE TRIGGER trg_agent_definitions_updated_at
  BEFORE UPDATE ON public.agent_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. agent_runs — one row per agent execution
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agent_definitions(id) ON DELETE CASCADE,
  trigger TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'skipped')),
  input JSONB DEFAULT '{}'::jsonb,
  output JSONB,
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_usd NUMERIC DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON public.agent_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON public.agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started ON public.agent_runs(started_at DESC);
-- Fast "today's spend for this agent" lookups (budget guardrails, US-480).
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_started
  ON public.agent_runs(agent_id, started_at DESC);
-- Idempotency guard: quickly find an agent's in-flight run (dispatcher, US-478).
CREATE INDEX IF NOT EXISTS idx_agent_runs_running
  ON public.agent_runs(agent_id) WHERE status = 'running';

COMMENT ON TABLE public.agent_runs IS
  'Execution log for every agent run: status, IO, token/cost accounting, and error trail.';

-- ============================================================================
-- 3. RLS — admin-only on both tables (same pattern as admin_alerts)
-- ============================================================================
ALTER TABLE public.agent_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage agent definitions"
  ON public.agent_definitions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage agent runs"
  ON public.agent_runs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );
