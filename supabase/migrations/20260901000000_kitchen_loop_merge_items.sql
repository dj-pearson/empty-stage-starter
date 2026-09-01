-- US-663: rpc_merge_items -- collapse duplicate catalog rows by redirecting,
-- never by deleting.
--
-- PantryDedup exists in the iOS tree because duplicates are already there:
-- "chicken breast", "chicken breasts" and "boneless chicken breasts" are three
-- rows and one food. US-662 proposes the groups; this applies one, after a
-- parent has approved it (US-664).
--
-- The rule that shapes everything here: a merged duplicate KEEPS EXISTING and
-- gains foods.merged_into_id pointing at its survivor. An older iOS build
-- holding a stale food id must never hit a missing row. Nothing is deleted
-- except where a unique constraint makes two rows impossible, and that case is
-- merged rather than dropped (see the ladder note below).
--
-- Also adds grocery_items.item_id, which the design's Release N lists and no
-- migration had yet created. rpc_merge_items has to repoint it, so it lands
-- here rather than in a story of its own.
--
-- Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md

-- The canonical-item FK on grocery items. Nullable: existing rows have no item
-- and the resolver fills it in going forward (US-680).
ALTER TABLE public.grocery_items
  ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES public.foods(id);

CREATE INDEX IF NOT EXISTS grocery_items_item_idx
  ON public.grocery_items(item_id)
  WHERE item_id IS NOT NULL;

COMMENT ON COLUMN public.grocery_items.item_id IS
  'US-663: canonical foods row this grocery line refers to. NULL for rows created before the resolver, and for lines nobody has resolved yet.';

-- Ladder rungs in order, gentlest first. Mirrors LadderRung in
-- ios/EatPal/EatPal/Ladder/ExposureLadderPolicy.swift and RUNGS in
-- src/lib/exposureLadder.ts. Used only to decide which of two colliding ladder
-- rows is further along.
CREATE OR REPLACE FUNCTION public.ladder_rung_index(rung TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $ladder_rung_index$
  SELECT CASE rung
    WHEN 'looking'      THEN 0
    WHEN 'touching'     THEN 1
    WHEN 'smelling'     THEN 2
    WHEN 'licking'      THEN 3
    WHEN 'tiny_taste'   THEN 4
    WHEN 'small_bite'   THEN 5
    WHEN 'full_bite'    THEN 6
    WHEN 'full_portion' THEN 7
    ELSE 0
  END;
$ladder_rung_index$;

COMMENT ON FUNCTION public.ladder_rung_index(TEXT) IS
  'US-663: ordinal position of an exposure rung, for comparing two ladder rows during a merge. Unknown labels sort to the gentlest rung rather than raising, so a newer client writing a new rung cannot break an older merge.';

CREATE OR REPLACE FUNCTION public.rpc_merge_items(
  survivor_id UUID,
  duplicate_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $rpc_merge_items$
DECLARE
  survivor_household UUID;
  survivor_exists BOOLEAN;
  dupes UUID[];
  mismatched INT;
  missing INT;
  n_recipe_ingredients INT := 0;
  n_plan_entries INT := 0;
  n_grocery_items INT := 0;
  n_item_aliases INT := 0;
  n_ladder_repointed INT := 0;
  n_ladder_merged INT := 0;
  n_recipes_food_ids INT := 0;
  n_marked INT := 0;
  summed NUMERIC := 0;
BEGIN
  IF survivor_id IS NULL OR duplicate_ids IS NULL THEN
    RAISE EXCEPTION 'rpc_merge_items: survivor_id and duplicate_ids are both required';
  END IF;

  -- Drop nulls and any accidental repeat of the survivor's own id. Merging a
  -- row into itself would set merged_into_id = id and create a self-cycle the
  -- resolver would then have to break.
  SELECT array_agg(DISTINCT d)
    INTO dupes
    FROM unnest(duplicate_ids) AS d
   WHERE d IS NOT NULL;

  IF dupes IS NULL OR array_length(dupes, 1) IS NULL THEN
    RAISE EXCEPTION 'rpc_merge_items: duplicate_ids contained no usable ids';
  END IF;

  IF survivor_id = ANY(dupes) THEN
    RAISE EXCEPTION 'rpc_merge_items: survivor_id % appears in duplicate_ids', survivor_id;
  END IF;

  SELECT TRUE, household_id
    INTO survivor_exists, survivor_household
    FROM public.foods
   WHERE id = survivor_id;

  IF survivor_exists IS NOT TRUE THEN
    RAISE EXCEPTION 'rpc_merge_items: survivor % does not exist', survivor_id;
  END IF;

  SELECT count(*) INTO missing
    FROM unnest(dupes) AS d
   WHERE NOT EXISTS (SELECT 1 FROM public.foods f WHERE f.id = d);
  IF missing > 0 THEN
    RAISE EXCEPTION 'rpc_merge_items: % duplicate id(s) do not exist', missing;
  END IF;

  -- Household scoping. IS DISTINCT FROM so two NULL households count as the
  -- same scope rather than as a mismatch.
  SELECT count(*) INTO mismatched
    FROM public.foods
   WHERE id = ANY(dupes)
     AND household_id IS DISTINCT FROM survivor_household;
  IF mismatched > 0 THEN
    RAISE EXCEPTION
      'rpc_merge_items: % duplicate(s) belong to a different household than survivor %',
      mismatched, survivor_id;
  END IF;

  -- Repoint every reference. Order does not matter; none of these have a
  -- unique constraint on food_id except kid_food_ladder, handled below.
  UPDATE public.recipe_ingredients SET food_id = survivor_id WHERE food_id = ANY(dupes);
  GET DIAGNOSTICS n_recipe_ingredients = ROW_COUNT;

  UPDATE public.plan_entries SET food_id = survivor_id WHERE food_id = ANY(dupes);
  GET DIAGNOSTICS n_plan_entries = ROW_COUNT;

  UPDATE public.grocery_items SET item_id = survivor_id WHERE item_id = ANY(dupes);
  GET DIAGNOSTICS n_grocery_items = ROW_COUNT;

  UPDATE public.item_aliases SET item_id = survivor_id WHERE item_id = ANY(dupes);
  GET DIAGNOSTICS n_item_aliases = ROW_COUNT;

  -- recipes.food_ids is a UUID[], so a merged id hides inside an array rather
  -- than in a column. Not named in US-663's list, but leaving it stale would
  -- keep legacy recipes pointing at a row that is no longer the item.
  UPDATE public.recipes
     SET food_ids = (
       SELECT array_agg(DISTINCT CASE WHEN e = ANY(dupes) THEN survivor_id ELSE e END)
         FROM unnest(food_ids) AS e
     )
   WHERE food_ids && dupes;
  GET DIAGNOSTICS n_recipes_food_ids = ROW_COUNT;

  -- kid_food_ladder is UNIQUE (kid_id, food_id), so a child holding a ladder
  -- for BOTH the survivor and a duplicate cannot simply be repointed.
  --
  -- Those two rows are the same child and the same food, so they are merged
  -- rather than one being dropped: the survivor's row takes whichever rung is
  -- further along and the higher counters. Discarding a child's exposure
  -- progress to satisfy a constraint is exactly the kind of silent data loss
  -- this epic exists to stop.
  -- Three sequential statements rather than one data-modifying CTE. Every
  -- sub-statement of a CTE sees the same snapshot, so a DELETE inside one
  -- cannot clear the way for an UPDATE in the same statement; the first draft
  -- of this did exactly that and hit the unique violation it was written to
  -- prevent. Sequential statements each see the previous one's effects.

  -- 1. Fold each duplicate's progress into the survivor's row for that kid.
  --    DISTINCT ON picks the furthest rung; the window maxima take the highest
  --    counters, so two duplicates for one kid both contribute.
  UPDATE public.kid_food_ladder k
     SET current_rung = CASE
           WHEN public.ladder_rung_index(b.current_rung) > public.ladder_rung_index(k.current_rung)
           THEN b.current_rung ELSE k.current_rung END,
         consecutive_successes = GREATEST(k.consecutive_successes, b.succ),
         consecutive_holds     = GREATEST(k.consecutive_holds, b.holds),
         consecutive_refusals  = GREATEST(k.consecutive_refusals, b.refusals),
         last_attempt_at       = GREATEST(
           COALESCE(k.last_attempt_at, b.last_at),
           COALESCE(b.last_at, k.last_attempt_at)
         )
    FROM (
      SELECT DISTINCT ON (kid_id)
             kid_id,
             current_rung,
             max(consecutive_successes) OVER (PARTITION BY kid_id) AS succ,
             max(consecutive_holds)     OVER (PARTITION BY kid_id) AS holds,
             max(consecutive_refusals)  OVER (PARTITION BY kid_id) AS refusals,
             max(last_attempt_at)       OVER (PARTITION BY kid_id) AS last_at
        FROM public.kid_food_ladder
       WHERE food_id = ANY(dupes)
       ORDER BY kid_id, public.ladder_rung_index(current_rung) DESC
    ) b
   WHERE k.kid_id = b.kid_id
     AND k.food_id = survivor_id;

  -- 2. Drop the duplicate rows whose progress has just been folded in.
  DELETE FROM public.kid_food_ladder d
   WHERE d.food_id = ANY(dupes)
     AND EXISTS (
       SELECT 1 FROM public.kid_food_ladder s
        WHERE s.kid_id = d.kid_id AND s.food_id = survivor_id
     );
  GET DIAGNOSTICS n_ladder_merged = ROW_COUNT;

  -- Whatever is left has no conflict and can just be repointed.
  UPDATE public.kid_food_ladder SET food_id = survivor_id WHERE food_id = ANY(dupes);
  GET DIAGNOSTICS n_ladder_repointed = ROW_COUNT;

  -- Roll the duplicates' stock into the survivor.
  --
  -- TODO(US-666): once inventory_movements exists this must append a
  -- `correction` movement per duplicate instead of writing foods.quantity
  -- directly, so the ledger explains where the stock came from. Until then a
  -- direct write is the only way to avoid losing it, and the US-668 trigger
  -- will fold a direct write into a correction anyway once it lands.
  SELECT COALESCE(sum(quantity), 0) INTO summed
    FROM public.foods WHERE id = ANY(dupes) AND quantity IS NOT NULL;

  IF summed <> 0 THEN
    UPDATE public.foods
       SET quantity = COALESCE(quantity, 0) + summed
     WHERE id = survivor_id;
    UPDATE public.foods SET quantity = 0 WHERE id = ANY(dupes);
  END IF;

  -- Redirect, do not delete.
  UPDATE public.foods
     SET merged_into_id = survivor_id,
         updated_at = now()
   WHERE id = ANY(dupes);
  GET DIAGNOSTICS n_marked = ROW_COUNT;

  RETURN jsonb_build_object(
    'survivor_id', survivor_id,
    'duplicates_merged', n_marked,
    'quantity_moved', summed,
    'repointed', jsonb_build_object(
      'recipe_ingredients', n_recipe_ingredients,
      'plan_entries', n_plan_entries,
      'grocery_items', n_grocery_items,
      'item_aliases', n_item_aliases,
      'kid_food_ladder', n_ladder_repointed,
      'kid_food_ladder_merged', n_ladder_merged,
      'recipes_food_ids', n_recipes_food_ids
    )
  );
END;
$rpc_merge_items$;

COMMENT ON FUNCTION public.rpc_merge_items(UUID, UUID[]) IS
  'US-663: collapse duplicate foods rows onto a survivor by repointing every reference and setting merged_into_id. Never deletes a foods row, so a stale id held by an older client still resolves. Household-scoped; raises if the survivor appears among the duplicates or if they span households.';

REVOKE ALL ON FUNCTION public.rpc_merge_items(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_merge_items(UUID, UUID[]) TO authenticated;
