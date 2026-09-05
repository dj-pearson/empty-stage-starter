-- Bootstrap for us784_ledger_drift.test.sql.
--
-- Stands up only what the kitchen-loop ledger migrations need, so those files
-- can then be applied UNCHANGED and the test exercises what ships.
--
-- admin_alerts is deliberately created in its 20251013120000 shape -- the
-- CHECK-constrained one -- because that migration runs first and its
-- CREATE TABLE IF NOT EXISTS therefore wins over the free-text version in
-- 20251220000000. Testing against the permissive shape would prove nothing:
-- the whole point is that a drift alert must survive the constraint that is
-- actually live.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The migrations REVOKE from these by name; without them those statements
-- error and the rest of the file is skipped under ON_ERROR_STOP.
DO $roles$ BEGIN
  BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE ROLE anon          NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN CREATE ROLE service_role  NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $roles$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID
$$;

CREATE TABLE IF NOT EXISTS public.profiles (id UUID PRIMARY KEY);

-- The ledger references foods(id); nothing else about foods matters here.
CREATE TABLE IF NOT EXISTS public.foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID,
  name TEXT
);

CREATE TABLE IF NOT EXISTS public.households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS public.household_members (
  household_id UUID NOT NULL,
  user_id UUID NOT NULL
);

CREATE OR REPLACE FUNCTION public.get_user_household_id(p_user UUID)
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT household_id FROM public.household_members WHERE user_id = p_user LIMIT 1
$$;

-- The live (constrained) admin_alerts shape. See the note above.
CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'error_spike', 'signup_drop', 'high_api_cost', 'payment_failure',
    'abuse_detection', 'server_downtime', 'low_activity', 'feature_adoption'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')) DEFAULT 'medium',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  alert_data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
