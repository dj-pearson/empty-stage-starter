-- US-300: Seasonal memory recall — forward-compat scaffolding for the
-- cross-device / cron home of the candidate cache.
--
-- The shipping UI computes candidates client-side from already-loaded
-- plan_entries + recipes (see src/lib/seasonalRecall.ts). When the typed
-- client picks up this table the dashboard card swaps the source from
-- "compute on the fly" to "read from the cron-populated cache" without
-- a UI change — the RecallCandidate shape lines up 1:1 with this row.
--
-- Per CLAUDE.md backward-compat rules:
--   * Additive only.
--   * RLS household-scoped to mirror plan_entries.
--   * No DROP/RENAME on existing tables.

CREATE TABLE IF NOT EXISTS public.insights_seasonal_recall (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  prior_week_start DATE NOT NULL,
  prior_rating NUMERIC,
  life_event_tag TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS insights_seasonal_recall_household_idx
  ON public.insights_seasonal_recall(household_id, generated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS insights_seasonal_recall_unique
  ON public.insights_seasonal_recall(household_id, recipe_id, prior_week_start);

ALTER TABLE public.insights_seasonal_recall ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members view recalls"
  ON public.insights_seasonal_recall
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = insights_seasonal_recall.household_id
        AND hm.user_id = auth.uid()
    )
  );

CREATE POLICY "Household members update recalls"
  ON public.insights_seasonal_recall
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members hm
      WHERE hm.household_id = insights_seasonal_recall.household_id
        AND hm.user_id = auth.uid()
    )
  );

-- Service role inserts via the planned daily cron edge function. No
-- INSERT policy for `authenticated` — the client doesn't write here.

COMMENT ON TABLE public.insights_seasonal_recall IS
  'US-300: cached "what worked last year" candidate set. Single source of truth for the dashboard insight card once the daily cron edge function ships. UI computes candidates client-side until then.';
