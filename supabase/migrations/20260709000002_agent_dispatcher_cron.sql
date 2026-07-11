-- Agentic OS — US-478: schedule the agent dispatcher every 5 minutes.
--
-- Uses pg_cron + pg_net to POST to the agent-dispatcher edge function. The
-- function URL and the internal dispatch secret are sourced from Vault (with a
-- fallback to database settings / GUCs) so NO secret is hardcoded in this
-- migration. Everything is guarded so `db push` succeeds even where pg_cron /
-- pg_net / vault are unavailable (e.g. a bare local Postgres).

-- ----------------------------------------------------------------------------
-- Invoker function: reads config at call time, POSTs to the dispatcher.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoke_agent_dispatcher()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_base_url  text;
  v_secret    text;
BEGIN
  -- Prefer Vault-stored secrets; fall back to database settings (GUCs).
  BEGIN
    SELECT decrypted_secret INTO v_base_url
      FROM vault.decrypted_secrets WHERE name = 'agent_functions_base_url' LIMIT 1;
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets WHERE name = 'agent_dispatch_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Vault not present; ignore and try GUCs below.
    NULL;
  END;

  v_base_url := COALESCE(v_base_url, current_setting('app.settings.functions_base_url', true));
  v_secret   := COALESCE(v_secret,   current_setting('app.settings.agent_dispatch_secret', true));

  IF v_base_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'invoke_agent_dispatcher: missing base URL or secret; skipping this tick';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_base_url || '/agent-dispatcher',
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'x-agent-dispatch-secret', v_secret
               ),
    body    := jsonb_build_object('trigger', 'cron')
  );
END;
$$;

COMMENT ON FUNCTION public.invoke_agent_dispatcher() IS
  'Called by pg_cron every 5 minutes to POST the agent-dispatcher edge function. Reads URL/secret from Vault or app.settings GUCs.';

-- ----------------------------------------------------------------------------
-- Schedule it. Guarded: only when pg_cron is installed. Idempotent re-schedule.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove any prior schedule with this name so re-running is safe.
    BEGIN
      PERFORM cron.unschedule('agent-dispatcher-5min');
    EXCEPTION WHEN OTHERS THEN
      NULL; -- not previously scheduled
    END;

    PERFORM cron.schedule(
      'agent-dispatcher-5min',
      '*/5 * * * *',
      $cron$ SELECT public.invoke_agent_dispatcher(); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed; agent-dispatcher schedule not created';
  END IF;
END $$;
