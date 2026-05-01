-- US-262: "Mark meal made" closes the recipe -> plan -> pantry -> grocery loop.
--
-- When a parent confirms a planned recipe was actually eaten:
--   1. Debit pantry foods linked to the recipe's structured ingredients
--      (one portion per food per kid served — clamped at 0).
--   2. Auto-check every grocery_item that has a grocery_item_sources row
--      pointing at this plan entry, so users don't have to hand-check
--      items they used to cook the meal.
--   3. Log the event so a re-tap within 1h returns "already_logged"
--      instead of double-debiting.
--
-- Atomicity: the whole flow runs in a single PL/pgSQL function. Failures
-- mid-flight roll back. SECURITY INVOKER lets RLS enforce ownership.

CREATE TABLE IF NOT EXISTS public.plan_entry_made_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_entry_id UUID NOT NULL REFERENCES public.plan_entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  made_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  debited_food_count INTEGER NOT NULL DEFAULT 0,
  checked_grocery_count INTEGER NOT NULL DEFAULT 0,
  -- Snapshot of what was changed, used by a future undo RPC to reverse
  -- the debits + grocery checks within a short window.
  reversal_payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_plan_entry_made_log_entry_made_at
  ON public.plan_entry_made_log(plan_entry_id, made_at DESC);

CREATE INDEX IF NOT EXISTS idx_plan_entry_made_log_user
  ON public.plan_entry_made_log(user_id, made_at DESC);

ALTER TABLE public.plan_entry_made_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own meal-made log"
  ON public.plan_entry_made_log
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own meal-made log"
  ON public.plan_entry_made_log
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own meal-made log"
  ON public.plan_entry_made_log
  FOR DELETE
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- RPC: rpc_mark_meal_made(plan_entry_id)
-- ---------------------------------------------------------------------
-- Returns JSONB shaped as one of:
--   { "status": "logged", "debited_count": N, "checked_count": M, "made_at": "..." }
--   { "status": "already_logged", "made_at": "..." }
--   { "status": "no_recipe", "checked_count": M }
--
-- The "no_recipe" path applies when the plan entry has no recipe_id;
-- nothing to debit but we still check grocery sources tied to the entry
-- (e.g. user manually linked a recipe-less plan entry to an item).

CREATE OR REPLACE FUNCTION public.rpc_mark_meal_made(p_plan_entry_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_recipe_id UUID;
  v_existing_made TIMESTAMPTZ;
  v_debited_count INTEGER := 0;
  v_checked_count INTEGER := 0;
  v_reversal JSONB := '{}'::JSONB;
  v_food_debits JSONB := '[]'::JSONB;
  v_grocery_checks JSONB := '[]'::JSONB;
  v_ing RECORD;
  v_gi RECORD;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Idempotency: if the plan entry was already logged within the last
  -- hour, return early so a retry doesn't double-debit. Older entries
  -- can re-fire (user logging the same recipe a second time intentionally).
  SELECT made_at INTO v_existing_made
  FROM public.plan_entry_made_log
  WHERE plan_entry_id = p_plan_entry_id
    AND user_id = v_user_id
    AND made_at >= v_now - INTERVAL '1 hour'
  ORDER BY made_at DESC
  LIMIT 1;

  IF v_existing_made IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_logged',
      'made_at', v_existing_made
    );
  END IF;

  -- Look up the recipe linked to this plan entry. RLS on plan_entries
  -- gates the visibility so unauthorized callers get NULL here.
  SELECT recipe_id INTO v_recipe_id
  FROM public.plan_entries
  WHERE id = p_plan_entry_id;

  -- Debit pantry foods for every structured ingredient with a food_id link.
  -- v1 math is conservative: debit one portion per linked food. Recipe
  -- serving math + multi-kid scaling is tracked as a future polish pass.
  IF v_recipe_id IS NOT NULL THEN
    FOR v_ing IN
      SELECT ri.food_id, ri.name, ri.quantity, ri.unit, f.quantity AS pantry_qty
      FROM public.recipe_ingredients ri
      JOIN public.foods f ON f.id = ri.food_id
      WHERE ri.recipe_id = v_recipe_id
        AND ri.food_id IS NOT NULL
        AND f.user_id = v_user_id
    LOOP
      UPDATE public.foods
      SET quantity = GREATEST(0, quantity - 1)
      WHERE id = v_ing.food_id
        AND user_id = v_user_id;

      v_food_debits := v_food_debits || jsonb_build_object(
        'food_id', v_ing.food_id,
        'name', v_ing.name,
        'previous_qty', v_ing.pantry_qty,
        'debited', 1
      );
      v_debited_count := v_debited_count + 1;
    END LOOP;
  END IF;

  -- Auto-check grocery items linked back to this plan entry via
  -- grocery_item_sources. Even with no recipe, manual links still fire.
  FOR v_gi IN
    SELECT DISTINCT gi.id, gi.name, gi.checked
    FROM public.grocery_item_sources gis
    JOIN public.grocery_items gi ON gi.id = gis.grocery_item_id
    WHERE gis.plan_entry_id = p_plan_entry_id
      AND gi.user_id = v_user_id
      AND gi.checked = false
  LOOP
    UPDATE public.grocery_items
    SET checked = true
    WHERE id = v_gi.id
      AND user_id = v_user_id;

    v_grocery_checks := v_grocery_checks || jsonb_build_object(
      'grocery_item_id', v_gi.id,
      'name', v_gi.name,
      'previous_checked', v_gi.checked
    );
    v_checked_count := v_checked_count + 1;
  END LOOP;

  v_reversal := jsonb_build_object(
    'food_debits', v_food_debits,
    'grocery_checks', v_grocery_checks
  );

  INSERT INTO public.plan_entry_made_log (
    plan_entry_id,
    user_id,
    made_at,
    debited_food_count,
    checked_grocery_count,
    reversal_payload
  )
  VALUES (
    p_plan_entry_id,
    v_user_id,
    v_now,
    v_debited_count,
    v_checked_count,
    v_reversal
  );

  RETURN jsonb_build_object(
    'status', CASE WHEN v_recipe_id IS NULL THEN 'no_recipe' ELSE 'logged' END,
    'debited_count', v_debited_count,
    'checked_count', v_checked_count,
    'made_at', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_mark_meal_made(UUID) IS
  'US-262: log a planned recipe as eaten. Debits pantry foods (linked via recipe_ingredients.food_id) and checks recipe-sourced grocery items in one transaction. Idempotent within a 1-hour window via plan_entry_made_log.';
