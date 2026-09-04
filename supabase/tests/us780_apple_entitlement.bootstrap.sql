-- Bootstrap for us780_apple_entitlement.test.sql.
--
-- Stands up only the pieces Supabase provides, so the REAL migration files can
-- then be applied unchanged. Deliberately minimal: kids and foods carry just
-- the columns the trigger reads (user_id, household_id), because replaying 300
-- migrations to test a plan lookup is how a test stops being run.
--
-- auth.uid() reads request.jwt.claim.sub; the test sets it to impersonate.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);
-- Supabase sets request.jwt.claim.sub per request; the test impersonates a
-- user with set_config on that key, matching us711's bootstrap.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT 'authenticated'::TEXT $$;

-- Referenced by an admin RLS policy in 20251008141000 and by the app_role enum
-- that 20251008205036 expects.
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL
);

CREATE TABLE IF NOT EXISTS public.kids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  household_id UUID,
  name TEXT
);

CREATE TABLE IF NOT EXISTS public.foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  household_id UUID,
  name TEXT
);

CREATE TABLE IF NOT EXISTS public.user_usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  ai_coach_requests INTEGER DEFAULT 0,
  food_tracker_entries INTEGER DEFAULT 0
);
