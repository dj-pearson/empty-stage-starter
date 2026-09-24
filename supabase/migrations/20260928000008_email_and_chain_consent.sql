-- Two server-side fixes: queue_email is no longer a client RPC and escapes what
-- it puts into HTML; contribute_chain_network honours the sharing opt-out.
--
-- 1. queue_email(uuid, text, text, jsonb, integer, integer)
--
-- It was created in 20251010233000 as SECURITY DEFINER with no grant handling,
-- so Supabase's schema default ACL gave EXECUTE to anon, authenticated and
-- service_role. Any holder of the anon key could therefore queue any active
-- template to any address with any variables, and the variables went into
-- html_body verbatim: a signed-in user could send HTML of their choosing from
-- our sending domain to anyone.
--
-- Callers, all checked before revoking:
--   - trigger_milestone_email() (20260417000001): SECURITY DEFINER, runs as
--     the function owner, unaffected.
--   - schedule_weekly_summaries() (20251010233000): SECURITY DEFINER, called
--     by the weekly-summary-generator edge function with the service role key.
--   - trigger_welcome_email() (20260918000006): SECURITY INVOKER, but it only
--     fires from the profiles insert inside handle_new_user(), which is
--     SECURITY DEFINER, so current_user is the owner there. It also reads
--     auth.users, which authenticated cannot, so no client-role path through
--     it worked before this migration either.
--   - The only client caller, the admin "send test email" button, was removed
--     by the Settings rework (8d67fc8). No iOS (ios/**), Expo (app/**) or
--     edge function code calls it.
-- So EXECUTE goes to service_role only; triggers and definer callers keep
-- working as the owner.
--
-- Variables are now HTML-escaped (& < > " ') into html_body. subject and
-- text_body are plain text and keep the raw value, since escaping there would
-- show "&amp;" to the reader. A null variable now substitutes as '' instead of
-- nulling the whole body (REPLACE with NULL returns NULL, and html_body and
-- subject are NOT NULL, so that was an insert failure).
--
-- 2. contribute_chain_network(uuid, text, text, text, text)
--
-- The opt-out (picky_win_preferences.share_chain_outcomes) was enforced only by
-- the web client (src/lib/shareChainPref.ts). Now the function checks it for
-- auth.uid(): an explicit FALSE makes the call a no-op that returns false, the
-- same value it already returns for a duplicate or invalid contribution, so no
-- shipped client sees a new error.
--
-- No row means TRUE. That is the column default (20260520000003), the web
-- client's DEFAULT_SHARE_CHAIN, and what isShareChainOptedIn() resolves to once
-- the server answers with no row. No iOS build contributes at all (nothing
-- under ios/ or app/ calls this RPC), so no shipped client assumes otherwise.
-- A null auth.uid() (no end user, e.g. a service_role call) is a no-op: there
-- is nobody whose consent could be checked, and no server code calls it.
--
-- Backward compatible: both signatures and return types are unchanged, no
-- DDL on tables, and the only privilege removed is on a function no shipped
-- client calls.

-- ---------------------------------------------------------------- helper ---
CREATE OR REPLACE FUNCTION public.html_escape_text(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT replace(replace(replace(replace(replace(
           p_value,
           '&', '&amp;'),
           '<', '&lt;'),
           '>', '&gt;'),
           '"', '&quot;'),
           '''', '&#39;');
$$;

COMMENT ON FUNCTION public.html_escape_text(TEXT) IS
  'Escapes & < > " and '' for HTML text and attribute contexts. Used by queue_email for html_body.';

REVOKE ALL ON FUNCTION public.html_escape_text(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.html_escape_text(TEXT) TO service_role;

-- ----------------------------------------------------------- queue_email ---
CREATE OR REPLACE FUNCTION public.queue_email(
  p_user_id UUID,
  p_template_key TEXT,
  p_to_email TEXT,
  p_template_variables JSONB DEFAULT '{}'::jsonb,
  p_priority INTEGER DEFAULT 5,
  p_delay_minutes INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_template RECORD;
  v_subject TEXT;
  v_html_body TEXT;
  v_text_body TEXT;
  v_email_id UUID;
  v_key TEXT;
  v_value TEXT;
BEGIN
  SELECT * INTO v_template
  FROM public.automation_email_templates
  WHERE template_key = p_template_key
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email template not found: %', p_template_key;
  END IF;

  v_subject := v_template.subject;
  v_html_body := v_template.html_body;
  v_text_body := v_template.text_body;

  FOR v_key, v_value IN
    SELECT key, value FROM jsonb_each_text(COALESCE(p_template_variables, '{}'::jsonb))
  LOOP
    v_value := COALESCE(v_value, '');
    v_subject := replace(v_subject, '{{' || v_key || '}}', v_value);
    v_html_body := replace(v_html_body, '{{' || v_key || '}}', public.html_escape_text(v_value));
    IF v_text_body IS NOT NULL THEN
      v_text_body := replace(v_text_body, '{{' || v_key || '}}', v_value);
    END IF;
  END LOOP;

  INSERT INTO public.automation_email_queue (
    user_id,
    template_key,
    to_email,
    subject,
    html_body,
    text_body,
    template_variables,
    priority,
    scheduled_for
  ) VALUES (
    p_user_id,
    p_template_key,
    p_to_email,
    v_subject,
    v_html_body,
    v_text_body,
    p_template_variables,
    p_priority,
    NOW() + (COALESCE(p_delay_minutes, v_template.send_delay_minutes, 0) || ' minutes')::INTERVAL
  )
  RETURNING id INTO v_email_id;

  RETURN v_email_id;
END;
$$;

COMMENT ON FUNCTION public.queue_email(UUID, TEXT, TEXT, JSONB, INTEGER, INTEGER) IS
  'Queue an email with template variable substitution. Variables are HTML-escaped into html_body. '
  'Server-only: service_role, triggers and SECURITY DEFINER callers (20260928000008).';

REVOKE ALL ON FUNCTION public.queue_email(UUID, TEXT, TEXT, JSONB, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_email(UUID, TEXT, TEXT, JSONB, INTEGER, INTEGER) TO service_role;

-- ---------------------------------------------- contribute_chain_network ---
CREATE OR REPLACE FUNCTION public.contribute_chain_network(
  p_contribution_key UUID,
  p_source_food_name TEXT,
  p_target_food_name TEXT,
  p_pickiness_bucket TEXT,
  p_outcome TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_share BOOLEAN;
  v_source TEXT;
  v_target TEXT;
  v_bucket TEXT;
  v_outcome TEXT;
  v_inserted BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  -- Consent. No row means the column default, TRUE; see the header.
  SELECT p.share_chain_outcomes INTO v_share
  FROM public.picky_win_preferences p
  WHERE p.user_id = v_uid;
  IF FOUND AND v_share IS NOT TRUE THEN
    RETURN false;
  END IF;

  IF p_contribution_key IS NULL THEN RETURN false; END IF;

  v_source := public.normalize_chain_food_name(p_source_food_name);
  v_target := public.normalize_chain_food_name(p_target_food_name);
  IF v_source = '' OR v_target = '' OR v_source = v_target THEN
    RETURN false;
  END IF;

  v_bucket := lower(coalesce(nullif(trim(p_pickiness_bucket), ''), 'unknown'));
  IF v_bucket NOT IN ('low', 'medium', 'high', 'unknown') THEN
    v_bucket := 'unknown';
  END IF;

  v_outcome := lower(coalesce(nullif(trim(p_outcome), ''), 'success'));
  IF v_outcome NOT IN ('success', 'partial', 'refused') THEN
    RETURN false;
  END IF;

  INSERT INTO public.chain_network_contributions (
    contribution_key, source_food_key, target_food_key,
    pickiness_bucket, outcome
  ) VALUES (
    p_contribution_key, v_source, v_target, v_bucket, v_outcome
  )
  ON CONFLICT (contribution_key) DO NOTHING
  RETURNING true INTO v_inserted;

  IF NOT coalesce(v_inserted, false) THEN
    RETURN false;
  END IF;

  INSERT INTO public.chain_network_aggregates AS a (
    source_food_key, target_food_key, pickiness_bucket,
    success_count, partial_count, refused_count, total_count,
    first_observed_at, last_observed_at
  ) VALUES (
    v_source, v_target, v_bucket,
    CASE WHEN v_outcome = 'success' THEN 1 ELSE 0 END,
    CASE WHEN v_outcome = 'partial' THEN 1 ELSE 0 END,
    CASE WHEN v_outcome = 'refused' THEN 1 ELSE 0 END,
    1, now(), now()
  )
  ON CONFLICT (source_food_key, target_food_key, pickiness_bucket)
  DO UPDATE SET
    success_count = a.success_count
      + CASE WHEN v_outcome = 'success' THEN 1 ELSE 0 END,
    partial_count = a.partial_count
      + CASE WHEN v_outcome = 'partial' THEN 1 ELSE 0 END,
    refused_count = a.refused_count
      + CASE WHEN v_outcome = 'refused' THEN 1 ELSE 0 END,
    total_count = a.total_count + 1,
    last_observed_at = now();

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.contribute_chain_network(UUID, TEXT, TEXT, TEXT, TEXT) IS
  'Idempotent contribution; uses contribution_key for dedupe. No-op (returns false) when the caller '
  'set picky_win_preferences.share_chain_outcomes = false; no row counts as opted in (20260928000008).';

REVOKE ALL ON FUNCTION public.contribute_chain_network(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contribute_chain_network(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
