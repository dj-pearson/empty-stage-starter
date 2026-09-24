-- AI Coach daily limit on the server (owner decision 1a, 2026-09-24).
--
-- ai-coach-chat now calls check_feature_limit(user, 'ai_coach') before the
-- model and increment_usage(user, 'ai_coach') after a reply. Web callers
-- (X-Client-Info: eatpal-web...) are refused over the limit. Shipped iOS builds
-- send no such header and get a grace period: metered, never refused by the
-- daily limit, until the owner flips the flag below. The decision itself lives
-- in supabase/functions/_shared/aiCoachGate.ts.
--
-- 1. The kill switch. feature_flags 'ai_coach_limit_enforce_legacy', seeded
--    DISABLED. The function reads only `enabled` (service role, so the
--    "Anyone can view enabled flags" policy does not hide a disabled row from
--    it). To end the grace period without a deploy:
--
--      UPDATE public.feature_flags SET enabled = true, updated_at = now()
--       WHERE key = 'ai_coach_limit_enforce_legacy';
--
--    Setting it back to false restores grace. A missing row reads as false.
--    ON CONFLICT DO NOTHING so a replay never flips a value the owner set.
--
-- 2. An hourly budget for ai-coach-chat in rate_limit_config: 30/hr on every
--    tier. Without a row gateAiRequest falls back to the RPC's 50/hr. This
--    applies to iOS immediately (it is not part of the grace period); 30 turns
--    an hour is well above a conversation's pace. ON CONFLICT DO NOTHING so a
--    value tuned in production is left alone.
--
-- Backward-compatible: two additive rows, both guarded on their table (and
-- the columns this writes) existing, since production trails the tree.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'feature_flags'
  ) THEN
    INSERT INTO public.feature_flags (key, name, enabled, rollout_percentage, description)
    VALUES (
      'ai_coach_limit_enforce_legacy',
      'AI Coach: enforce the daily limit for legacy iOS builds',
      FALSE,
      0,
      'Owner decision 1a. When enabled, ai-coach-chat refuses (402 ai_coach_limit) callers that do not send X-Client-Info: eatpal-web..., i.e. shipped iOS builds, once they are over their plan''s daily AI Coach limit. Disabled = grace period: those callers are metered but not refused. Only `enabled` is read.'
    )
    ON CONFLICT (key) DO NOTHING;
  END IF;
END;
$$;

DO $$
BEGIN
  IF (
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rate_limit_config'
      AND column_name IN ('endpoint', 'free_tier_limit', 'premium_tier_limit',
                          'enterprise_tier_limit', 'window_minutes', 'description')
  ) = 6 THEN
    INSERT INTO public.rate_limit_config
      (endpoint, free_tier_limit, premium_tier_limit, enterprise_tier_limit, window_minutes, description)
    VALUES
      ('ai-coach-chat', 30, 30, 30, 60, 'AI Coach chat turns per hour, every tier (the daily plan limit is separate: check_feature_limit ai_coach)')
    ON CONFLICT (endpoint) DO NOTHING;
  END IF;
END;
$$;
