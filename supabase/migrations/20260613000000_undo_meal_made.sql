-- US-349: undo a "mark meal made" within the logging window.
--
-- Reverses the side effects recorded in plan_entry_made_log.reversal_payload
-- by rpc_mark_meal_made (US-262):
--   1. Re-credit each debited pantry food. Only the amount actually removed is
--      restored — LEAST(debited, previous_qty) — so a food that was clamped at
--      0 during the debit isn't over-credited.
--   2. Re-open every grocery item that the mark-made auto-checked.
--   3. Clear plan_entries.result (the client had flipped it to "ate").
--   4. Delete the log row so the entry can be cleanly re-made later.
--
-- Additive and backward-compatible: this only adds a new function. The
-- plan_entry_made_log shape and rpc_mark_meal_made are unchanged, so older
-- shipped iOS builds that never call this are unaffected.
--
-- SECURITY INVOKER so RLS enforces ownership; an explicit user_id filter keeps
-- the intent obvious alongside the policies.

CREATE OR REPLACE FUNCTION public.rpc_undo_meal_made(p_plan_entry_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_log RECORD;
  v_reversal JSONB;
  v_debit JSONB;
  v_check JSONB;
  v_credited JSONB := '[]'::JSONB;
  v_unchecked JSONB := '[]'::JSONB;
  v_credited_count INTEGER := 0;
  v_unchecked_count INTEGER := 0;
  v_restore NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Most recent log row for this entry, owned by the caller.
  SELECT * INTO v_log
  FROM public.plan_entry_made_log
  WHERE plan_entry_id = p_plan_entry_id
    AND user_id = v_user_id
  ORDER BY made_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'nothing_to_undo');
  END IF;

  v_reversal := COALESCE(v_log.reversal_payload, '{}'::JSONB);

  -- Re-credit debited foods.
  FOR v_debit IN
    SELECT * FROM jsonb_array_elements(COALESCE(v_reversal->'food_debits', '[]'::JSONB))
  LOOP
    v_restore := LEAST(
      COALESCE((v_debit->>'debited')::NUMERIC, 0),
      COALESCE((v_debit->>'previous_qty')::NUMERIC, 0)
    );
    IF v_restore > 0 THEN
      UPDATE public.foods
      SET quantity = COALESCE(quantity, 0) + v_restore
      WHERE id = (v_debit->>'food_id')::UUID
        AND user_id = v_user_id;
    END IF;

    v_credited := v_credited || jsonb_build_object(
      'food_id', v_debit->>'food_id',
      'amount', v_restore
    );
    v_credited_count := v_credited_count + 1;
  END LOOP;

  -- Re-open auto-checked grocery items (we only ever recorded items whose
  -- previous_checked was false, so un-checking is always the right reversal).
  FOR v_check IN
    SELECT * FROM jsonb_array_elements(COALESCE(v_reversal->'grocery_checks', '[]'::JSONB))
  LOOP
    UPDATE public.grocery_items
    SET checked = false
    WHERE id = (v_check->>'grocery_item_id')::UUID
      AND user_id = v_user_id;

    v_unchecked := v_unchecked || to_jsonb(v_check->>'grocery_item_id');
    v_unchecked_count := v_unchecked_count + 1;
  END LOOP;

  -- Clear the "ate" result the client set on mark-made. RLS (SECURITY
  -- INVOKER) gates ownership, matching how rpc_mark_meal_made reads this table.
  UPDATE public.plan_entries
  SET result = NULL
  WHERE id = p_plan_entry_id;

  -- One-shot: remove the log so a future "made" fires fresh.
  DELETE FROM public.plan_entry_made_log WHERE id = v_log.id;

  RETURN jsonb_build_object(
    'status', 'reversed',
    'credited_count', v_credited_count,
    'unchecked_count', v_unchecked_count,
    'credited', v_credited,
    'unchecked', v_unchecked
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_undo_meal_made(UUID) IS
  'US-349: reverse a rpc_mark_meal_made — re-credit pantry foods and re-open grocery items from plan_entry_made_log.reversal_payload, clear plan_entries.result, and delete the log row.';
