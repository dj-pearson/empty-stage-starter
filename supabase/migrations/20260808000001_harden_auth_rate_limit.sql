-- US-617: make the login rate limiter authoritative, and stop it locking out
-- legitimate users (codebase review, 2026-08-08).
--
-- Three defects in 20260223000000_rate_limiting.sql:
--
--   1. BYPASSABLE. p_max_attempts and p_window_seconds came from the caller, so
--      an attacker brute-forcing logins just passed p_max_attempts => 999999
--      and was never throttled. The "authoritative server-side enforcement" was
--      configured by the party being enforced against.
--
--   2. WEAPONISABLE. The function recorded an attempt on EVERY call and is
--      executable by anon, so five calls naming a victim's email tripped the
--      "Account temporarily locked" branch in Auth.tsx for 15 minutes,
--      repeatable indefinitely — a remote lockout of any account.
--
--   3. LOCKED OUT REAL USERS. Because it recorded on every call and ran BEFORE
--      signInWithPassword, successful logins counted too. Five sign-ins in 15
--      minutes (phone + tablet + laptop + a couple of session refreshes) locked
--      the user out. Auth.tsx's clearRateLimit() only cleared the client's
--      localStorage copy; the server row survived.
--
-- Shape of the fix: split the read from the write. Checking is free; only a
-- genuine failure records. Limits are server constants. The counter is scoped
-- by client IP as well as identifier, so an attacker can only throttle their
-- own IP rather than a victim's account.
--
-- BACKWARD COMPATIBILITY: the 4-argument signature is preserved so an
-- already-cached web bundle keeps working — the two limit arguments are now
-- ignored rather than removed. Such a bundle simply never calls
-- record_failed_login, degrading to the client-side limiter it already has.
-- No shipped iOS/Android build calls this RPC (verified: the only caller is
-- src/pages/Auth.tsx).

-- Scope the window by IP as well as identifier.
ALTER TABLE public.auth_rate_limits
  ADD COLUMN IF NOT EXISTS client_ip TEXT;

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_lookup_ip
  ON public.auth_rate_limits (identifier, action, client_ip, window_start);

-- Index the cleanup predicate; the original composite index could not serve a
-- DELETE keyed on window_start alone (wrong leading column).
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_window_start
  ON public.auth_rate_limits (window_start);

-- Server-owned limits. Changing policy means changing these, not a request body.
CREATE OR REPLACE FUNCTION public.auth_rate_limit_max_attempts()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 5 $$;

CREATE OR REPLACE FUNCTION public.auth_rate_limit_window_seconds()
RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$ SELECT 900 $$;

-- Best-effort client IP from the PostgREST request context. Returns NULL when
-- unavailable (direct SQL, tests), and NULL groups together — which is no worse
-- than the previous identifier-only behaviour.
CREATE OR REPLACE FUNCTION public.auth_rate_limit_client_ip()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_headers JSON;
  v_ip TEXT;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true)::JSON;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF v_headers IS NULL THEN
    RETURN NULL;
  END IF;

  -- x-forwarded-for may be a comma-separated chain; the left-most entry is the
  -- original client as recorded by our edge.
  v_ip := split_part(COALESCE(v_headers ->> 'x-forwarded-for', ''), ',', 1);
  v_ip := NULLIF(btrim(v_ip), '');

  RETURN COALESCE(v_ip, NULLIF(btrim(COALESCE(v_headers ->> 'cf-connecting-ip', '')), ''));
END;
$$;

-- READ-ONLY check. Returns TRUE when the attempt is allowed. Records nothing,
-- so calling it can never throttle anyone.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_action TEXT DEFAULT 'login',
  p_max_attempts INTEGER DEFAULT NULL,   -- IGNORED (kept for signature compat)
  p_window_seconds INTEGER DEFAULT NULL  -- IGNORED (kept for signature compat)
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $check_rate_limit$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
  v_ip TEXT;
BEGIN
  -- The caller's proposed limits are deliberately discarded.
  v_window_start := NOW() - (public.auth_rate_limit_window_seconds() || ' seconds')::INTERVAL;
  v_ip := public.auth_rate_limit_client_ip();

  SELECT COALESCE(SUM(attempt_count), 0)
  INTO v_count
  FROM public.auth_rate_limits
  WHERE identifier = p_identifier
    AND action = p_action
    AND window_start >= v_window_start
    AND (v_ip IS NULL OR client_ip IS NULL OR client_ip = v_ip);

  RETURN v_count < public.auth_rate_limit_max_attempts();
END;
$check_rate_limit$;

-- Record a FAILED attempt. This is the only thing that consumes budget.
CREATE OR REPLACE FUNCTION public.record_failed_login(
  p_identifier TEXT,
  p_action TEXT DEFAULT 'login'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $record_failed_login$
BEGIN
  INSERT INTO public.auth_rate_limits (identifier, action, attempt_count, window_start, client_ip)
  VALUES (p_identifier, p_action, 1, NOW(), public.auth_rate_limit_client_ip());
END;
$record_failed_login$;

-- Clear the window after a successful sign-in, so a legitimate user is never
-- locked out by their own history. Scoped to the calling IP.
CREATE OR REPLACE FUNCTION public.clear_login_rate_limit(
  p_identifier TEXT,
  p_action TEXT DEFAULT 'login'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $clear_login_rate_limit$
DECLARE
  v_ip TEXT;
BEGIN
  v_ip := public.auth_rate_limit_client_ip();

  DELETE FROM public.auth_rate_limits
  WHERE identifier = p_identifier
    AND action = p_action
    AND (v_ip IS NULL OR client_ip IS NULL OR client_ip = v_ip);
END;
$clear_login_rate_limit$;

-- Cleanup, lifted out of the per-attempt hot path. The original ran a DELETE
-- over the whole table on EVERY auth attempt.
CREATE OR REPLACE FUNCTION public.prune_auth_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $prune_auth_rate_limits$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.auth_rate_limits
  WHERE window_start < NOW() - INTERVAL '1 hour';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$prune_auth_rate_limits$;

-- Sign-in happens while the caller is still anon, so anon MUST retain EXECUTE
-- on the three auth-flow functions — that is inherent to a client-side sign-in
-- and not something a grant can fix. What changes is that none of them can now
-- be used to raise a limit or to throttle somebody else's account from a
-- different IP. Maintenance functions stay service-role only.
REVOKE ALL ON FUNCTION public.prune_auth_rate_limits() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_rate_limit_client_ip() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_failed_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_login_rate_limit(TEXT, TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.check_rate_limit(TEXT, TEXT, INTEGER, INTEGER) IS
  'US-617: READ-ONLY login rate-limit check. p_max_attempts/p_window_seconds are ignored and kept only for signature compatibility with cached web bundles; limits come from auth_rate_limit_max_attempts()/auth_rate_limit_window_seconds().';
COMMENT ON FUNCTION public.record_failed_login(TEXT, TEXT) IS
  'US-617: records a FAILED auth attempt. The only function that consumes rate-limit budget.';

-- Schedule the prune hourly when pg_cron is present; harmless no-op otherwise.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('prune-auth-rate-limits')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-auth-rate-limits');
    PERFORM cron.schedule('prune-auth-rate-limits', '7 * * * *', 'SELECT public.prune_auth_rate_limits();');
  END IF;
END;
$$;
