-- Server-side enforcement of pantry-food and child-profile plan limits.
--
-- Why: the limits were only enforced client-side via the check_feature_limit
-- RPC before a plain RLS INSERT. A user could bypass the check entirely from
-- devtools (supabase.from('foods').insert([...])) — RLS permits it because they
-- own the row — and gain paid-tier value for free. This adds a BEFORE INSERT
-- trigger that re-checks the limit in the database, so the client check becomes
-- UX-only and the server is authoritative.
--
-- Backward compatibility (CLAUDE.md migration rules): this is additive — a new
-- SECURITY DEFINER function plus two triggers. It rejects ONLY inserts that
-- exceed a finite plan limit. Every shipped client (web + iOS) already runs the
-- identical check_feature_limit gate before inserting, so legitimate clients
-- never reach the rejection; only direct/over-limit inserts do. Users already at
-- or over a limit keep all existing rows — they simply can't add more, which is
-- the intended behavior and matches the client. Paid tiers store NULL limits
-- (unlimited) and are never affected.

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
  -- Resolve the inserting user's effective plan: their active/trialing
  -- subscription if any, otherwise the Free plan. Distinguish "no subscription"
  -- from "subscription whose limit is NULL (unlimited)" so a paid user is never
  -- mistakenly capped at Free limits.
  SELECT us.plan_id INTO v_plan_id
  FROM user_subscriptions us
  WHERE us.user_id = NEW.user_id
    AND us.status IN ('active', 'trialing')
  ORDER BY us.updated_at DESC NULLS LAST
  LIMIT 1;

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

  -- Count the household's existing rows in this table — the same scope the app
  -- loads and counts foods/kids by. Block when already at/over the limit, which
  -- mirrors the client's check_feature_limit (current_count >= max).
  --
  -- Note: this is a per-row check. A single multi-row INSERT can overshoot by up
  -- to (batch size - 1) because sibling rows in the same statement aren't yet
  -- visible to the count; every subsequent insert is then blocked once the
  -- committed count reaches the limit. That is an accepted, bounded gap — the
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

DROP TRIGGER IF EXISTS enforce_pantry_foods_limit ON public.foods;
CREATE TRIGGER enforce_pantry_foods_limit
  BEFORE INSERT ON public.foods
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_plan_row_limit('max_pantry_foods', 'Pantry food');

DROP TRIGGER IF EXISTS enforce_children_limit ON public.kids;
CREATE TRIGGER enforce_children_limit
  BEFORE INSERT ON public.kids
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_plan_row_limit('max_children', 'Child profile');
