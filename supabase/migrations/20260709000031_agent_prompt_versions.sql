-- Agentic OS — US-515: prompt version history for the agent config UI.
--
-- Editing an agent's system_prompt in the Command Center writes a new
-- agent_prompt_versions row and updates agent_definitions.system_prompt;
-- rollback restores any prior version's text as a new version. Additive only.

CREATE TABLE IF NOT EXISTS public.agent_prompt_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES public.agent_definitions(id) ON DELETE CASCADE,
  system_prompt TEXT NOT NULL,
  version       INTEGER NOT NULL,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent_id, version)
);

CREATE INDEX IF NOT EXISTS idx_agent_prompt_versions_agent
  ON public.agent_prompt_versions(agent_id, version DESC);

ALTER TABLE public.agent_prompt_versions ENABLE ROW LEVEL SECURITY;

-- Admin-only: prompts are operational config, not user data.
CREATE POLICY "Admins can view prompt versions"
  ON public.agent_prompt_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert prompt versions"
  ON public.agent_prompt_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = 'admin'
    )
  );

COMMENT ON TABLE public.agent_prompt_versions IS
  'US-515: append-only system_prompt history per agent; rollback restores a prior version as a new version.';
