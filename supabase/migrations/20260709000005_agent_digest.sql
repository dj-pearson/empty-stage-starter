-- Agentic OS — US-488: email digests (instant tier-3 + daily tier-2 summary).
--
-- Schedules a daily digest via pg_cron and fires an instant digest whenever a
-- tier-3 escalation is inserted (AFTER INSERT trigger). Both POST the
-- agent-digest edge function through pg_net; the function URL + internal secret
-- come from Vault (fallback to app.settings GUCs) so NO secret is hardcoded.
-- Everything is guarded so `db push` succeeds where pg_cron / pg_net / vault are
-- unavailable.

-- ----------------------------------------------------------------------------
-- Invoker: reads config at call time and POSTs the agent-digest function.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoke_agent_digest(p_mode text, p_escalation_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_base_url text;
  v_secret   text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_base_url
      FROM vault.decrypted_secrets WHERE name = 'agent_functions_base_url' LIMIT 1;
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets WHERE name = 'agent_dispatch_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  v_base_url := COALESCE(v_base_url, current_setting('app.settings.functions_base_url', true));
  v_secret   := COALESCE(v_secret,   current_setting('app.settings.agent_dispatch_secret', true));

  IF v_base_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE 'invoke_agent_digest: missing base URL or secret; skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_base_url || '/agent-digest',
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'x-agent-dispatch-secret', v_secret
               ),
    body    := jsonb_strip_nulls(jsonb_build_object('mode', p_mode, 'escalation_id', p_escalation_id))
  );
END;
$$;

COMMENT ON FUNCTION public.invoke_agent_digest(text, uuid) IS
  'POSTs the agent-digest edge function (daily cron or instant tier-3). Reads URL/secret from Vault or app.settings GUCs.';

-- ----------------------------------------------------------------------------
-- Instant tier-3: AFTER INSERT trigger on agent_escalations.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_escalation_tier3_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
BEGIN
  -- Only tier-3 rows trigger an instant email; guard pg_net's absence.
  IF NEW.tier = 3 AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    BEGIN
      PERFORM public.invoke_agent_digest('instant', NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'agent_escalation_tier3_notify: invoke failed (non-fatal)';
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_escalation_tier3_notify ON public.agent_escalations;
CREATE TRIGGER trg_agent_escalation_tier3_notify
  AFTER INSERT ON public.agent_escalations
  FOR EACH ROW
  WHEN (NEW.tier = 3)
  EXECUTE FUNCTION public.agent_escalation_tier3_notify();

-- ----------------------------------------------------------------------------
-- Daily digest schedule (08:00 UTC). Guarded + idempotent.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('agent-digest-daily');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      'agent-digest-daily',
      '0 8 * * *',
      $cron$ SELECT public.invoke_agent_digest('daily'); $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed; agent-digest daily schedule not created';
  END IF;
END $$;
