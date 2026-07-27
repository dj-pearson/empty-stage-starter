-- Defense-in-depth rate limiting for anonymous quiz submissions (audit US-561).
--
-- The "Anyone can submit quiz responses" policy is FOR INSERT TO anon with
-- WITH CHECK (true) and no throttling, so the table can be spam-flooded by an
-- anonymous client. Add a BEFORE INSERT trigger that caps submissions per
-- session_id per hour.
--
-- The cap (30/hour/session) is deliberately generous: a real respondent
-- submits once or twice, so this never false-positives legitimate use — it
-- only blocks runaway per-session flooding. Additive and backward-compatible:
-- old shipped clients submit well under the cap and are unaffected. This is a
-- DB-level mitigation, not a complete solution — an attacker can rotate
-- session_id, so an edge-layer IP/captcha check (see US-561 notes) remains the
-- recommended stronger layer.

CREATE OR REPLACE FUNCTION public.enforce_quiz_insert_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count integer;
BEGIN
  -- No session to key on (some analytics/lead rows) — allow.
  IF NEW.session_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO recent_count
  FROM public.quiz_responses
  WHERE session_id = NEW.session_id
    AND created_at > now() - interval '1 hour';

  IF recent_count >= 30 THEN
    RAISE EXCEPTION 'Rate limit exceeded for quiz submissions'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quiz_responses_rate_limit ON public.quiz_responses;
CREATE TRIGGER trg_quiz_responses_rate_limit
  BEFORE INSERT ON public.quiz_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_quiz_insert_rate_limit();
