-- US-334: batch the grocery-merge "bump existing rows" writes into ONE request.
--
-- addGroceryItemsMerged previously looped a per-row UPDATE (N round trips + N
-- re-renders) to bump the quantity of existing unchecked rows. This RPC applies
-- all of those quantity/unit/name bumps in a single statement.
--
-- SECURITY INVOKER (the default) so the caller's RLS UPDATE policy on
-- grocery_items still applies — a user can only bump rows they're allowed to
-- update. Only quantity / unit / name are touched; every other column is left
-- intact (no destructive full-row upsert).
--
-- Backward-compatible: new function only; old clients keep using per-row updates.

CREATE OR REPLACE FUNCTION public.bump_grocery_item_quantities(p_updates jsonb)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE public.grocery_items AS g
  SET
    quantity = u.quantity,
    unit = u.unit,
    name = u.name
  FROM jsonb_to_recordset(p_updates) AS u(id uuid, quantity numeric, unit text, name text)
  WHERE g.id = u.id;
$$;

COMMENT ON FUNCTION public.bump_grocery_item_quantities(jsonb) IS
  'US-334: batch-update quantity/unit/name for a set of grocery_items rows in one statement. RLS-scoped (SECURITY INVOKER).';
