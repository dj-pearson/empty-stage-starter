-- Server-side rate limiting for AUTH actions (login, password reset, etc.),
-- keyed by a free-text identifier (email or IP) because the sign-in flow runs
-- before a user/session exists. src/pages/Auth.tsx calls
--   check_rate_limit(p_identifier => email, p_action => 'login').
--
-- IMPORTANT: this is intentionally a SEPARATE table from the older
-- AI-endpoint limiter (`rate_limits` + `check_rate_limit_with_tier`, created in
-- 20251010230000_rate_limiting_system.sql), which is keyed by
-- (user_id, endpoint). The original version of this migration tried to reuse
-- the `rate_limits` name and failed on any DB where the older migration had
-- already created that table ("column \"identifier\" does not exist"), so it
-- now uses its own `auth_rate_limits` table and cannot collide.
--
-- The function keeps the name `check_rate_limit` (the name Auth.tsx calls); it
-- coexists with the older check_rate_limit(p_user_id, p_endpoint, ...) as a
-- distinct overload — PostgREST routes by the named arguments in the request.

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,             -- email address or IP
  action TEXT NOT NULL DEFAULT 'login', -- action being rate limited
  attempt_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Composite index for fast lookups
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_lookup
  ON public.auth_rate_limits (identifier, action, window_start);

-- Enable RLS — no user-facing policies. Only the service role and the
-- SECURITY DEFINER function below can read/write, so end users cannot
-- manipulate their own rate limits.
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- Check and record a rate-limited attempt atomically. Returns TRUE when the
-- attempt is allowed (and records it), FALSE when the limit is exceeded.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_action TEXT DEFAULT 'login',
  p_max_attempts INTEGER DEFAULT 5,
  p_window_seconds INTEGER DEFAULT 900  -- 15 minutes
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_window_start := NOW() - (p_window_seconds || ' seconds')::INTERVAL;

  -- Count recent attempts within the window
  SELECT COALESCE(SUM(attempt_count), 0)
  INTO v_count
  FROM public.auth_rate_limits
  WHERE identifier = p_identifier
    AND action = p_action
    AND window_start >= v_window_start;

  -- If over the limit, deny
  IF v_count >= p_max_attempts THEN
    RETURN FALSE;
  END IF;

  -- Record this attempt
  INSERT INTO public.auth_rate_limits (identifier, action, attempt_count, window_start)
  VALUES (p_identifier, p_action, 1, NOW());

  -- Clean up old entries (older than 1 hour) to prevent table bloat
  DELETE FROM public.auth_rate_limits
  WHERE window_start < NOW() - INTERVAL '1 hour';

  RETURN TRUE;
END;
$$;
