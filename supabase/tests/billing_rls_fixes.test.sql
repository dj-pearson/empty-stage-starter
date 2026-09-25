-- 20260928000011_billing_rls_fixes: custom-domain verification is server-only,
-- brand contact details are owner-only, complimentary lookups answer for the
-- caller only, and get_usage_stats counts what enforce_plan_row_limit counts.
--
-- Asserts on privileges and on what a call or statement actually does as the
-- role a browser uses, never on the migration text.
--
-- HOW TO RUN: `bash scripts/dev/local-sql-suite.sh`. Never against production.
-- Everything happens in one transaction that is rolled back.

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

BEGIN;

-- 1. Grants: anon and PUBLIC cannot execute; authenticated and service_role can.
--    search_path is pinned on every re-created definer function.
DO $a1$
DECLARE
  fn TEXT;
  cfg TEXT[];
  wrong TEXT[] := '{}';
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_complementary_subscription(uuid)',
    'public.has_active_complementary_subscription(uuid)',
    'public.get_usage_stats(uuid)'
  ] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') THEN
      wrong := wrong || (fn || ' [anon can execute]');
    END IF;
    IF has_function_privilege('public', fn, 'EXECUTE') THEN
      wrong := wrong || (fn || ' [PUBLIC can execute]');
    END IF;
    IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      wrong := wrong || (fn || ' [authenticated cannot execute]');
    END IF;
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      wrong := wrong || (fn || ' [service_role cannot execute]');
    END IF;
    SELECT proconfig INTO cfg FROM pg_proc WHERE oid = fn::regprocedure;
    IF cfg IS NULL OR NOT ('search_path=public' = ANY (cfg)) THEN
      wrong := wrong || (fn || format(' [proconfig %s]', cfg));
    END IF;
  END LOOP;

  -- The trigger function is never called directly by anyone.
  fn := 'public.guard_professional_custom_domain_write()';
  IF has_function_privilege('anon', fn, 'EXECUTE')
     OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
    wrong := wrong || (fn || ' [client can execute]');
  END IF;

  IF array_length(wrong, 1) > 0 THEN
    RAISE EXCEPTION 'assertion 1: %', array_to_string(wrong, ', ');
  END IF;
  RAISE NOTICE 'assertion 1 ok (grants named; search_path pinned)';
END $a1$;

CREATE TEMP TABLE brf_ids (k text PRIMARY KEY, v uuid);
GRANT SELECT ON brf_ids TO anon, authenticated, service_role;

DO $fx$
DECLARE
  pro_p   UUID := gen_random_uuid();   -- Professional (comped)
  pro_q   UUID := gen_random_uuid();   -- another Professional
  owner_a UUID := gen_random_uuid();
  partner UUID := gen_random_uuid();
  hh_a    UUID;
  hh_b    UUID;
  dom_p   UUID;
BEGIN
  -- Each insert fires handle_new_user -> ensure_user_household.
  INSERT INTO auth.users (id, email) VALUES
    (pro_p,   'brf-p@example.test'),
    (pro_q,   'brf-q@example.test'),
    (owner_a, 'brf-owner@example.test'),
    (partner, 'brf-partner@example.test');

  INSERT INTO public.complementary_subscriptions (user_id, plan_id, granted_by, status, end_date, reason)
  SELECT u, id, owner_a, 'active', NULL, 'brf fixture comp'
    FROM public.subscription_plans, unnest(ARRAY[pro_p, pro_q]) u
   WHERE name = 'Professional';

  -- A domain row the way a server-side verifier would leave it, written as the
  -- table owner: status 'verified'. Under the dropped policy this is exactly
  -- what made P's brand row world-readable.
  INSERT INTO public.professional_custom_domains (user_id, domain_name, status, verified_at)
    VALUES (pro_p, 'brf-clinic.example', 'verified', now())
    RETURNING id INTO dom_p;
  INSERT INTO public.professional_brand_settings (user_id, business_name, contact_email, phone_number)
    VALUES (pro_p, 'BRF Clinic', 'desk@brf-clinic.example', '555-0100');

  SELECT household_id INTO hh_a FROM public.household_members WHERE user_id = owner_a;
  ASSERT hh_a IS NOT NULL, 'the signup chain did not give the owner a household';
  hh_b := public.get_user_household_id(partner);
  ASSERT hh_b IS NOT NULL AND hh_b <> hh_a, 'partner did not get a household of their own';
  -- The partner joins household A; the later joined_at makes it theirs.
  INSERT INTO public.household_members (household_id, user_id, role, joined_at)
    VALUES (hh_a, partner, 'parent', clock_timestamp() + interval '1 minute');
  ASSERT public.get_user_household_id(partner) = hh_a, 'partner did not resolve to household A';

  INSERT INTO brf_ids VALUES ('pro_p', pro_p), ('pro_q', pro_q), ('owner_a', owner_a),
                             ('partner', partner), ('hh_a', hh_a), ('hh_b', hh_b),
                             ('dom_p', dom_p);
END $fx$;

-- 2. A client cannot mark a domain verified, change it, or claim a new one.
--    The error text is checked because RLS refusals are also 42501, and this
--    must be the trigger speaking, not a policy that happened to fail first.
DO $a2$
DECLARE
  pro_p UUID := (SELECT v FROM brf_ids WHERE k = 'pro_p');
  pro_q UUID := (SELECT v FROM brf_ids WHERE k = 'pro_q');
  dom_p UUID := (SELECT v FROM brf_ids WHERE k = 'dom_p');
  msg   TEXT;
  n     INTEGER;
BEGIN
  -- P's own pending row, for the UPDATE cases.
  UPDATE public.professional_custom_domains
     SET status = 'pending', verified_at = NULL WHERE id = dom_p;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', pro_p::text, true);

  -- The owner can see the row, so RLS lets the UPDATE through to the trigger.
  SELECT count(*) INTO n FROM public.professional_custom_domains WHERE id = dom_p;
  ASSERT n = 1, format('owner sees %s of their own domain rows', n);

  msg := NULL;
  BEGIN
    UPDATE public.professional_custom_domains SET status = 'verified' WHERE id = dom_p;
  EXCEPTION WHEN insufficient_privilege THEN msg := SQLERRM;
  END;
  ASSERT msg LIKE '%written by the server%', format('status=verified from the client: %s', msg);

  msg := NULL;
  BEGIN
    UPDATE public.professional_custom_domains
       SET verified_at = now(), ssl_certificate_status = 'issued', ssl_expires_at = now() + interval '1 year'
     WHERE id = dom_p;
  EXCEPTION WHEN insufficient_privilege THEN msg := SQLERRM;
  END;
  ASSERT msg LIKE '%written by the server%', format('verified_at/ssl_* from the client: %s', msg);

  msg := NULL;
  BEGIN
    UPDATE public.professional_custom_domains SET domain_name = 'someone-else.example' WHERE id = dom_p;
  EXCEPTION WHEN insufficient_privilege THEN msg := SQLERRM;
  END;
  ASSERT msg LIKE '%written by the server%', format('domain_name change from the client: %s', msg);

  -- Q is Professional, so the INSERT policy passes and the trigger refuses.
  PERFORM set_config('request.jwt.claim.sub', pro_q::text, true);
  ASSERT public.current_user_plan_name() = 'Professional', 'fixture: Q is not Professional';
  msg := NULL;
  BEGIN
    INSERT INTO public.professional_custom_domains (user_id, domain_name, status)
      VALUES (pro_q, 'brf-squat.example', 'verified');
  EXCEPTION WHEN insufficient_privilege THEN msg := SQLERRM;
  END;
  ASSERT msg LIKE '%added by the server%', format('client INSERT of a domain: %s', msg);
  RESET ROLE;

  SELECT count(*) INTO n FROM public.professional_custom_domains
   WHERE id = dom_p AND status = 'pending' AND verified_at IS NULL
     AND domain_name = 'brf-clinic.example';
  ASSERT n = 1, 'P''s domain row changed despite the refusals';
  SELECT count(*) INTO n FROM public.professional_custom_domains WHERE domain_name = 'brf-squat.example';
  ASSERT n = 0, 'Q''s domain claim landed';

  -- service_role (the future verifier) can write verification.
  SET LOCAL ROLE service_role;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.professional_custom_domains
     SET status = 'verified', verified_at = now() WHERE id = dom_p;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  ASSERT n = 1, format('service_role verified %s rows, expected 1', n);

  -- Remove keeps working for the owner.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', pro_p::text, true);
  -- A no-op UPDATE (supabase-js upsert of the same values) is not refused.
  UPDATE public.professional_custom_domains SET domain_name = domain_name WHERE id = dom_p;
  RESET ROLE;

  RAISE NOTICE 'assertion 2 ok (client cannot verify, edit or claim a domain; service_role can verify)';
END $a2$;

-- 3. Nobody but the owner reads the brand row, even with a verified domain.
DO $a3$
DECLARE
  pro_p   UUID := (SELECT v FROM brf_ids WHERE k = 'pro_p');
  pro_q   UUID := (SELECT v FROM brf_ids WHERE k = 'pro_q');
  n       INTEGER;
  email   TEXT;
BEGIN
  ASSERT (SELECT status FROM public.professional_custom_domains WHERE user_id = pro_p) = 'verified',
    'fixture: P''s domain should be server-verified for this case';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'professional_brand_settings'
       AND cmd IN ('SELECT', 'ALL') AND qual NOT LIKE '%auth.uid()%'
  ), 'a SELECT policy on professional_brand_settings does not key on auth.uid()';

  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT count(*) INTO n FROM public.professional_brand_settings WHERE user_id = pro_p;
  RESET ROLE;
  ASSERT n = 0, format('anon read %s of P''s brand rows', n);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', pro_q::text, true);
  SELECT count(*) INTO n FROM public.professional_brand_settings WHERE user_id = pro_p;
  RESET ROLE;
  ASSERT n = 0, format('another user read %s of P''s brand rows', n);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', pro_p::text, true);
  SELECT contact_email INTO email FROM public.professional_brand_settings WHERE user_id = pro_p;
  RESET ROLE;
  ASSERT email = 'desk@brf-clinic.example', format('owner read contact_email %s', email);

  RAISE NOTICE 'assertion 3 ok (anon and other users read no brand row; owner reads own)';
END $a3$;

-- 4. Complimentary lookups: A cannot read B's comp; B, service_role can.
DO $a4$
DECLARE
  pro_p   UUID := (SELECT v FROM brf_ids WHERE k = 'pro_p');
  owner_a UUID := (SELECT v FROM brf_ids WHERE k = 'owner_a');
  refused BOOLEAN;
  plan    TEXT;
  has     BOOLEAN;
BEGIN
  refused := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM set_config('request.jwt.claim.sub', '', true);
    SELECT plan_name INTO plan FROM public.get_complementary_subscription(pro_p);
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RESET ROLE;
  ASSERT refused, format('anon read P''s comp: %s', plan);

  refused := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
    SELECT plan_name INTO plan FROM public.get_complementary_subscription(pro_p);
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RESET ROLE;
  ASSERT refused, format('A read P''s comp: %s', plan);

  refused := false;
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
    has := public.has_active_complementary_subscription(pro_p);
  EXCEPTION WHEN insufficient_privilege THEN refused := true;
  END;
  RESET ROLE;
  ASSERT refused, format('A read whether P is comped: %s', has);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', pro_p::text, true);
  SELECT plan_name INTO plan FROM public.get_complementary_subscription(pro_p);
  has := public.has_active_complementary_subscription(pro_p);
  RESET ROLE;
  ASSERT plan = 'Professional' AND has, format('P''s own comp came back %s / %s', plan, has);

  SET LOCAL ROLE service_role;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT plan_name INTO plan FROM public.get_complementary_subscription(pro_p);
  RESET ROLE;
  ASSERT plan = 'Professional', format('service_role read P''s comp as %s', plan);

  RAISE NOTICE 'assertion 4 ok (anon and A refused P''s comp with 42501; P and service_role read it)';
END $a4$;

-- 5. get_usage_stats counts the household, as enforce_plan_row_limit does.
--    Owner and partner share household A. The partner also left rows behind
--    in the household they had before joining, which enforcement for A does
--    not count and the old user_id count did.
DO $a5$
DECLARE
  owner_a UUID := (SELECT v FROM brf_ids WHERE k = 'owner_a');
  partner UUID := (SELECT v FROM brf_ids WHERE k = 'partner');
  hh_a    UUID := (SELECT v FROM brf_ids WHERE k = 'hh_a');
  hh_b    UUID := (SELECT v FROM brf_ids WHERE k = 'hh_b');
  max_kids INTEGER;
  enforced_kids INTEGER;
  enforced_foods INTEGER;
  res_owner JSONB;
  res_partner JSONB;
  msg TEXT;
BEGIN
  SELECT max_children INTO max_kids FROM public.subscription_plans WHERE name = 'Free';
  ASSERT max_kids IS NOT NULL AND max_kids >= 1, format('fixture: Free max_children is %s', max_kids);

  -- The owner fills household A's child allowance; the partner adds foods.
  INSERT INTO public.kids (user_id, household_id, name)
  SELECT owner_a, hh_a, 'BRF kid ' || g FROM generate_series(1, max_kids) g;
  INSERT INTO public.foods (user_id, household_id, name, category) VALUES
    (owner_a, hh_a, 'BRF apple', 'fruit'),
    (partner, hh_a, 'BRF rice', 'carb'),
    (partner, hh_a, 'BRF peas', 'vegetable'),
    (partner, hh_b, 'BRF old-household food', 'snack');

  -- What enforce_plan_row_limit counts for an insert into household A.
  SELECT count(*) INTO enforced_kids FROM public.kids WHERE household_id = hh_a;
  SELECT count(*) INTO enforced_foods FROM public.foods WHERE household_id = hh_a;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', owner_a::text, true);
  res_owner := public.get_usage_stats(owner_a);
  PERFORM set_config('request.jwt.claim.sub', partner::text, true);
  res_partner := public.get_usage_stats(partner);
  RESET ROLE;

  ASSERT (res_owner->'usage'->'children'->>'current')::int = enforced_kids,
    format('owner children meter %s, enforcement counts %s', res_owner->'usage'->'children', enforced_kids);
  ASSERT (res_partner->'usage'->'children'->>'current')::int = enforced_kids,
    format('partner children meter %s, enforcement counts %s (user_id count would be 0)',
           res_partner->'usage'->'children', enforced_kids);
  ASSERT (res_owner->'usage'->'pantry_foods'->>'current')::int = enforced_foods,
    format('owner pantry meter %s, enforcement counts %s', res_owner->'usage'->'pantry_foods', enforced_foods);
  ASSERT (res_partner->'usage'->'pantry_foods'->>'current')::int = enforced_foods,
    format('partner pantry meter %s, enforcement counts %s (user_id count would be 3)',
           res_partner->'usage'->'pantry_foods', enforced_foods);
  ASSERT enforced_foods = 3, format('fixture: household A holds %s foods, expected 3', enforced_foods);

  -- The meter says the partner is at the limit, and enforcement agrees.
  ASSERT (res_partner->'usage'->'children'->>'current')::int
       >= (res_partner->'usage'->'children'->>'limit')::int,
    format('partner meter %s does not read full', res_partner->'usage'->'children');
  msg := NULL;
  BEGIN
    INSERT INTO public.kids (user_id, household_id, name) VALUES (partner, hh_a, 'BRF one too many');
  EXCEPTION WHEN check_violation THEN msg := SQLERRM;
  END;
  ASSERT msg LIKE 'plan_limit_exceeded%', format('partner over-limit kid insert: %s', msg);

  -- Keys unchanged.
  ASSERT res_partner ?& ARRAY['plan', 'usage']
     AND res_partner->'usage' ?& ARRAY['children', 'pantry_foods', 'ai_coach', 'food_tracker']
     AND res_partner->'plan' ?& ARRAY['name', 'max_children', 'max_pantry_foods', 'is_complementary'],
    format('get_usage_stats shape changed: %s', res_partner);

  RAISE NOTICE 'assertion 5 ok (both parents'' meters = enforcement''s household count; full meter = refused insert)';
END $a5$;

ROLLBACK;
