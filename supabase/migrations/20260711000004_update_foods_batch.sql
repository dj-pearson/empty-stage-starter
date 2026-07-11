-- US-535: transactional batch update for foods (all-or-nothing).
--
-- The client's updateFoods() previously fired Promise.all of N independent
-- UPDATEs, so a partial failure left some rows changed on the server and others
-- not — client/server divergence. This RPC applies every patch in ONE statement
-- (a single implicit transaction), so either all rows update or none do,
-- mirroring bump_grocery_item_quantities (US-334).
--
-- SECURITY INVOKER: runs as the caller, so RLS still scopes writes to the
-- caller's household. Partial patches are supported via coalesce — only keys
-- present in each row's `patch` change; others keep their current value.

CREATE OR REPLACE FUNCTION public.update_foods_batch(p_updates jsonb)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  UPDATE public.foods AS f
  SET
    name        = coalesce(u.patch->>'name', f.name),
    category    = coalesce(u.patch->>'category', f.category),
    is_safe     = coalesce((u.patch->>'is_safe')::boolean, f.is_safe),
    is_try_bite = coalesce((u.patch->>'is_try_bite')::boolean, f.is_try_bite),
    aisle       = coalesce(u.patch->>'aisle', f.aisle),
    allergens   = CASE
                    WHEN u.patch ? 'allergens'
                    THEN ARRAY(SELECT jsonb_array_elements_text(u.patch->'allergens'))
                    ELSE f.allergens
                  END,
    updated_at  = now()
  FROM jsonb_to_recordset(p_updates) AS u(id uuid, patch jsonb)
  WHERE f.id = u.id;
$$;

COMMENT ON FUNCTION public.update_foods_batch(jsonb) IS
  'US-535: all-or-nothing batch update of foods (partial patches via coalesce). SECURITY INVOKER (RLS-scoped).';
