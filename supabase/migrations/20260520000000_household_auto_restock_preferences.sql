-- US-299: Predictive pantry depletion forecasting — forward-compat
-- scaffolding for cross-device sync of the auto-restock preferences.
--
-- The shipping UI persists these in localStorage today (see
-- src/hooks/useAutoRestockPref.ts). This migration creates the server
-- home so a later release can read/write through the typed client
-- without a schema change.
--
-- Per CLAUDE.md backward-compat rules:
--   * Additive only — no DROP/RENAME on existing tables.
--   * Defaults make this safe for older clients (they ignore the table).
--   * RLS is household-scoped to mirror grocery_items / plan_entries.
--
-- The companion `auto_restock_blocklist` table mirrors the 7-day per-
-- product 'Not quite' memory we keep client-side, again as forward-
-- compat scaffolding.

-- =====================================================================
-- 1. household_preferences (single row per household)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.household_preferences (
  household_id UUID PRIMARY KEY REFERENCES public.households(id) ON DELETE CASCADE,
  auto_restock_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- Lead time (days). When forecast.daysToDepletion <= this value, the
  -- predictor adds the food to the active grocery list.
  auto_restock_lead_days SMALLINT NOT NULL DEFAULT 2 CHECK (auto_restock_lead_days BETWEEN 0 AND 7),
  -- Cap on how many auto-adds we allow per household per day. The
  -- client also enforces this; the column is the server-side ceiling.
  auto_restock_max_per_day SMALLINT NOT NULL DEFAULT 20 CHECK (auto_restock_max_per_day BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.household_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members view prefs"
  ON public.household_preferences
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_preferences.household_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY "Household members upsert prefs"
  ON public.household_preferences
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_preferences.household_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY "Household members update prefs"
  ON public.household_preferences
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = household_preferences.household_id
        AND hm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.household_preferences IS
  'US-299: household-scoped preferences for predictive features. Auto-restock toggle + lead time + daily cap. Single row per household; managed via the upsert path from the client.';

-- =====================================================================
-- 2. auto_restock_blocklist (per-household "skip for a week" memory)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.auto_restock_blocklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name_normalized TEXT NOT NULL,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- TTL the client honours; server may also gc on read.
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days'
);

CREATE UNIQUE INDEX IF NOT EXISTS auto_restock_blocklist_unique
  ON public.auto_restock_blocklist(household_id, name_normalized);

CREATE INDEX IF NOT EXISTS auto_restock_blocklist_expires_idx
  ON public.auto_restock_blocklist(expires_at);

ALTER TABLE public.auto_restock_blocklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members view blocklist"
  ON public.auto_restock_blocklist
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = auto_restock_blocklist.household_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY "Household members insert blocklist"
  ON public.auto_restock_blocklist
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = auto_restock_blocklist.household_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY "Household members delete blocklist"
  ON public.auto_restock_blocklist
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = auto_restock_blocklist.household_id
        AND hm.user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.auto_restock_blocklist IS
  'US-299: per-household "do not auto-add" list for the depletion forecaster. Mirrors the client-side 7-day blocklist driven by the in-row "Not quite" action.';
