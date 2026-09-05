-- US-785: make the ledger dark-launch comparison queryable.
--
-- Kitchen-loop US-671 reads the inventory ledger behind a feature flag and,
-- while the flag is OFF, compares the ledger balance against the legacy
-- foods.quantity column and logs whatever disagrees. That comparison is the
-- evidence the flag flip is supposed to wait for: the design spec's safety
-- rail says to run both side by side on real households and flip only when
-- they agree, and household-planner US-739 AC 6 requires the agreement rate
-- to be recorded before the ledger read becomes the default.
--
-- The problem is where the evidence goes. It goes to logger.warn, which in
-- production means a Sentry breadcrumb -- and a breadcrumb only transmits
-- attached to a captured error. So on a household where nothing crashes, the
-- comparison runs, disagrees, and says so to nobody. There is no way to answer
-- "what fraction of households agree" from what we collect today, which means
-- the gate on the flip cannot actually be evaluated.
--
-- One row per settled comparison run. Additive: a new table, nothing else
-- touched, and no shipped iOS build reads or writes it.

CREATE TABLE IF NOT EXISTS public.stock_comparison_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  sampled_at timestamptz NOT NULL DEFAULT now(),

  -- Denominators. Without them a divergence count means nothing: 3 disagreements
  -- across 5 items and across 500 items are different findings.
  item_count integer NOT NULL,
  stock_row_count integer NOT NULL,

  -- 0 means this household agreed on this run. The agreement rate is the share
  -- of runs where this is 0, which is why it is a plain column and not derived
  -- from the jsonb below.
  divergence_count integer NOT NULL,

  -- Per-kind counts, e.g. {"missing_stock_row": 4, "value_mismatch": 1}.
  divergence_kinds jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- The capped per-item detail, so "top divergent items" can be answered
  -- without a second table. Capped by the client for the same reason the log
  -- was: an un-backfilled household diverges on every row.
  divergences jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Which build produced the sample, so a fix can be told apart from a
  -- regression when reading the rate over time.
  app_version text,

  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stock_comparison_samples IS
  'US-785: one row per settled ledger-vs-legacy comparison run, so the US-671 dark launch can be evaluated. Read by supabase/diagnostics/us-785-stock-comparison.sql. Retire once the ledger read is the default and US-689 removes the legacy mirrors.';

CREATE INDEX IF NOT EXISTS stock_comparison_samples_household_sampled_idx
  ON public.stock_comparison_samples (household_id, sampled_at DESC);

-- Every new table gets RLS (CLAUDE.md, and the US-641 CI gate).
ALTER TABLE public.stock_comparison_samples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view their household comparison samples"
  ON public.stock_comparison_samples;
CREATE POLICY "Members view their household comparison samples"
  ON public.stock_comparison_samples
  FOR SELECT
  USING (household_id = public.get_user_household_id(auth.uid()));

DROP POLICY IF EXISTS "Members insert their household comparison samples"
  ON public.stock_comparison_samples;
CREATE POLICY "Members insert their household comparison samples"
  ON public.stock_comparison_samples
  FOR INSERT
  WITH CHECK (
    household_id = public.get_user_household_id(auth.uid())
    AND user_id = auth.uid()
  );

-- No UPDATE or DELETE policy, deliberately. These are append-only observations:
-- a client that can rewrite its own measurements can make the agreement rate
-- say anything, and the whole point of the table is to be the thing a release
-- decision is checked against.
