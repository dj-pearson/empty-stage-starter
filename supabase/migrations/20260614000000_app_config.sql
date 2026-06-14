-- US-380: server-driven app configuration, starting with the minimum
-- supported iOS build for the force-update gate. Additive + backward
-- compatible (new table, anon-readable). The gate fails OPEN, so seeding
-- min_ios_build = 1 means no existing user is blocked until an admin bumps it.

CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Config is non-sensitive and read by unauthenticated clients on launch
-- (before sign-in), so SELECT is open to everyone. Writes are admin-only
-- (service role / dashboard) — no INSERT/UPDATE/DELETE policy is granted to
-- anon or authenticated.
DROP POLICY IF EXISTS "Anyone can read app config" ON public.app_config;
CREATE POLICY "Anyone can read app config"
  ON public.app_config
  FOR SELECT
  USING (true);

INSERT INTO public.app_config (key, value)
VALUES ('min_ios_build', '1'::jsonb)
ON CONFLICT (key) DO NOTHING;
