-- App Store subscribers are gated as free. This fixes that.
--
-- THE BUG. Plan limits are resolved in two places -- check_feature_limit (the
-- client pre-check, migration 20251008202537) and enforce_plan_row_limit (the
-- authoritative BEFORE INSERT trigger, migration 20260723123300) -- and both
-- resolve a plan like this:
--
--   SELECT us.plan_id FROM user_subscriptions us
--   WHERE us.user_id = ... AND us.status IN ('active','trialing')
--
-- user_subscriptions holds STRIPE subscriptions. A subscription bought in the
-- iOS app lands in apple_subscriptions (migration 20260601000002), keyed by
-- original_transaction_id, and nothing joins the two. So for an App Store
-- subscriber the lookup finds nothing, both functions fall through to the
-- 'Free' row, and the customer is capped at one child and the free pantry size
-- WHILE PAYING.
--
-- Both sides agree with each other, so nothing looks broken: the client
-- pre-check says no, the trigger says no, and the upgrade prompt invites
-- someone to buy a plan they already own. iOS is the live App Store product.
--
-- THE FIX. One resolver, public.effective_plan_id(uuid), used by both. Stripe
-- keeps precedence so nothing changes for an existing web subscriber; an
-- active, unexpired Apple subscription is consulted only when Stripe yields
-- nothing, before the Free fallback.
--
-- Additive and backward-compatible: no schema change, no column touched, no
-- policy narrowed. Every function is CREATE OR REPLACE, so a replay is a no-op,
-- and a Stripe subscriber resolves to exactly the plan they resolved to before.
-- Shipped iOS builds need no change to benefit -- they already write
-- apple_subscriptions and already call check_feature_limit.

-- --- product id -> plan name -------------------------------------------------
--
-- StoreKit ids are com.eatpal.app.{pro,familyplus,professional}.{monthly,yearly}
-- (ios/EatPal/EatPal/Services/StoreKitService.swift).
--
-- Order matters: 'professional' contains 'pro', and 'familyplus' would also
-- match a naive 'pro' test, so the most specific patterns are checked first.
CREATE OR REPLACE FUNCTION public.plan_name_for_apple_product(p_product_id TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_product_id IS NULL                     THEN NULL
    WHEN p_product_id ILIKE '%professional%'      THEN 'Professional'
    WHEN p_product_id ILIKE '%familyplus%'        THEN 'Family Plus'
    WHEN p_product_id ILIKE '%family%'            THEN 'Family Plus'
    WHEN p_product_id ILIKE '%pro%'               THEN 'Pro'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.plan_name_for_apple_product(TEXT) IS
  'Maps a StoreKit product id to a subscription_plans.name. Used by effective_plan_id so an App Store subscriber resolves to the plan they bought.';

-- --- the one resolver --------------------------------------------------------
--
-- THREE stores grant entitlement, and no existing function reads all three:
--
--   user_subscriptions         Stripe/web.        check_feature_limit: yes
--   complementary_subscriptions admin-granted comp. check_feature_limit: NO
--   apple_subscriptions        App Store.          check_feature_limit: NO
--
-- get_usage_stats (migration 20251107000001) already reads the first two, so
-- a comped user sees a paid plan on the usage dashboard while the trigger caps
-- them at Free -- the same defect as the Apple one, measured the same way.
-- Both are fixed here rather than one, because a resolver that covers two of
-- three stores is how the third gets missed again.
--
-- ORDERING IS BY GENEROSITY, not by store. Precedence exists only as the final
-- deterministic tiebreak. Someone holding two entitlements at once (a web
-- subscriber who later buys on the phone, a comped user who also pays) must
-- never be handed the smaller of the two, and there is no source ranking that
-- guarantees that. A user with exactly one entitlement has exactly one
-- candidate, so a Stripe-only subscriber resolves to precisely the plan they
-- resolved to before this migration.
CREATE OR REPLACE FUNCTION public.effective_plan_id(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT plan_id
  FROM (
    SELECT us.plan_id, 1 AS precedence, us.updated_at,
           sp.max_children, sp.max_pantry_foods
    FROM user_subscriptions us
    JOIN subscription_plans sp ON sp.id = us.plan_id
    WHERE us.user_id = p_user_id
      AND us.status IN ('active', 'trialing')

    UNION ALL

    -- Admin-granted comps. Same active/unexpired test get_usage_stats uses.
    SELECT cs.plan_id, 2 AS precedence, cs.updated_at,
           sp.max_children, sp.max_pantry_foods
    FROM complementary_subscriptions cs
    JOIN subscription_plans sp ON sp.id = cs.plan_id
    WHERE cs.user_id = p_user_id
      AND cs.status = 'active'
      AND (cs.end_date IS NULL OR cs.end_date >= now())

    UNION ALL

    -- App Store. 'active' only: 'revoked' is a refund or chargeback and
    -- 'expired' speaks for itself. A NULL expires_at is a non-expiring or
    -- not-yet-reported entitlement and is treated as current, matching how
    -- StoreKitService writes the row.
    --
    -- Matched by plan NAME because apple_subscriptions stores a StoreKit
    -- product id and carries no plan_id, and tolerantly (name LIKE 'Family%')
    -- because an early seed created 'Family' where the later one creates
    -- 'Family Plus'.
    SELECT sp.id AS plan_id, 3 AS precedence, a.updated_at,
           sp.max_children, sp.max_pantry_foods
    FROM apple_subscriptions a
    JOIN subscription_plans sp
      ON sp.name = public.plan_name_for_apple_product(a.product_id)
      OR (public.plan_name_for_apple_product(a.product_id) = 'Family Plus'
          AND sp.name LIKE 'Family%')
    WHERE a.user_id = p_user_id
      AND a.status = 'active'
      AND (a.expires_at IS NULL OR a.expires_at > now())
  ) candidates
  WHERE plan_id IS NOT NULL
  -- NULL means unlimited, so it sorts first on both limits.
  ORDER BY (max_children IS NULL) DESC, max_children DESC NULLS FIRST,
           (max_pantry_foods IS NULL) DESC, max_pantry_foods DESC NULLS FIRST,
           precedence ASC,
           updated_at DESC NULLS LAST
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.effective_plan_id(UUID) IS
  'The plan a user is entitled to from ANY store: Stripe (user_subscriptions), an admin comp (complementary_subscriptions), or an active unexpired App Store purchase (apple_subscriptions). Returns the most generous of them; NULL means no entitlement and callers fall back to Free. Added 2026-09-03 because both limit checks read Stripe only and capped paying App Store subscribers at Free limits.';

-- --- the authoritative trigger, now asking the resolver ----------------------
CREATE OR REPLACE FUNCTION public.enforce_plan_row_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit_col TEXT := TG_ARGV[0];   -- 'max_pantry_foods' | 'max_children'
  v_feature   TEXT := TG_ARGV[1];   -- human label used in the error message
  v_plan_id   UUID;
  v_max       INTEGER;
  v_count     INTEGER;
BEGIN
  -- Resolve the inserting user's effective plan from EITHER store, otherwise
  -- the Free plan. Distinguish "no subscription" from "subscription whose limit
  -- is NULL (unlimited)" so a paid user is never mistakenly capped at Free.
  v_plan_id := public.effective_plan_id(NEW.user_id);

  IF v_plan_id IS NOT NULL THEN
    SELECT (CASE v_limit_col
              WHEN 'max_pantry_foods' THEN sp.max_pantry_foods
              WHEN 'max_children'     THEN sp.max_children
            END)
      INTO v_max
    FROM subscription_plans sp
    WHERE sp.id = v_plan_id;
  ELSE
    SELECT (CASE v_limit_col
              WHEN 'max_pantry_foods' THEN sp.max_pantry_foods
              WHEN 'max_children'     THEN sp.max_children
            END)
      INTO v_max
    FROM subscription_plans sp
    WHERE sp.name = 'Free'
    LIMIT 1;
  END IF;

  -- NULL limit = unlimited (paid tiers, or an unconfigured cap) -> allow.
  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count the household's existing rows in this table -- the same scope the app
  -- loads and counts foods/kids by. Block when already at/over the limit, which
  -- mirrors the client's check_feature_limit (current_count >= max).
  --
  -- Note: this is a per-row check. A single multi-row INSERT can overshoot by up
  -- to (batch size - 1) because sibling rows in the same statement aren't yet
  -- visible to the count; every subsequent insert is then blocked once the
  -- committed count reaches the limit. That is an accepted, bounded gap -- the
  -- primary bypass (direct single inserts) is fully closed.
  EXECUTE format(
    'SELECT count(*) FROM %I.%I WHERE household_id = $1',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
  )
  INTO v_count
  USING NEW.household_id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'plan_limit_exceeded: % limit reached (% of %). Upgrade to add more.',
      v_feature, v_count, v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- The triggers themselves are unchanged and keep pointing at this function;
-- they are not recreated here.

-- --- the client pre-check, now asking the same resolver ----------------------
--
-- Reproduced from migration 20251008202537 with ONE block changed: the plan
-- lookup at the top. Everything else is verbatim, deliberately.
--
-- A first attempt rewrote the body from what the call sites appeared to need
-- and silently dropped the ai_coach daily-usage branch and the food_tracker
-- monthly-usage branch, both of which read the usage table and both of which
-- are live. Removing working enforcement while claiming to fix entitlement
-- would have been a far worse bug than the one being fixed.
CREATE OR REPLACE FUNCTION public.check_feature_limit(
  p_user_id UUID,
  p_feature_type TEXT,
  p_current_count INTEGER DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID;
  v_plan RECORD;
  v_usage RECORD;
  v_result JSONB;
BEGIN
  -- Resolve the plan from ANY store (the Apple gap, 2026-09-03).
  --
  -- This block, plus the schema qualification and SET search_path in the header
  -- above, are the ONLY changes from migration 20251008202537. Everything below
  -- it -- children, pantry_foods, ai_coach's daily usage limit, food_tracker's
  -- monthly usage limit, and the capability flags -- is carried over verbatim,
  -- because rewriting the body is how the ai_coach and food_tracker branches
  -- would get silently dropped.
  --
  -- The old code selected `us.*, sp.*` into one record; this selects the plan
  -- row alone. Every field the branches below read (max_children,
  -- max_pantry_foods, ai_coach_daily_limit, food_tracker_monthly_limit,
  -- has_food_chaining, has_meal_builder, has_nutrition_tracking) is a
  -- subscription_plans column, so nothing loses a value.
  v_plan_id := public.effective_plan_id(p_user_id);

  IF v_plan_id IS NOT NULL THEN
    SELECT * INTO v_plan FROM subscription_plans WHERE id = v_plan_id;
  END IF;

  -- No paid plan, or a plan row that has gone missing: Free limits.
  IF v_plan IS NULL THEN
    SELECT * INTO v_plan
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;
  END IF;
  
  -- Check based on feature type
  CASE p_feature_type
    WHEN 'children' THEN
      IF v_plan.max_children IS NULL THEN
        RETURN jsonb_build_object('allowed', true, 'limit', NULL, 'current', p_current_count);
      ELSIF p_current_count >= v_plan.max_children THEN
        RETURN jsonb_build_object('allowed', false, 'limit', v_plan.max_children, 'current', p_current_count, 'message', 'You have reached your child profile limit. Upgrade to add more children.');
      ELSE
        RETURN jsonb_build_object('allowed', true, 'limit', v_plan.max_children, 'current', p_current_count);
      END IF;
      
    WHEN 'pantry_foods' THEN
      IF v_plan.max_pantry_foods IS NULL THEN
        RETURN jsonb_build_object('allowed', true, 'limit', NULL, 'current', p_current_count);
      ELSIF p_current_count >= v_plan.max_pantry_foods THEN
        RETURN jsonb_build_object('allowed', false, 'limit', v_plan.max_pantry_foods, 'current', p_current_count, 'message', 'You have reached your pantry food limit. Upgrade for unlimited foods.');
      ELSE
        RETURN jsonb_build_object('allowed', true, 'limit', v_plan.max_pantry_foods, 'current', p_current_count);
      END IF;
      
    WHEN 'ai_coach' THEN
      -- Get today's usage
      SELECT * INTO v_usage
      FROM user_usage_tracking
      WHERE user_id = p_user_id
        AND date = CURRENT_DATE;
        
      IF v_plan.ai_coach_daily_limit IS NULL THEN
        RETURN jsonb_build_object('allowed', true, 'limit', NULL, 'current', COALESCE(v_usage.ai_coach_requests, 0));
      ELSIF v_plan.ai_coach_daily_limit = 0 THEN
        RETURN jsonb_build_object('allowed', false, 'limit', 0, 'current', 0, 'message', 'AI Coach is not available on your plan. Upgrade to access this feature.');
      ELSIF COALESCE(v_usage.ai_coach_requests, 0) >= v_plan.ai_coach_daily_limit THEN
        RETURN jsonb_build_object('allowed', false, 'limit', v_plan.ai_coach_daily_limit, 'current', v_usage.ai_coach_requests, 'message', 'You have reached your daily AI Coach limit. Upgrade for more requests or try again tomorrow.');
      ELSE
        RETURN jsonb_build_object('allowed', true, 'limit', v_plan.ai_coach_daily_limit, 'current', COALESCE(v_usage.ai_coach_requests, 0));
      END IF;
      
    WHEN 'food_tracker' THEN
      -- Get this month's usage
      SELECT SUM(food_tracker_entries) as total INTO v_usage
      FROM user_usage_tracking
      WHERE user_id = p_user_id
        AND date >= date_trunc('month', CURRENT_DATE);
        
      IF v_plan.food_tracker_monthly_limit IS NULL THEN
        RETURN jsonb_build_object('allowed', true, 'limit', NULL, 'current', COALESCE(v_usage.total, 0));
      ELSIF COALESCE(v_usage.total, 0) >= v_plan.food_tracker_monthly_limit THEN
        RETURN jsonb_build_object('allowed', false, 'limit', v_plan.food_tracker_monthly_limit, 'current', v_usage.total, 'message', 'You have reached your monthly food tracking limit. Upgrade for unlimited tracking.');
      ELSE
        RETURN jsonb_build_object('allowed', true, 'limit', v_plan.food_tracker_monthly_limit, 'current', COALESCE(v_usage.total, 0));
      END IF;
      
    WHEN 'food_chaining', 'meal_builder', 'nutrition_tracking' THEN
      CASE p_feature_type
        WHEN 'food_chaining' THEN
          IF NOT v_plan.has_food_chaining THEN
            RETURN jsonb_build_object('allowed', false, 'message', 'Food Chaining is not available on your plan. Upgrade to access this feature.');
          END IF;
        WHEN 'meal_builder' THEN
          IF NOT v_plan.has_meal_builder THEN
            RETURN jsonb_build_object('allowed', false, 'message', 'Meal Builder is not available on your plan. Upgrade to access this feature.');
          END IF;
        WHEN 'nutrition_tracking' THEN
          IF NOT v_plan.has_nutrition_tracking THEN
            RETURN jsonb_build_object('allowed', false, 'message', 'Nutrition Tracking is not available on your plan. Upgrade to access this feature.');
          END IF;
      END CASE;
      RETURN jsonb_build_object('allowed', true);
      
    ELSE
      RETURN jsonb_build_object('allowed', true);
  END CASE;
END;
$$;

COMMENT ON FUNCTION public.check_feature_limit(UUID, TEXT, INTEGER) IS
  'Client-facing plan-limit pre-check. Resolves the plan through effective_plan_id so App Store subscribers are not treated as free. The authoritative gate is the enforce_plan_row_limit trigger.';

-- --- who may call the resolver ----------------------------------------------
--
-- effective_plan_id is SECURITY DEFINER and takes a user id as an argument, so
-- left executable by PUBLIC it would let any signed-in user ask which plan
-- anyone else is on -- reading apple_subscriptions and
-- complementary_subscriptions straight past their RLS policies. It exists for
-- check_feature_limit and enforce_plan_row_limit to call, and both are
-- themselves SECURITY DEFINER, so the inner call still runs as the definer with
-- the grant removed. Nothing in the client calls it directly.
REVOKE ALL ON FUNCTION public.effective_plan_id(UUID) FROM PUBLIC;
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.effective_plan_id(UUID) FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN
  -- Roles absent outside a Supabase instance (a bare Postgres test harness).
  NULL;
END $$;

-- --- the usage dashboard, so it agrees with the limits ----------------------
--
-- get_usage_stats (migration 20251107000001, read by src/hooks/useUsageStats.ts)
-- reads Stripe and complementary but not Apple. Left alone it would report
-- 'Free' and a 1-child cap to an App Store subscriber whose inserts now
-- correctly succeed -- a dashboard contradicting the database.
--
-- Reproduced verbatim with ONE block INSERTED (the Apple lookup) and nothing
-- removed or reordered, for the same reason as check_feature_limit above.
CREATE OR REPLACE FUNCTION get_usage_stats(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan RECORD;
  v_stats JSONB;
  v_children_count INTEGER;
  v_pantry_foods_count INTEGER;
  v_today_ai_requests INTEGER;
  v_month_food_tracker INTEGER;
  v_is_complementary BOOLEAN := FALSE;
BEGIN
  -- Get user's plan (check for active complementary subscription first)
  SELECT sp.*, us.is_complementary
  INTO v_plan
  FROM user_subscriptions us
  JOIN subscription_plans sp ON us.plan_id = sp.id
  WHERE us.user_id = p_user_id
    AND us.status IN ('active', 'trialing')
  LIMIT 1;

  -- Store complementary status
  IF v_plan IS NOT NULL THEN
    v_is_complementary := COALESCE(v_plan.is_complementary, FALSE);
  END IF;

  -- If no paid/trial subscription, check for active complementary subscription
  IF v_plan IS NULL THEN
    SELECT sp.*, TRUE as is_complementary
    INTO v_plan
    FROM complementary_subscriptions cs
    JOIN subscription_plans sp ON cs.plan_id = sp.id
    WHERE cs.user_id = p_user_id
      AND cs.status = 'active'
      AND (cs.end_date IS NULL OR cs.end_date >= NOW())
    ORDER BY cs.created_at DESC
    LIMIT 1;

    IF v_plan IS NOT NULL THEN
      v_is_complementary := TRUE;
    END IF;
  END IF;

  -- App Store (US-780, 2026-09-03). Inserted between the complementary check
  -- and the Free fallback so the two blocks above stay byte-identical to
  -- migration 20251107000001: a Stripe or comped user takes exactly the path
  -- they took before, and only the case that used to fall through to Free is
  -- changed. Without this the dashboard tells an App Store subscriber they are
  -- on the Free plan while the limit checks correctly treat them as paid.
  IF v_plan IS NULL THEN
    SELECT sp.* INTO v_plan
    FROM subscription_plans sp
    WHERE sp.id = public.effective_plan_id(p_user_id);
  END IF;

  -- If still no subscription, use Free plan
  IF v_plan IS NULL THEN
    SELECT * INTO v_plan
    FROM subscription_plans
    WHERE name = 'Free'
    LIMIT 1;
  END IF;

  -- Get actual usage counts
  SELECT COUNT(*) INTO v_children_count
  FROM kids
  WHERE user_id = p_user_id;

  SELECT COUNT(*) INTO v_pantry_foods_count
  FROM foods
  WHERE user_id = p_user_id;

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

-- --- the same gap in RLS: Professional-gated custom domains -----------------
--
-- professional_custom_domains and professional_brand_settings (migration
-- 20251111000000, reached from src/pages/dashboard/ProfessionalSettings.tsx)
-- gate INSERT on a Stripe-only EXISTS:
--
--   EXISTS (SELECT 1 FROM user_subscriptions us JOIN subscription_plans sp ...
--           WHERE us.status = 'active' AND sp.name = 'Professional')
--
-- com.eatpal.app.professional.{monthly,yearly} are real StoreKit products
-- (ios/EatPal/EatPal/Services/StoreKitService.swift), so an App Store
-- Professional subscriber opening Professional Settings on the web gets an RLS
-- denial on a feature they pay for. Same bug as the limits, different mechanism.
--
-- These policies BROADEN access, which the migration rules list as always safe.
-- The SELECT/UPDATE/DELETE policies are untouched.

-- RLS expressions run as the querying user, and effective_plan_id is revoked
-- from them above. This wrapper takes no argument -- it can only ever report on
-- the caller -- so granting it leaks nothing.
CREATE OR REPLACE FUNCTION public.current_user_plan_name()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sp.name FROM subscription_plans sp
  WHERE sp.id = public.effective_plan_id(auth.uid());
$$;

COMMENT ON FUNCTION public.current_user_plan_name() IS
  'The calling user''s effective plan name across all three stores, or NULL. Argument-free so it cannot be used to read another user''s plan; use it in RLS policies instead of a hand-written user_subscriptions EXISTS.';

DO $$
BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.current_user_plan_name() TO anon, authenticated';
EXCEPTION WHEN undefined_object THEN
  NULL;  -- roles absent outside a Supabase instance
END $$;

-- Guarded on the table existing. It is created by migration 20251111000000 and
-- will be there in every ordered run, but an environment that somehow lacks it
-- must not take down the entitlement fix above with it -- the limits matter to
-- every paying customer, the custom-domain policies to a handful.
DO $policies$
BEGIN
  IF to_regclass('public.professional_custom_domains') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can insert their own custom domain" ON public.professional_custom_domains;
    CREATE POLICY "Users can insert their own custom domain"
      ON public.professional_custom_domains FOR INSERT
      WITH CHECK (
        user_id = auth.uid()
        AND public.current_user_plan_name() = 'Professional'
      );
  END IF;

  IF to_regclass('public.professional_brand_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can insert their own brand settings" ON public.professional_brand_settings;
    CREATE POLICY "Users can insert their own brand settings"
      ON public.professional_brand_settings FOR INSERT
      WITH CHECK (
        user_id = auth.uid()
        AND public.current_user_plan_name() = 'Professional'
      );
  END IF;
END
$policies$;
