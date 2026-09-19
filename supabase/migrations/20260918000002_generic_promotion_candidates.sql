-- US-798: which names enough separate households have typed to be worth
-- promoting into the shared catalog, and nothing more than that.
--
-- PRIVACY IS THE POINT OF THE GATE. A household food row is private data:
-- "Grandma's casserole", or a row carrying a child's name, must never reach a
-- public catalog. Requiring several UNRELATED households to have independently
-- typed the same name is itself a decent privacy filter, and the human review
-- in NutritionManager is the backstop. This function is the first half of that
-- and is built to leak nothing on its own: it returns a normalized name and a
-- count, never a household id, a user id or a row id, so a leaked result set
-- cannot be traced back to anyone.
--
-- NO DENORMALISED COUNTER, deliberately. foods.times_added counts ADDS, so one
-- household adding the same food five times would trip a threshold of five by
-- itself. The count here is count(DISTINCT household_id), computed when the
-- queue is opened. US-784 and US-785 exist in this repo because a stored count
-- drifted from the rows it summarised; a second counter here would be the same
-- bug waiting.
--
-- THE THRESHOLD IS A PARAMETER, not a literal in this body. The story asks for
-- one named constant that can be raised without a migration, so the constant
-- lives in the caller (GENERIC_PROMOTION_MIN_HOUSEHOLDS in
-- src/lib/genericPromotion.ts) and is passed in. The default of 3 here is a
-- floor for a caller that passes nothing, not the setting.
--
-- Additive: one new function. No table, column or policy is touched.

CREATE OR REPLACE FUNCTION public.generic_promotion_candidates(
  p_min_households INT DEFAULT 3,
  p_limit INT DEFAULT 200
)
RETURNS TABLE (
  name_normalized TEXT,
  household_count BIGINT,
  sample_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $generic_promotion_candidates$
BEGIN
  -- Admin only, checked inside rather than left to a GRANT. The revoke below
  -- is the other half; US-804 is in this repo because a REVOKE that named only
  -- PUBLIC left anon's direct grant untouched, and a SECURITY DEFINER function
  -- that reads every household's foods is exactly the shape that must not
  -- depend on a single privilege line being right.
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'generic_promotion_candidates: admin role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_min_households < 2 THEN
    -- A threshold of one is not a frequency gate, it is a publication of one
    -- household's private row. Refuse rather than quietly clamp: a caller that
    -- passed 1 has misunderstood what this is for.
    RAISE EXCEPTION 'generic_promotion_candidates: p_min_households must be at least 2, got %',
      p_min_households USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN QUERY
  SELECT
    public.normalize_product_name(f.name) AS name_normalized,
    count(DISTINCT f.household_id) AS household_count,
    -- One example of how families actually spell it, for the reviewer to read.
    -- min() rather than any row, so the queue is stable between openings.
    min(f.name) AS sample_name
  FROM public.foods f
  WHERE f.household_id IS NOT NULL
    AND f.canonical_id IS NULL
    AND btrim(coalesce(f.name, '')) <> ''
    AND f.merged_into_id IS NULL
    -- Already in the catalog under this name: nothing to promote.
    AND NOT EXISTS (
      SELECT 1 FROM public.grocery_product_catalog c
       WHERE c.name_normalized = public.normalize_product_name(f.name)
    )
  GROUP BY public.normalize_product_name(f.name)
  HAVING count(DISTINCT f.household_id) >= p_min_households
  ORDER BY count(DISTINCT f.household_id) DESC, 1 ASC
  LIMIT greatest(p_limit, 1);
END;
$generic_promotion_candidates$;

COMMENT ON FUNCTION public.generic_promotion_candidates(INT, INT) IS
  'US-798: normalized food names typed by at least p_min_households SEPARATE households with no catalog match. count(DISTINCT household_id) computed live -- never a stored counter, because times_added counts adds and one household adding a food three times must not trip a threshold of three. Admin only, and returns no household or user identifiers.';

-- US-804: name the roles. REVOKE ... FROM PUBLIC alone leaves the direct
-- grant Supabase's default ACL gives anon at creation, and this function reads
-- every household's foods.
REVOKE ALL ON FUNCTION public.generic_promotion_candidates(INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generic_promotion_candidates(INT, INT) TO authenticated;
