-- Household-aware account deletion (owner decision 1a, 2026-09-25).
--
-- WHAT WAS WRONG
--   delete-account deletes kids, foods, recipes, plan_entries, grocery_items,
--   grocery_lists and meal_plan_templates WHERE user_id = the caller. Those
--   rows are household data: a co-parent reads them through household RLS. So
--   when one parent deleted their account, the other lost every child profile,
--   food and plan the first one had created.
--
--   Separately, several columns reference auth.users with NO ACTION
--   (household_members.invited_by, kid_allergen_change_log.changed_by_user_id,
--   recipe_photos.uploaded_by_user_id, food_aisle_mappings.user_id, ...). Any
--   one of them pointing at the caller makes auth.admin.deleteUser fail, which
--   is the step that actually deletes the account.
--
-- WHAT THIS ADDS
--   public.transfer_user_household_data(p_user_id uuid, p_dry_run boolean)
--   returning a jsonb summary. For every household the user belongs to that
--   still has other members:
--     - household rows the user created are reassigned to the successor, the
--       longest-standing remaining member (earliest joined_at, then id: the
--       household_owner_id ordering with the leaving user excluded), so RLS
--       and "created by" keep working for the family;
--     - rows that hang off those (recipe_attempts, plan_entry_feedback,
--       plan_entry_made_log, food_aisle_mappings) follow their parent;
--     - the user's own membership row is removed, which hands ownership to the
--       successor by the same ordering.
--   Rows with no household, or in a household where the user is the only
--   member, are left alone for delete-account to delete, as before.
--   Then, for every household, every nullable NO ACTION / RESTRICT foreign key
--   in public that references auth.users or public.profiles and points at the
--   user is set to NULL, found from the catalog rather than listed, so a new
--   one added later cannot quietly block deletion again. The single NOT NULL
--   one (household_invitations.invited_by) is handled by deleting the pending
--   invitations that user sent. Anything still left is reported in
--   unresolved_blockers rather than guessed at.
--
--   p_dry_run = true runs exactly the same statements inside a subtransaction
--   and rolls it back, so the preflight counts are the counts a real run would
--   produce, and nothing is written.
--
-- WHY PERSONAL TABLES ARE NOT TRANSFERRED
--   Tables that carry household_id but hold one person's settings or history
--   (notification_preferences, notification_queue, report_preferences,
--   suggestion_preferences, suggestion_feedback, delivery_preferences,
--   user_delivery_accounts, grocery_delivery_orders, user_product_preferences,
--   nurture_enrollments, agent_events, stock_comparison_samples,
--   variety_fatigue_snapshots) stay with the leaving user and go with them.
--
-- GRANTS
--   service_role only. Supabase's default ACL grants EXECUTE to anon and
--   authenticated directly (US-804), so they are named in the REVOKE. The
--   function takes a user id argument; a signed-in caller must never be able
--   to hand someone else's family to a third person.
--
-- Backward compatible: one new function, no table, column, constraint or
-- policy changes. Shipped iOS builds call delete-account exactly as before.

CREATE OR REPLACE FUNCTION public.transfer_user_household_data(
  p_user_id uuid,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Household-keyed tables whose rows are family data. Each has user_id and
  -- household_id. Order does not matter: only user_id is rewritten.
  c_household_tables CONSTANT text[] := ARRAY[
    'kids',
    'foods',
    'recipes',
    'plan_entries',
    'grocery_items',
    'grocery_lists',
    'grocery_purchase_history',
    'recipe_collections',
    'store_layouts',
    'meal_plan_templates',
    'shopping_sessions',
    'sibling_meal_resolutions'
  ];
  v_hh        uuid[] := ARRAY[]::uuid[];
  v_succ      uuid[] := ARRAY[]::uuid[];
  v_households jsonb := '[]'::jsonb;
  v_transferred jsonb := '{}'::jsonb;
  v_left      jsonb := '{}'::jsonb;
  v_cleared   jsonb := '{}'::jsonb;
  v_removed   jsonb := '{}'::jsonb;
  v_unresolved jsonb := '{}'::jsonb;
  v_summary   jsonb;
  v_table     text;
  v_n         bigint;
  v_n2        bigint;
  r           record;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'transfer_user_household_data: p_user_id is required'
      USING ERRCODE = '22004';
  END IF;

  BEGIN
    -- 1. Which households keep going, and who inherits in each. Locked so a
    --    concurrent invite acceptance or removal cannot change the answer
    --    between choosing the successor and moving the rows.
    FOR r IN
      SELECT hm.household_id,
             h.name AS household_name,
             s.user_id AS successor_id,
             s.role AS successor_role,
             p.full_name AS successor_name,
             (SELECT count(*) FROM public.household_members m
               WHERE m.household_id = hm.household_id
                 AND m.user_id <> p_user_id) AS remaining
      FROM public.household_members hm
      JOIN public.households h ON h.id = hm.household_id
      CROSS JOIN LATERAL (
        SELECT m.user_id, m.role
        FROM public.household_members m
        WHERE m.household_id = hm.household_id
          AND m.user_id <> p_user_id
        ORDER BY m.joined_at ASC NULLS LAST, m.id ASC
        LIMIT 1
      ) s
      LEFT JOIN public.profiles p ON p.id = s.user_id
      WHERE hm.user_id = p_user_id
      ORDER BY hm.joined_at ASC NULLS LAST, hm.household_id
    LOOP
      PERFORM 1 FROM public.households WHERE id = r.household_id FOR NO KEY UPDATE;
      v_hh := v_hh || r.household_id;
      v_succ := v_succ || r.successor_id;
      v_households := v_households || jsonb_build_array(jsonb_build_object(
        'household_id', r.household_id,
        'household_name', r.household_name,
        'successor_user_id', r.successor_id,
        'successor_name', r.successor_name,
        'successor_role', r.successor_role,
        'remaining_members', r.remaining,
        'kid_names', COALESCE((
          SELECT jsonb_agg(k.name ORDER BY k.created_at NULLS LAST, k.name)
          FROM public.kids k WHERE k.household_id = r.household_id
        ), '[]'::jsonb)
      ));
    END LOOP;

    -- 2. Household-keyed family rows go to the household's successor.
    FOREACH v_table IN ARRAY c_household_tables LOOP
      IF to_regclass(format('public.%I', v_table)) IS NULL THEN
        CONTINUE;
      END IF;
      EXECUTE format(
        'UPDATE public.%I t SET user_id = s.successor
           FROM unnest($1::uuid[], $2::uuid[]) AS s(household_id, successor)
          WHERE t.user_id = $3 AND t.household_id = s.household_id',
        v_table)
        USING v_hh, v_succ, p_user_id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_transferred := v_transferred || jsonb_build_object(v_table, v_n);
    END LOOP;

    -- 3. Rows with no household column follow their parent row.
    UPDATE public.recipe_attempts t SET user_id = s.successor
      FROM public.kids k, unnest(v_hh, v_succ) AS s(household_id, successor)
     WHERE t.user_id = p_user_id AND t.kid_id = k.id AND k.household_id = s.household_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    -- An attempt with no kid follows its recipe instead.
    UPDATE public.recipe_attempts t SET user_id = s.successor
      FROM public.recipes rc, unnest(v_hh, v_succ) AS s(household_id, successor)
     WHERE t.user_id = p_user_id AND t.kid_id IS NULL
       AND t.recipe_id = rc.id AND rc.household_id = s.household_id;
    GET DIAGNOSTICS v_n2 = ROW_COUNT;
    v_transferred := v_transferred || jsonb_build_object('recipe_attempts', v_n + v_n2);

    UPDATE public.plan_entry_feedback t SET user_id = s.successor
      FROM public.plan_entries pe, unnest(v_hh, v_succ) AS s(household_id, successor)
     WHERE t.user_id = p_user_id AND t.plan_entry_id = pe.id AND pe.household_id = s.household_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_transferred := v_transferred || jsonb_build_object('plan_entry_feedback', v_n);

    UPDATE public.plan_entry_made_log t SET user_id = s.successor
      FROM public.plan_entries pe, unnest(v_hh, v_succ) AS s(household_id, successor)
     WHERE t.user_id = p_user_id AND t.plan_entry_id = pe.id AND pe.household_id = s.household_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_transferred := v_transferred || jsonb_build_object('plan_entry_made_log', v_n);

    UPDATE public.food_aisle_mappings t SET user_id = s.successor
      FROM public.store_layouts sl, unnest(v_hh, v_succ) AS s(household_id, successor)
     WHERE t.user_id = p_user_id AND t.store_layout_id = sl.id AND sl.household_id = s.household_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_transferred := v_transferred || jsonb_build_object('food_aisle_mappings', v_n);

    -- 4. Leave the shared households. The successor is now the earliest
    --    remaining member, so household_owner_id resolves to them.
    DELETE FROM public.household_members
     WHERE user_id = p_user_id AND household_id = ANY (v_hh);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_removed := v_removed || jsonb_build_object('household_members', v_n);

    -- 5. The one NOT NULL NO ACTION reference: invitations this user sent.
    DELETE FROM public.household_invitations WHERE invited_by = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_removed := v_removed || jsonb_build_object('household_invitations', v_n);

    -- 6. Every other nullable NO ACTION / RESTRICT reference to the user is
    --    released with SET NULL semantics. Found from the catalog, so a column
    --    added later is covered without editing this function.
    FOR r IN
      SELECT cl.relname AS tbl, a.attname AS col, a.attnotnull AS notnull
      FROM pg_constraint con
      JOIN pg_class cl ON cl.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
      WHERE con.contype = 'f'
        AND n.nspname = 'public'
        AND con.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
        AND con.confdeltype IN ('a', 'r')
        AND array_length(con.conkey, 1) = 1
      ORDER BY cl.relname, a.attname
    LOOP
      IF r.notnull THEN
        EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tbl, r.col)
          INTO v_n USING p_user_id;
        IF v_n > 0 THEN
          v_unresolved := v_unresolved || jsonb_build_object(r.tbl || '.' || r.col, v_n);
        END IF;
      ELSE
        EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I = $1', r.tbl, r.col, r.col)
          USING p_user_id;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n > 0 THEN
          v_cleared := v_cleared || jsonb_build_object(r.tbl || '.' || r.col, v_n);
        END IF;
      END IF;
    END LOOP;

    -- 7. What is still the user's, for delete-account to delete.
    FOREACH v_table IN ARRAY (c_household_tables
        || ARRAY['recipe_attempts', 'plan_entry_feedback', 'plan_entry_made_log']) LOOP
      IF to_regclass(format('public.%I', v_table)) IS NULL THEN
        CONTINUE;
      END IF;
      EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id = $1', v_table)
        INTO v_n USING p_user_id;
      v_left := v_left || jsonb_build_object(v_table, v_n);
    END LOOP;

    v_summary := jsonb_build_object(
      'user_id', p_user_id,
      'dry_run', p_dry_run,
      'sole_member', cardinality(v_hh) = 0,
      'households', v_households,
      'transferred', v_transferred,
      'left_for_deletion', v_left,
      'cleared_references', v_cleared,
      'removed', v_removed,
      'unresolved_blockers', v_unresolved
    );

    IF p_dry_run THEN
      -- Undo everything above; v_summary survives because PL/pgSQL variables
      -- are not part of the subtransaction.
      RAISE EXCEPTION USING ERRCODE = 'EPDRY', MESSAGE = 'transfer_user_household_data dry run';
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'EPDRY' THEN
      NULL;
  END;

  RETURN v_summary;
END;
$$;

COMMENT ON FUNCTION public.transfer_user_household_data(uuid, boolean) IS
  'Account deletion step 1 (owner decision 1a): hands the leaving user''s '
  'household rows to the longest-standing remaining member of each shared '
  'household, removes their membership, and NULLs NO ACTION references to '
  'them. p_dry_run = true reports the same counts and writes nothing. '
  'service_role only; called by the delete-account edge function.';

REVOKE ALL ON FUNCTION public.transfer_user_household_data(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_user_household_data(uuid, boolean)
  TO service_role;
