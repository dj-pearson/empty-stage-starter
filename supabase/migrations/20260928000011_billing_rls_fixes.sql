-- Billing and Professional-tier RLS fixes.
--
-- Four things, each checked against every shipped client before changing it.
-- Readers and writers were searched for in src/, app/ (Expo), ios/ (Swift) and
-- supabase/functions/ on 2026-09-25.
--
-- 1. professional_custom_domains: the browser wrote the verification state.
--    Its UPDATE policy is "user_id = auth.uid()" with no column restriction,
--    so the signed-in owner could set status = 'verified' or 'active',
--    verified_at, ssl_certificate_status and ssl_expires_at, and the old
--    "Check Verification" button in ProfessionalSettings did exactly that
--    without a DNS lookup (removed in 7ffde71). domain_name is UNIQUE, so any
--    Professional account could also claim a domain it does not own and hold
--    it against the real owner.
--
--    Who touches the table today:
--      src/pages/dashboard/ProfessionalSettings.tsx  SELECT id, domain_name of
--                                                    the caller's own row, and
--                                                    DELETE of it (Remove).
--    Nothing in src/ INSERTs or UPDATEs it any more, and nothing in app/,
--    ios/ or supabase/functions/ reads or writes it at all. No verifier
--    exists: there is no edge function that looks at DNS.
--
--    Fix: a BEFORE INSERT OR UPDATE trigger refuses (42501) a client INSERT
--    and any client UPDATE that changes a column. "Client" is the anon and
--    authenticated roles; service_role, the table owner and SECURITY DEFINER
--    code run as other roles and are unaffected, so the verifier this table
--    was built for can write it with the service role when it exists. DELETE
--    is untouched, so Remove keeps working.
--
--    Refusing INSERT, not only the status columns, is what closes the domain
--    claim: with no verifier there is no way to tell a real owner from a
--    squatter, and no client inserts. SELECT stays owner-only as before.
--
--    Existing rows: since nothing server-side has ever written this table,
--    every row whose status is not 'pending', or that carries verified_at,
--    an ssl status other than 'pending' or ssl_expires_at, got that from a
--    browser. All of them are reset to the unverified defaults. Rows
--    themselves are kept (a pending claim could be a squat, but deleting
--    customer rows is the owner's call, not a migration's).
--
-- 2. professional_brand_settings: "Public can view brand settings for
--    verified domains" is written to let anyone, anon included, read the
--    whole row -- contact_email, phone_number, support_url -- of every account
--    with a 'verified' or 'active' domain row, and item 1 shows that status
--    was self-asserted. Measured against a database built from this tree, it
--    returns nothing today: its EXISTS subquery runs under the caller's RLS on
--    professional_custom_domains, which only shows a row to its owner. So the
--    leak is latent, one domain read policy or definer helper away from live,
--    and the policy has never served a reader. Readers of the table:
--      src/hooks/useWhiteLabelTheme.ts          own row (.eq user_id), plus a
--                                               realtime channel filtered to
--                                               the caller's user_id.
--      src/pages/dashboard/ProfessionalSettings.tsx   own row.
--      src/components/professional/PracticeProfileForm.tsx  upserts own row.
--    Nothing renders another account's brand: no public page, no custom-domain
--    host, nothing in app/, ios/ or supabase/functions/. So the public policy
--    serves no reader and is dropped rather than narrowed. Owner SELECT,
--    INSERT, UPDATE and DELETE are untouched.
--
-- 3. get_complementary_subscription(uuid) (20251107000001:158) and its
--    sibling has_active_complementary_subscription(uuid) (:134) are SECURITY
--    DEFINER, unpinned, and under US-804's default ACL callable by anon for
--    any user id with no auth.uid() check, so anyone holding the anon key could
--    read whether an account is comped, on which plan, until when and the
--    admin's free-text reason. Neither has a caller in src/, app/, ios/,
--    supabase/functions/ or any SQL function. Same fix as
--    20260925000001_feature_limit_privileges.sql: a signed-in caller asking
--    about another user gets 42501, a NULL auth.uid() (service_role, cron,
--    superuser) proceeds, search_path is pinned, EXECUTE is revoked from
--    PUBLIC and anon and granted to authenticated and service_role.
--    Signatures and return shapes do not change; the bodies are verbatim.
--
-- 4. get_usage_stats counted kids and foods by user_id, while the limit it
--    reports is enforced by enforce_plan_row_limit (20260903000001), which
--    counts the table's rows WHERE household_id = NEW.household_id. In a
--    two-parent household each parent's meter showed only the rows they
--    created, so "2 of 3 children" could be refused as the household's
--    fourth. Now both counts use the household the caller writes into,
--    public.get_user_household_id(p_user_id), which is what the web client
--    (AuthContext / useHousehold) and every household query resolve. A user
--    with no household gets 0, which is also what enforcement counts for a
--    NULL household_id. Everything else is carried over from 20260928000002:
--    the caller guard, effective_plan_id, is_complementary, the JSON keys,
--    search_path and the grants. The plan's own limits are still the
--    caller's, as enforcement uses effective_plan_id(NEW.user_id).
--
-- Backward compatibility: no column, table, type or RPC signature changes.
-- The one policy removed and the INSERT/UPDATE refusal cover paths no shipped
-- web or iOS build uses (see the reader lists above).

-- migration-safety: allow drop-policy (public brand-settings read exposed contact email and phone to anon; no web, iOS or edge reader uses it, see item 2)

-- 1 --- professional_custom_domains: the server owns verification ------------

CREATE OR REPLACE FUNCTION public.guard_professional_custom_domain_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- SECURITY INVOKER on purpose: current_user is the role the statement runs
  -- as. PostgREST sets it to anon or authenticated for a browser or app
  -- request; service_role, the owner and definer functions are someone else.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'professional_custom_domains: custom domains are added by the server, not the client'
      USING ERRCODE = '42501';
  END IF;

  -- UPDATE: nothing a client may change. updated_at is excluded because the
  -- timestamp trigger rewrites it on every update.
  IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION 'professional_custom_domains: domain and verification fields are written by the server, not the client'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_professional_custom_domain_write() IS
  'Refuses INSERT and any column change on professional_custom_domains from anon or authenticated. Verification (status, verified_at, ssl_*) is only ever written by server code with the service role.';

REVOKE ALL ON FUNCTION public.guard_professional_custom_domain_write() FROM PUBLIC, anon, authenticated;

-- Some databases never got 20251111000000, so neither table exists there.
-- Same guard as 20260903000001: skip what has nothing to act on.
DO $custom_domains$
BEGIN
  IF to_regclass('public.professional_custom_domains') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS guard_professional_custom_domain_write ON public.professional_custom_domains;
    CREATE TRIGGER guard_professional_custom_domain_write
      BEFORE INSERT OR UPDATE ON public.professional_custom_domains
      FOR EACH ROW
      EXECUTE FUNCTION public.guard_professional_custom_domain_write();

    -- Every non-default verification value came from a browser (item 1).
    UPDATE public.professional_custom_domains
       SET status = 'pending',
           verified_at = NULL,
           ssl_certificate_status = 'pending',
           ssl_expires_at = NULL
     WHERE status IS DISTINCT FROM 'pending'
        OR verified_at IS NOT NULL
        OR ssl_certificate_status IS DISTINCT FROM 'pending'
        OR ssl_expires_at IS NOT NULL;
  END IF;
END
$custom_domains$;

-- 2 --- professional_brand_settings: no public read -----------------------------

DO $brand_settings$
BEGIN
  IF to_regclass('public.professional_brand_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public can view brand settings for verified domains"
      ON public.professional_brand_settings;
  END IF;
END
$brand_settings$;

-- 3 --- complimentary subscription lookups answer for the caller only ----------

CREATE OR REPLACE FUNCTION public.get_complementary_subscription(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  plan_id UUID,
  plan_name TEXT,
  is_permanent BOOLEAN,
  end_date TIMESTAMPTZ,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'get_complementary_subscription: may only be called for the signed-in user'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cs.id,
    cs.plan_id,
    sp.name as plan_name,
    cs.is_permanent,
    cs.end_date,
    cs.reason
  FROM complementary_subscriptions cs
  JOIN subscription_plans sp ON cs.plan_id = sp.id
  WHERE cs.user_id = p_user_id
    AND cs.status = 'active'
    AND (cs.end_date IS NULL OR cs.end_date >= NOW())
  ORDER BY cs.created_at DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_complementary_subscription(UUID) IS
  'The active comp for the signed-in user (p_user_id must equal auth.uid() when one is set). service_role may call it for any user.';

REVOKE ALL ON FUNCTION public.get_complementary_subscription(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_complementary_subscription(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_active_complementary_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_complementary BOOLEAN;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'has_active_complementary_subscription: may only be called for the signed-in user'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM complementary_subscriptions
    WHERE user_id = p_user_id
      AND status = 'active'
      AND (end_date IS NULL OR end_date >= NOW())
  ) INTO v_has_complementary;

  RETURN COALESCE(v_has_complementary, FALSE);
END;
$$;

COMMENT ON FUNCTION public.has_active_complementary_subscription(UUID) IS
  'Whether the signed-in user holds an active comp (p_user_id must equal auth.uid() when one is set). service_role may call it for any user.';

REVOKE ALL ON FUNCTION public.has_active_complementary_subscription(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_complementary_subscription(UUID) TO authenticated, service_role;

-- 4 --- get_usage_stats counts what enforcement counts --------------------------
--
-- Body from 20260928000002 with the two count queries changed and
-- v_household_id added. Nothing else differs.

CREATE OR REPLACE FUNCTION public.get_usage_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan RECORD;
  v_plan_id UUID;
  v_stats JSONB;
  v_household_id UUID;
  v_children_count INTEGER;
  v_pantry_foods_count INTEGER;
  v_today_ai_requests INTEGER;
  v_month_food_tracker INTEGER;
  v_is_complementary BOOLEAN := FALSE;
BEGIN
  -- Item 39: a signed-in caller may only ask about themselves. auth.uid() is
  -- NULL for service_role and server-side sessions, which keep acting for any
  -- user.
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'get_usage_stats: may only be called for the signed-in user'
      USING ERRCODE = '42501';
  END IF;

  -- One resolver for the dashboard and the limits: Stripe, admin comp and App
  -- Store, most generous wins (20260903000001, 20260918000007).
  v_plan_id := public.effective_plan_id(p_user_id);

  IF v_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM subscription_plans WHERE id = v_plan_id;

    v_is_complementary :=
      EXISTS (
        SELECT 1 FROM complementary_subscriptions cs
        WHERE cs.user_id = p_user_id
          AND cs.plan_id = v_plan_id
          AND cs.status = 'active'
          AND (cs.end_date IS NULL OR cs.end_date >= NOW())
      )
      OR EXISTS (
        SELECT 1 FROM user_subscriptions us
        WHERE us.user_id = p_user_id
          AND us.plan_id = v_plan_id
          AND us.status IN ('active', 'trialing')
          AND us.is_complementary IS TRUE
      );
  END IF;

  -- If still no subscription, use Free plan
  IF v_plan IS NULL THEN
    SELECT * INTO v_plan
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;
  END IF;

  -- The household the caller's inserts carry, and the scope
  -- enforce_plan_row_limit counts: every row in the table with that
  -- household_id, whoever created it. NULL (no household) counts 0 there too.
  v_household_id := public.get_user_household_id(p_user_id);

  SELECT COUNT(*) INTO v_children_count
  FROM kids
  WHERE household_id = v_household_id;

  SELECT COUNT(*) INTO v_pantry_foods_count
  FROM foods
  WHERE household_id = v_household_id;

  SELECT COALESCE(ai_coach_requests, 0) INTO v_today_ai_requests
  FROM user_usage_tracking
  WHERE user_id = p_user_id
    AND date = CURRENT_DATE;

  SELECT COALESCE(SUM(food_tracker_entries), 0) INTO v_month_food_tracker
  FROM user_usage_tracking
  WHERE user_id = p_user_id
    AND date >= date_trunc('month', CURRENT_DATE);

  -- Build response (include complementary status)
  v_stats := jsonb_build_object(
    'plan', jsonb_build_object(
      'name', v_plan.name,
      'max_children', v_plan.max_children,
      'max_pantry_foods', v_plan.max_pantry_foods,
      'ai_coach_daily_limit', v_plan.ai_coach_daily_limit,
      'food_tracker_monthly_limit', v_plan.food_tracker_monthly_limit,
      'has_food_chaining', v_plan.has_food_chaining,
      'has_meal_builder', v_plan.has_meal_builder,
      'has_nutrition_tracking', v_plan.has_nutrition_tracking,
      'is_complementary', v_is_complementary
    ),
    'usage', jsonb_build_object(
      'children', jsonb_build_object(
        'current', v_children_count,
        'limit', v_plan.max_children,
        'percentage', CASE
          WHEN v_plan.max_children IS NULL THEN 0
          ELSE ROUND((v_children_count::DECIMAL / v_plan.max_children) * 100, 0)
        END
      ),
      'pantry_foods', jsonb_build_object(
        'current', v_pantry_foods_count,
        'limit', v_plan.max_pantry_foods,
        'percentage', CASE
          WHEN v_plan.max_pantry_foods IS NULL THEN 0
          ELSE ROUND((v_pantry_foods_count::DECIMAL / v_plan.max_pantry_foods) * 100, 0)
        END
      ),
      'ai_coach', jsonb_build_object(
        'current', COALESCE(v_today_ai_requests, 0),
        'limit', v_plan.ai_coach_daily_limit,
        'percentage', CASE
          WHEN v_plan.ai_coach_daily_limit IS NULL THEN 0
          WHEN v_plan.ai_coach_daily_limit = 0 THEN 100
          ELSE ROUND((COALESCE(v_today_ai_requests, 0)::DECIMAL / v_plan.ai_coach_daily_limit) * 100, 0)
        END,
        'resets_at', (CURRENT_DATE + INTERVAL '1 day')::TEXT
      ),
      'food_tracker', jsonb_build_object(
        'current', COALESCE(v_month_food_tracker, 0),
        'limit', v_plan.food_tracker_monthly_limit,
        'percentage', CASE
          WHEN v_plan.food_tracker_monthly_limit IS NULL THEN 0
          ELSE ROUND((COALESCE(v_month_food_tracker, 0)::DECIMAL / v_plan.food_tracker_monthly_limit) * 100, 0)
        END,
        'resets_at', (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::TEXT
      )
    )
  );

  RETURN v_stats;
END;
$$;

COMMENT ON FUNCTION public.get_usage_stats(UUID) IS
  'Plan and usage for the signed-in user (p_user_id must equal auth.uid() when one is set). Plan via effective_plan_id and child / pantry counts by the caller''s household, both exactly as enforce_plan_row_limit enforces. service_role may call it for any user.';

REVOKE ALL ON FUNCTION public.get_usage_stats(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_usage_stats(UUID) TO authenticated, service_role;
