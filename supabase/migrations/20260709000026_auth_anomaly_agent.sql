-- Agentic OS — US-510: auth anomaly detection agent.
--
-- Two parts:
--   1. A SECURITY DEFINER RPC that normalizes recent rows from
--      auth.audit_log_entries into a flat, RLS-safe shape the edge function can
--      read with the service role. auth.* is not reachable through PostgREST, so
--      the agent goes through this function instead of selecting the table.
--   2. The seeded 'auth-anomaly' agent (every 15 min, DISABLED by default).
--
-- Detection ONLY — the agent escalates evidence for a human; it never blocks
-- sign-ins. Additive/backward-compatible: a new function + a new seed row.

-- ---------------------------------------------------------------------------
-- 1. Normalized recent-auth-events RPC.
-- ---------------------------------------------------------------------------
-- GoTrue records auth actions in auth.audit_log_entries(payload jsonb,
-- created_at, ip_address). We map the raw `action` to the small event
-- vocabulary the detectors understand and surface the actor's email + ip.
-- Country is not recorded by GoTrue, so it is best-effort (usually NULL); the
-- geo-switch detector simply finds nothing when country is absent.
CREATE OR REPLACE FUNCTION public.agent_recent_auth_events(p_minutes integer DEFAULT 15)
RETURNS TABLE (
  user_id    uuid,
  email      text,
  ip         text,
  country    text,
  event_type text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    NULLIF(e.payload->>'actor_id', '')::uuid                       AS user_id,
    e.payload->>'actor_username'                                   AS email,
    NULLIF(host(e.ip_address), '')                                 AS ip,
    NULLIF(e.payload->>'country', '')                              AS country,
    CASE
      WHEN e.payload->>'action' ILIKE '%signup%'          THEN 'signup'
      WHEN e.payload->>'action' ILIKE '%fail%'
        OR e.payload->>'action' ILIKE '%invalid%'
        OR e.payload->>'action' ILIKE '%denied%'          THEN 'login_failure'
      WHEN e.payload->>'action' = 'login'                 THEN 'login_success'
      ELSE COALESCE(e.payload->>'action', 'unknown')
    END                                                            AS event_type,
    e.created_at
  FROM auth.audit_log_entries e
  WHERE e.created_at >= NOW() - make_interval(mins => GREATEST(p_minutes, 1))
  ORDER BY e.created_at DESC
  LIMIT 5000;
$$;

COMMENT ON FUNCTION public.agent_recent_auth_events(integer) IS
  'US-510: normalized recent auth events for the auth-anomaly agent. SECURITY DEFINER so the service role can read auth.audit_log_entries without exposing the table.';

-- Only the service role (the edge function) may call it — not anon/authenticated.
REVOKE ALL ON FUNCTION public.agent_recent_auth_events(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_recent_auth_events(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Seed the agent (every 15 minutes, disabled until an admin enables it).
-- ---------------------------------------------------------------------------
-- Thresholds live in autonomy_policy.anomaly_thresholds so they are tunable
-- without a code change (resolveThresholds() reads them, falling back to the
-- built-in defaults for any unset key).
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'auth-anomaly',
  'dev_maintenance',
  'Every 15 min: scans recent auth activity for credential stuffing, signup bursts, and rapid geo-switching; escalates evidence (detection only, no blocking).',
  'You are a security monitoring agent. You review authentication anomaly evidence and never block users — detection only. Thresholds are configured, not guessed.',
  'claude-haiku-4-5-20251001',
  '*/15 * * * *',
  '{"anomaly_thresholds": {"credStuffFailures": 20, "credStuffAccounts": 5, "signupBurst": 25, "geoCountries": 2}}'::jsonb,
  2,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
