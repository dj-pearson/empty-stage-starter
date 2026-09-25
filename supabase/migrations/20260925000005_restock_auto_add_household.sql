-- auto_add_restock_items: write restock rows into the user's household.
--
-- The 20251010221000 body inserted grocery_items with no household_id. Every
-- grocery_items policy is `household_id = get_user_household_id(auth.uid())`,
-- and the auto_fill_household_id trigger only fills the column when auth.uid()
-- is set. The one caller, scheduled_auto_restock (the cron entry point), runs
-- with no session, so every row it wrote had a NULL household_id and was
-- invisible to every member of every household. Its "already on the list"
-- lookup was by user_id too, so a co-parent's unchecked row for the same food
-- got a duplicate next to it instead of being topped up.
--
-- Same name, same signature, same return type. Nothing in src/, app/, ios/ or
-- supabase/functions calls either function; only scheduled_auto_restock calls
-- auto_add_restock_items, and nothing schedules scheduled_auto_restock in the
-- migration history. Both are therefore private: anon and authenticated lose
-- the EXECUTE the schema default ACL gave them (US-804), service_role keeps it
-- for a server-side run. auto_add_restock_items takes any p_user_id, so leaving
-- it callable by a signed-in user would let one account fill another's list.
--
-- The household is get_user_household_id(p_user_id), the same helper the
-- grocery_items policies use, so the row lands in the household that user's
-- clients read. A user with no household gets nothing: a row with a NULL
-- household_id is one no policy lets anyone see.
--
-- grocery_list_id stays NULL, which the web client (groceryData.ts, US-714)
-- and the iOS build both read as the household's default list. added_via is
-- 'auto_restock', the tag the web client already uses for an automatic
-- restock, and added_by_user_id is the user the restock ran for.

CREATE OR REPLACE FUNCTION public.auto_add_restock_items(
  p_user_id UUID,
  p_kid_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_household_id UUID;
  v_restock_record RECORD;
  v_existing_item RECORD;
  v_items_added INTEGER := 0;
BEGIN
  v_household_id := public.get_user_household_id(p_user_id);
  IF v_household_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_restock_record IN
    SELECT * FROM public.detect_restock_needs(p_user_id, p_kid_id)
  LOOP
    -- Already on the household's list, unchecked, whoever added it.
    SELECT gi.id, gi.quantity INTO v_existing_item
      FROM public.grocery_items gi
     WHERE gi.household_id = v_household_id
       AND LOWER(gi.name) = LOWER(v_restock_record.food_name)
       AND gi.checked = false
     ORDER BY gi.created_at NULLS LAST, gi.id
     LIMIT 1;

    IF v_existing_item.id IS NOT NULL THEN
      IF v_restock_record.recommended_quantity > v_existing_item.quantity THEN
        UPDATE public.grocery_items
           SET quantity = v_restock_record.recommended_quantity,
               restock_reason = v_restock_record.reason,
               priority = v_restock_record.priority,
               auto_generated = true,
               updated_at = NOW()
         WHERE id = v_existing_item.id;

        v_items_added := v_items_added + 1;
      END IF;
    ELSE
      INSERT INTO public.grocery_items (
        user_id,
        household_id,
        name,
        quantity,
        unit,
        category,
        aisle,
        checked,
        auto_generated,
        restock_reason,
        priority,
        added_via,
        added_by_user_id
      ) VALUES (
        p_user_id,
        v_household_id,
        v_restock_record.food_name,
        v_restock_record.recommended_quantity,
        'servings',
        v_restock_record.category,
        v_restock_record.aisle,
        false,
        true,
        v_restock_record.reason,
        v_restock_record.priority,
        'auto_restock',
        p_user_id
      );

      v_items_added := v_items_added + 1;
    END IF;
  END LOOP;

  RETURN v_items_added;
END;
$function$;

COMMENT ON FUNCTION public.auto_add_restock_items(uuid, uuid) IS
  'Adds restock recommendations to the user''s household grocery list. Private: cron and service_role only.';

-- Private: the cron wrapper and service_role. Naming the roles is what removes
-- the default-ACL grant; REVOKE FROM PUBLIC alone would not (US-804).
REVOKE ALL ON FUNCTION public.auto_add_restock_items(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_add_restock_items(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.scheduled_auto_restock() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scheduled_auto_restock() TO service_role;
