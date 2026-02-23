-- Rate limiting table for server-side rate limit enforcement
-- Prevents bypass of client-side rate limits by clearing browser storage.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,            -- email address or IP
  action TEXT NOT NULL DEFAULT 'login', -- action being rate limited
  attempt_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Composite index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON public.rate_limits (identifier, action, window_start);

-- Enable RLS — only service role can access
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- No user-facing policies. Only the service role key can read/write.
-- This ensures rate limits cannot be manipulated by end users.

-- SQL function to check and record rate limits atomically
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_action TEXT DEFAULT 'login',
  p_max_attempts INTEGER DEFAULT 5,
  p_window_seconds INTEGER DEFAULT 900  -- 15 minutes
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  v_window_start := NOW() - (p_window_seconds || ' seconds')::INTERVAL;

  -- Count recent attempts within the window
  SELECT COALESCE(SUM(attempt_count), 0)
  INTO v_count
  FROM public.rate_limits
  WHERE identifier = p_identifier
    AND action = p_action
    AND window_start >= v_window_start;

  -- If over the limit, deny
  IF v_count >= p_max_attempts THEN
    RETURN FALSE;
  END IF;

  -- Record this attempt
  INSERT INTO public.rate_limits (identifier, action, attempt_count, window_start)
  VALUES (p_identifier, p_action, 1, NOW());

  -- Clean up old entries (older than 1 hour) to prevent table bloat
  DELETE FROM public.rate_limits
  WHERE window_start < NOW() - INTERVAL '1 hour';

  RETURN TRUE;
END;
$$;
