-- US-296: Picky-Eater Win Network — feature flag + share-pref scaffolding.
--
-- Seeds the `picky_win_network` feature flag at `enabled = false`. This is
-- the AC's hard requirement: the dedicated "Community Wins" surface must
-- not light up in production until the privacy/security review the AC
-- mandates has signed off. The flag turns ON the stricter 20-row k-anon
-- floor applied by src/lib/pickyWinGuard.ts (vs. the existing inline panel
-- which uses the server's 5-row floor for back-compat).
--
-- Also creates a forward-compat home for the `share_chain_outcomes` per-
-- user preference. The shipping UI persists this in localStorage today
-- (src/hooks/usePickyWinSharePref.ts); cross-device sync lands when the
-- typed client picks up the table.
--
-- Per CLAUDE.md backward-compat rules:
--   * Additive only — INSERT … ON CONFLICT DO NOTHING so re-running is a
--     no-op and existing rows aren't overwritten.
--   * No DROP / RENAME on existing tables.
--   * Default-OFF posture; absolutely no UI activation in this migration.

-- =====================================================================
-- 1. Seed the feature flag (only if `feature_flags` exists in this env)
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'feature_flags'
  ) THEN
    -- Only seed if the row doesn't already exist. Don't touch an
    -- explicitly-enabled flag set by an operator out-of-band.
    INSERT INTO public.feature_flags (key, name, enabled, rollout_percentage, description)
    VALUES (
      'picky_win_network',
      'Picky-Eater Win Network (Community Wins surface)',
      FALSE,
      0,
      'US-296 dedicated "Community Wins" surface with the AC-mandated 20-row k-anonymity floor. Default OFF in production until privacy/security review approves the surface. Existing inline 5-floor WinNetworkPanel is unaffected by this flag.'
    )
    ON CONFLICT (key) DO NOTHING;
  END IF;
END
$$;

-- =====================================================================
-- 2. Forward-compat preference home
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.picky_win_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  share_chain_outcomes BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.picky_win_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own picky_win prefs"
  ON public.picky_win_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users upsert own picky_win prefs"
  ON public.picky_win_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own picky_win prefs"
  ON public.picky_win_preferences
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own picky_win prefs"
  ON public.picky_win_preferences
  FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.picky_win_preferences IS
  'US-296: per-user opt-in to share food-chain outcomes anonymously to the Picky-Eater Win Network aggregate. Default TRUE; respected by recordContributionsFromAttempt() in src/lib/chainNetwork.ts via a localStorage mirror today (server sync deferred until typed client picks up this table).';
