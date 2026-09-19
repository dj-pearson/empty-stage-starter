-- US-800 (found) / US-780 (owns): an admin comp grants nothing.
--
-- effective_plan_id() reads user_subscriptions and apple_subscriptions. It has
-- never read complementary_subscriptions. check_feature_limit() resolves
-- through effective_plan_id, and the plan-limit triggers resolve through
-- check_feature_limit -- so a user granted a complimentary Family Plus
-- subscription is capped at one child, refused the AI coach, and refused a
-- 51st pantry food, exactly like a free account. The comp row exists, reads
-- 'active', and is visible to has_active_complementary_subscription() and
-- get_usage_stats(); nothing that enforces a limit consults either.
--
-- HOW IT SURVIVED. supabase/tests/us780_apple_entitlement.test.sql has
-- asserted this since it was written -- "CASE 2: an admin comp is not treated
-- as free either" -- and had never been executed. US-800 is the story that
-- made the SQL suites run in CI; this is the first thing they said. The suite
-- printed its answers next to the word EXPECTED and left the comparison to a
-- reader, so even a manual run only caught it if someone checked the number.
--
-- The fix is one more arm on the same UNION. Precedence 2 sits between Stripe
-- (1) and Apple (3), which only matters as a tiebreak: the ORDER BY already
-- prefers the most generous entitlement a user holds, so gaining a comp can
-- never downgrade anyone. The predicate is the one
-- has_active_complementary_subscription() already uses, so the two cannot
-- drift into disagreeing about what "active" means.
--
-- Additive: no column, table or signature changes, and a user with no comp row
-- resolves exactly as before.

CREATE OR REPLACE FUNCTION public.effective_plan_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT plan_id FROM (
    SELECT us.plan_id, 1 AS precedence, us.updated_at, sp.max_children
    FROM user_subscriptions us JOIN subscription_plans sp ON sp.id = us.plan_id
    WHERE us.user_id = p_user_id AND us.status IN ('active', 'trialing')
    UNION ALL
    -- US-800: the arm that was missing.
    SELECT cs.plan_id, 2, cs.updated_at, sp.max_children
    FROM complementary_subscriptions cs
    JOIN subscription_plans sp ON sp.id = cs.plan_id
    WHERE cs.user_id = p_user_id
      AND cs.status = 'active'
      AND (cs.end_date IS NULL OR cs.end_date >= now())
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
$function$;

COMMENT ON FUNCTION public.effective_plan_id(uuid) IS
  'The most generous plan a user is entitled to, across Stripe, an admin comp and the App Store. US-800 added the comp arm: before that a complimentary Family Plus subscription granted nothing, because every limit check resolves through here.';

-- US-804: this takes a user id, so a client able to call it could report on
-- anybody. Re-asserted after CREATE OR REPLACE, which does not reset grants
-- but does run under the schema default ACL if the function is new to a
-- database built from scratch.
REVOKE ALL ON FUNCTION public.effective_plan_id(uuid) FROM PUBLIC, anon, authenticated;
