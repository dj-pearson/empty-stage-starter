-- Agentic OS — US-475: Core agent schema
-- Registry of agents (agent_definitions) and a log of every execution (agent_runs).
-- Additive only: new tables, no changes to existing objects.
-- RLS is admin-only, reusing the user_roles admin-role pattern used by admin_alerts.

-- ============================================================================
-- 1. agent_definitions — registry of configurable agents
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

-- ============================================================================
-- 2. agent_runs — immutable-ish log of every agent execution
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agent_definitions(id) ON DELETE CASCADE,
  trigger TEXT,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'skipped')),
  input JSONB,
  output JSONB,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd NUMERIC,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON public.agent_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON public.agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started ON public.agent_runs(started_at DESC);
-- Supports "today's spend for this agent" and "is this agent already running" lookups.
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent_started
  ON public.agent_runs(agent_id, started_at DESC);

-- ============================================================================
-- 3. updated_at trigger for agent_definitions
-- ============================================================================
DROP TRIGGER IF EXISTS update_agent_definitions_updated_at ON public.agent_definitions;
CREATE TRIGGER update_agent_definitions_updated_at
  BEFORE UPDATE ON public.agent_definitions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. Row Level Security — admin-only on both tables
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

-- ============================================================================
-- 5. Comments
-- ============================================================================
COMMENT ON TABLE public.agent_definitions IS 'Agentic OS: registry of configurable autonomous agents';
COMMENT ON TABLE public.agent_runs IS 'Agentic OS: execution log for every agent run (status, tokens, cost)';
