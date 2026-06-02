-- US-318: close missing RLS DELETE/INSERT policy gaps on recent tables.
--
-- Several tables added in the 2026-05-20 batch enabled RLS but shipped
-- without the full SELECT/INSERT/UPDATE/DELETE coverage CLAUDE.md requires.
-- With RLS on and no matching policy, the operation silently no-ops (zero
-- rows affected, no error) the moment a client tries it. This migration
-- adds the missing owner/household-scoped policies.
--
-- Per CLAUDE.md backward-compat rules:
--   * Additive only — no DROP/RENAME of columns or tables.
--   * New DELETE policies BROADEN access (previously: no one could delete),
--     so older clients are unaffected — they simply never issued a DELETE.
--   * The picky_win_preferences UPDATE policy is recreated to add WITH CHECK;
--     this only blocks reassigning a row to a different user_id, which no
--     legitimate client does, so in-flight updates from older clients keep
--     working.
--   * All statements are idempotent (DROP POLICY IF EXISTS before CREATE) so
--     re-running the migration is safe.

-- =====================================================================
-- household_preferences — had SELECT/INSERT/UPDATE, no DELETE.
-- A household may want to clear its prefs row (reset to defaults).
-- =====================================================================
DROP POLICY IF EXISTS "Household members delete prefs" ON public.household_preferences;
CREATE POLICY "Household members delete prefs"
  ON public.household_preferences
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_preferences.household_id
        AND hm.user_id = auth.uid()
    )
  );

-- =====================================================================
-- insights_seasonal_recall — had SELECT/UPDATE (dismiss), no DELETE.
-- INSERT stays service-role-only (cron-populated); that is intentional
-- and already documented on the table. Add a household-scoped DELETE so
-- members can clear stale recall rows without waiting for the cron.
-- =====================================================================
DROP POLICY IF EXISTS "Household members delete recalls" ON public.insights_seasonal_recall;
CREATE POLICY "Household members delete recalls"
  ON public.insights_seasonal_recall
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = insights_seasonal_recall.household_id
        AND hm.user_id = auth.uid()
    )
  );

-- =====================================================================
-- kid_growth_events — had SELECT/INSERT/UPDATE, no DELETE.
-- Mirror the existing member-scoped pattern (kid owner OR household
-- member) so a parent can delete a growth event they own.
-- (kid_allergen_change_log is intentionally append-only — left as-is.)
-- =====================================================================
DROP POLICY IF EXISTS "Members delete kid growth events" ON public.kid_growth_events;
CREATE POLICY "Members delete kid growth events"
  ON public.kid_growth_events
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.kids k
      LEFT JOIN public.household_members hm ON hm.household_id = k.household_id
      WHERE k.id = kid_growth_events.kid_id
        AND (k.user_id = auth.uid() OR hm.user_id = auth.uid())
    )
  );

-- =====================================================================
-- picky_win_preferences — UPDATE policy had USING but no WITH CHECK.
-- Without WITH CHECK, an UPDATE's *new* row values aren't re-validated,
-- so a user could in principle set user_id to another account. Recreate
-- the policy with both clauses for parity with user_preferences.
-- =====================================================================
DROP POLICY IF EXISTS "Users update own picky_win prefs" ON public.picky_win_preferences;
CREATE POLICY "Users update own picky_win prefs"
  ON public.picky_win_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
