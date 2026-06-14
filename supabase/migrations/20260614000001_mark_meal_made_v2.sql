-- US-351: serving- and quantity-scaled pantry debits at mark-made.
--
-- v1 `rpc_mark_meal_made` debits exactly 1 unit per linked food, walking
-- recipe_ingredients server-side. v2 instead accepts an explicit list of
-- per-food debit amounts the client has already scaled by serving count and
-- unit-converted (the conversion layer lives in the app's UnitConverter, not
-- SQL). This keeps v1 intact for older shipped iOS clients (additive only —
-- no change to the v1 function, table, or the undo RPC's reversal shape).
--
-- p_debits is a JSONB array: [{ "food_id": "<uuid>", "amount": <numeric> }, ...]
--
-- Returns the same shape as v1:
--   { "status": "logged"|"no_recipe", "debited_count": N, "checked_count": M, "made_at": "..." }
--   { "status": "already_logged", "made_at": "..." }

CREATE OR REPLACE FUNCTION public.rpc_mark_meal_made_v2(
  p_plan_entry_id UUID,
  p_debits JSONB DEFAULT '[]'::JSONB
)
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
  v_debit JSONB;
  v_food_id UUID;
  v_amount NUMERIC;
  v_prev_qty NUMERIC;
  v_gi RECORD;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Idempotency: identical to v1 (shared plan_entry_made_log, 1-hour window).
  SELECT made_at INTO v_existing_made
  FROM public.plan_entry_made_log
  WHERE plan_entry_id = p_plan_entry_id
    AND user_id = v_user_id
    AND made_at >= v_now - INTERVAL '1 hour'
  ORDER BY made_at DESC
  LIMIT 1;

  IF v_existing_made IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_logged', 'made_at', v_existing_made);
  END IF;

  SELECT recipe_id INTO v_recipe_id
  FROM public.plan_entries
  WHERE id = p_plan_entry_id;

  -- Apply each client-computed debit. Amounts are already serving-scaled and
  -- unit-converted to the pantry food's unit; clamp at 0. RLS + the explicit
  -- user_id filter keep a caller from debiting someone else's pantry.
  FOR v_debit IN SELECT * FROM jsonb_array_elements(COALESCE(p_debits, '[]'::JSONB))
  LOOP
    v_food_id := (v_debit->>'food_id')::UUID;
    v_amount := COALESCE((v_debit->>'amount')::NUMERIC, 0);
    IF v_food_id IS NULL OR v_amount <= 0 THEN
      CONTINUE;
    END IF;

    SELECT quantity INTO v_prev_qty
    FROM public.foods
    WHERE id = v_food_id AND user_id = v_user_id;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.foods
    SET quantity = GREATEST(0, COALESCE(quantity, 0) - v_amount)
    WHERE id = v_food_id AND user_id = v_user_id;

    -- Reversal shape matches v1 so rpc_undo_meal_made re-credits correctly.
    v_food_debits := v_food_debits || jsonb_build_object(
      'food_id', v_food_id,
      'previous_qty', v_prev_qty,
      'debited', v_amount
    );
    v_debited_count := v_debited_count + 1;
  END LOOP;

  -- Auto-check grocery items linked to this plan entry (identical to v1).
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
    WHERE id = v_gi.id AND user_id = v_user_id;

    v_grocery_checks := v_grocery_checks || jsonb_build_object(
      'grocery_item_id', v_gi.id,
      'name', v_gi.name,
      'previous_checked', v_gi.checked
    );
    v_checked_count := v_checked_count + 1;
  END LOOP;

  v_reversal := jsonb_build_object('food_debits', v_food_debits, 'grocery_checks', v_grocery_checks);

  INSERT INTO public.plan_entry_made_log (
    plan_entry_id, user_id, made_at, debited_food_count, checked_grocery_count, reversal_payload
  )
  VALUES (
    p_plan_entry_id, v_user_id, v_now, v_debited_count, v_checked_count, v_reversal
  );

  RETURN jsonb_build_object(
    'status', CASE WHEN v_recipe_id IS NULL THEN 'no_recipe' ELSE 'logged' END,
    'debited_count', v_debited_count,
    'checked_count', v_checked_count,
    'made_at', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_mark_meal_made_v2(UUID, JSONB) IS
  'US-351: log a planned recipe as eaten, debiting pantry foods by client-computed serving-scaled + unit-converted amounts (p_debits). Additive successor to rpc_mark_meal_made (v1 stays for older clients). Shares plan_entry_made_log + reversal shape with the undo RPC.';
