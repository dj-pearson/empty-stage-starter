-- Agentic OS — US-480: Budget guardrails and global kill switch
-- A singleton settings row holds the global pause (kill switch) and the list of
-- digest email recipients. The dispatcher (US-478) already reads global_pause;
-- this migration creates the table it reads. Per-agent daily spend caps are
-- enforced in the shared runtime against agent_definitions.daily_cost_cap_usd
-- and agent_runs.cost_usd (no schema change needed for those).
--
-- Additive only: one brand-new table. RLS: admin-only (same user_roles pattern
-- as admin_alerts / agent_definitions).

-- ============================================================================
-- agent_system_settings — singleton platform-wide controls
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.agent_system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  global_pause BOOLEAN NOT NULL DEFAULT FALSE,
  digest_emails TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce a single row: a unique index on a constant expression permits exactly
-- one row regardless of its id, so the settings are a true singleton.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_system_settings_singleton
  ON public.agent_system_settings ((TRUE));

COMMENT ON TABLE public.agent_system_settings IS
  'Singleton platform controls for the Agentic OS: global kill switch (global_pause) and digest email recipients.';

-- Seed the singleton row (idempotent — only inserts when the table is empty).
INSERT INTO public.agent_system_settings (global_pause, digest_emails)
SELECT FALSE, '{}'::text[]
WHERE NOT EXISTS (SELECT 1 FROM public.agent_system_settings);

-- Keep updated_at fresh (reuse the repo-wide trigger helper).
DROP TRIGGER IF EXISTS trg_agent_system_settings_updated_at ON public.agent_system_settings;
CREATE TRIGGER trg_agent_system_settings_updated_at
  BEFORE UPDATE ON public.agent_system_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS — admin-only (same pattern as admin_alerts / agent_definitions)
-- ============================================================================
ALTER TABLE public.agent_system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage agent system settings"
  ON public.agent_system_settings FOR ALL
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
