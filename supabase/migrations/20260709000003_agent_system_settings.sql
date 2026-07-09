-- Agentic OS — US-480: global settings singleton (kill switch + digest emails)
-- Additive only. Admin-only RLS. A single row (id = 1) holds system-wide config.

CREATE TABLE IF NOT EXISTS public.agent_system_settings (
  -- Enforce a singleton: only id = 1 may ever exist.
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  global_pause BOOLEAN NOT NULL DEFAULT FALSE,
  digest_emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the singleton row so readers always find exactly one.
INSERT INTO public.agent_system_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Keep updated_at fresh on change.
DROP TRIGGER IF EXISTS update_agent_system_settings_updated_at ON public.agent_system_settings;
CREATE TRIGGER update_agent_system_settings_updated_at
  BEFORE UPDATE ON public.agent_system_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

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

COMMENT ON TABLE public.agent_system_settings IS 'Agentic OS: singleton system settings (global kill switch, digest recipients)';
