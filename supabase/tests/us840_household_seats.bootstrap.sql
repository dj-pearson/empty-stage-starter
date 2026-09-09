-- Bootstrap for us840_household_seats.test.sql.
--
-- Same shape as us780's: stand up only what Supabase itself provides plus the
-- tables the functions under test read, then apply the REAL migration file
-- unchanged. Replaying 300 migrations to test a seat count is how a test stops
-- being run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY);

-- Supabase sets request.jwt.claim.sub per request; the test impersonates a
-- user with set_config on that key.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID
$$;

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  max_children INTEGER,
  max_pantry_foods INTEGER
);

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan_id UUID REFERENCES public.subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.complementary_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan_id UUID REFERENCES public.subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  end_date TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.apple_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'My Family',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'parent' CHECK (role IN ('parent', 'guardian')),
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(household_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.household_invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES public.households(id) ON DELETE CASCADE NOT NULL,
  code TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'parent',
  created_by UUID,
  used_by UUID,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Helpers the migration under test calls but does not define.
CREATE OR REPLACE FUNCTION public.generate_invite_code() RETURNS TEXT
LANGUAGE sql AS $$ SELECT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) $$;

CREATE OR REPLACE FUNCTION public.get_user_household_id(p_user_id UUID) RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT household_id FROM public.household_members WHERE user_id = p_user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_household() RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE hh UUID;
BEGIN
  SELECT public.get_user_household_id(auth.uid()) INTO hh;
  IF hh IS NULL THEN
    INSERT INTO public.households DEFAULT VALUES RETURNING id INTO hh;
    INSERT INTO public.household_members (household_id, user_id, role) VALUES (hh, auth.uid(), 'parent');
  END IF;
  RETURN hh;
END;
$$;

CREATE OR REPLACE FUNCTION public.plan_name_for_apple_product(p_product_id TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_product_id LIKE '%professional%' THEN 'Professional'
    WHEN p_product_id LIKE '%familyplus%'   THEN 'Family Plus'
    WHEN p_product_id LIKE '%pro%'          THEN 'Pro'
    ELSE NULL
  END
$$;

-- Trimmed to the two stores this test exercises plus the ordering rule; the
-- full resolver is pinned by us780_apple_entitlement.test.sql.
CREATE OR REPLACE FUNCTION public.effective_plan_id(p_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT plan_id FROM (
    SELECT us.plan_id, 1 AS precedence, us.updated_at, sp.max_children
    FROM user_subscriptions us JOIN subscription_plans sp ON sp.id = us.plan_id
    WHERE us.user_id = p_user_id AND us.status IN ('active', 'trialing')
    UNION ALL
    SELECT sp.id, 3, a.updated_at, sp.max_children
    FROM apple_subscriptions a
    JOIN subscription_plans sp
      ON sp.name = public.plan_name_for_apple_product(a.product_id)
      OR (public.plan_name_for_apple_product(a.product_id) = 'Family Plus' AND sp.name LIKE 'Family%')
    WHERE a.user_id = p_user_id AND a.status = 'active'
      AND (a.expires_at IS NULL OR a.expires_at > now())
  ) c
  WHERE plan_id IS NOT NULL
  ORDER BY (max_children IS NULL) DESC, max_children DESC NULLS FIRST, precedence ASC
  LIMIT 1;
$$;

INSERT INTO public.subscription_plans (name, max_children) VALUES
  ('Free', 1), ('Pro', 3), ('Family Plus', NULL), ('Professional', NULL)
ON CONFLICT DO NOTHING;
