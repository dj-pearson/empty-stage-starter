-- US-711 fixture. Stands up only the parents the recipe-children policies
-- depend on, so the test can run against an empty postgres 16 in seconds
-- rather than replaying 300 migrations. Apply this, then 20260430000001,
-- 20260806000000 and 20260901000009, then the .test.sql beside it.

-- Minimal stand-in for the parts of the real schema the recipe-children
-- policies depend on. Not a replay of all 300 migrations: just the parents.
CREATE SCHEMA IF NOT EXISTS auth;

-- The auth.uid() stub. Supabase sets request.jwt.claim.sub per request; the
-- tests set it with set_config to impersonate a user.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text
);

CREATE TABLE public.household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid NOT NULL
);

CREATE TABLE public.foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL
);

CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  household_id uuid REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL
);

-- Verbatim from 20251008035900.
CREATE OR REPLACE FUNCTION public.get_user_household_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id
  FROM public.household_members
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- The household policies on `recipes` itself, from 20251008035900. The whole
-- point of US-711 is that the children did not match these.
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household members can view recipes"
  ON public.recipes FOR SELECT
  USING (household_id = public.get_user_household_id(auth.uid()));

-- A non-superuser role, so RLS is actually enforced (it is bypassed for the
-- table owner and for superusers).
DROP ROLE IF EXISTS app_user;
CREATE ROLE app_user NOLOGIN;
