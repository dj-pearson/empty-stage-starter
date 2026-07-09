-- Agentic OS — US-478: schedule the agent dispatcher via pg_cron
--
-- Every 5 minutes, call the agent-dispatcher edge function over HTTP (pg_net).
-- No secrets are hardcoded: the function URL and the internal shared secret are
-- read at call time from Supabase Vault (vault.decrypted_secrets), so they never
-- appear in the cron.job command text or in this migration.
--
-- Operator setup (run once, out of band — NOT in this migration):
--   select vault.create_secret('https://<ref>.functions.supabase.co/agent-dispatcher',
--                              'agent_dispatcher_url');
--   select vault.create_secret('<random-shared-secret>', 'agent_dispatcher_cron_secret');
-- and set the same secret as the CRON_SECRET env var on the edge function.
--
-- The migration is defensive: if pg_cron / pg_net are unavailable it logs a
-- NOTICE and does nothing, so it never hard-fails a deploy.

-- ============================================================================
-- 1. Wrapper that reads config from Vault and posts to the dispatcher.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.invoke_agent_dispatcher()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_url text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'agent_dispatcher_url' LIMIT 1;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'agent_dispatcher_cron_secret' LIMIT 1;

  IF v_url IS NULL THEN
    RAISE NOTICE 'invoke_agent_dispatcher: vault secret "agent_dispatcher_url" not set; skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', COALESCE(v_secret, '')
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_agent_dispatcher() FROM PUBLIC;

-- ============================================================================
-- 2. Schedule it every 5 minutes (only if pg_cron is installed).
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed; enable it and re-run cron.schedule for agent-dispatcher-5min';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net not installed; enable it so invoke_agent_dispatcher can post over HTTP';
  END IF;

  -- Idempotent: drop any prior schedule of the same name before recreating.
  PERFORM cron.unschedule('agent-dispatcher-5min')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent-dispatcher-5min');

  PERFORM cron.schedule(
    'agent-dispatcher-5min',
    '*/5 * * * *',
    $cron$SELECT public.invoke_agent_dispatcher();$cron$
  );
END;
$$;
