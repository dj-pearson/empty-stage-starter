-- US-785: read the ledger dark-launch comparison.
--
-- Kitchen-loop US-671 compares the inventory ledger against the legacy
-- foods.quantity column while the ledger flag is OFF. The design spec's safety
-- rail is to flip that flag only once the two agree on real households, and
-- household-planner US-739 AC 6 requires the agreement rate to be written into
-- that story before the flag defaults on. These queries are where that number
-- comes from.
--
-- Read-only. Run against production with a read-only role.
--
-- WHAT "AGREEMENT" MEANS HERE: a sample agrees when divergence_count = 0.
-- Note that summarizeDivergences also reports `drifting`, which excludes
-- missing_stock_row (the US-669 backfill has not reached that item) and
-- mirror_unconvertible (the server declined to write). Query 2 splits those
-- out, because a household that is merely un-backfilled is not evidence the
-- ledger is wrong, and counting it as such would hold the flip forever.

-- 1. Headline: agreement rate across every household that reported.
SELECT
  count(*)                                             AS samples,
  count(*) FILTER (WHERE divergence_count = 0)         AS agreeing_samples,
  round(
    100.0 * count(*) FILTER (WHERE divergence_count = 0) / nullif(count(*), 0),
    1
  )                                                    AS agreement_pct,
  count(DISTINCT household_id)                         AS households,
  count(DISTINCT household_id) FILTER (WHERE divergence_count = 0) AS households_ever_agreeing,
  min(sampled_at)                                      AS first_sample,
  max(sampled_at)                                      AS last_sample
FROM public.stock_comparison_samples;

-- 2. The same, ignoring the two kinds that are not the ledger being wrong.
--    This is the number to quote when deciding the flip.
SELECT
  count(*) AS samples,
  count(*) FILTER (
    WHERE coalesce((divergence_kinds ->> 'value_mismatch')::int, 0)
        + coalesce((divergence_kinds ->> 'orphan_stock')::int, 0)
        + coalesce((divergence_kinds ->> 'unconvertible')::int, 0) = 0
  ) AS samples_without_real_drift,
  round(
    100.0 * count(*) FILTER (
      WHERE coalesce((divergence_kinds ->> 'value_mismatch')::int, 0)
          + coalesce((divergence_kinds ->> 'orphan_stock')::int, 0)
          + coalesce((divergence_kinds ->> 'unconvertible')::int, 0) = 0
    ) / nullif(count(*), 0),
    1
  ) AS real_agreement_pct
FROM public.stock_comparison_samples;

-- 3. Per household: latest sample, so one noisy household cannot dominate the
--    headline by sampling more often than everyone else.
SELECT DISTINCT ON (household_id)
  household_id,
  sampled_at,
  item_count,
  stock_row_count,
  divergence_count,
  divergence_kinds,
  app_version
FROM public.stock_comparison_samples
ORDER BY household_id, sampled_at DESC;

-- 4. Which kinds dominate, across the latest sample per household.
WITH latest AS (
  SELECT DISTINCT ON (household_id) *
  FROM public.stock_comparison_samples
  ORDER BY household_id, sampled_at DESC
)
SELECT
  kind,
  sum(cnt::int)                       AS total,
  count(*) FILTER (WHERE cnt::int > 0) AS households_affected
FROM latest, jsonb_each_text(latest.divergence_kinds) AS k(kind, cnt)
GROUP BY kind
ORDER BY total DESC;

-- 5. Top divergent items across the latest sample per household.
WITH latest AS (
  SELECT DISTINCT ON (household_id) *
  FROM public.stock_comparison_samples
  ORDER BY household_id, sampled_at DESC
),
items AS (
  SELECT
    d ->> 'itemId'        AS item_id,
    d ->> 'kind'          AS kind,
    d ->> 'canonicalUnit' AS canonical_unit,
    (d ->> 'ledgerValue')::numeric AS ledger_value,
    (d ->> 'legacyValue')::numeric AS legacy_value
  FROM latest, jsonb_array_elements(latest.divergences) AS d
)
SELECT
  item_id,
  kind,
  canonical_unit,
  count(*)                                  AS households,
  round(avg(abs(ledger_value - legacy_value)), 3) AS avg_abs_gap
FROM items
GROUP BY item_id, kind, canonical_unit
ORDER BY households DESC, avg_abs_gap DESC NULLS LAST
LIMIT 50;

-- 6. Rate over time by build, so a fix is distinguishable from a regression.
SELECT
  date_trunc('day', sampled_at)::date AS day,
  app_version,
  count(*)                            AS samples,
  round(
    100.0 * count(*) FILTER (WHERE divergence_count = 0) / nullif(count(*), 0),
    1
  )                                   AS agreement_pct
FROM public.stock_comparison_samples
GROUP BY 1, 2
ORDER BY 1 DESC, 2;
