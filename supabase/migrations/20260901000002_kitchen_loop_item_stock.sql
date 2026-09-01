-- US-666: item_stock -- the maintained balance, and the ledger's only cache.
--
-- inventory_movements is truth. Folding it on every read would be honest and
-- slow, so this table holds the running total, maintained by trigger. The
-- invariant that keeps the two agreeing is stated once and asserted by a
-- function anyone can run:
--
--   item_stock.on_hand_canonical == sum(inventory_movements.delta)
--
-- Nonzero drift means something wrote stock directly, which is a bug with an
-- exact location rather than a mystery.
--
-- REVERSALS ARE NOT FILTERED, they cancel. A reversal is an ordinary row whose
-- delta is the negation of the row it reverses, so summing everything gives
-- the same answer as excluding both halves would, and it does so without the
-- balance depending on a back-pointer being set correctly. reversed_by_id is
-- there for the audit trail, not for the arithmetic. The client-side fold
-- (US-670) must agree with this, which it does as long as
-- rpc_reverse_movements_by_ref (US-677) always appends an exact negation.
--
-- Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md

CREATE TABLE IF NOT EXISTS public.item_stock (
  item_id UUID PRIMARY KEY REFERENCES public.foods(id) ON DELETE CASCADE,
  household_id UUID NOT NULL,
  on_hand_canonical NUMERIC NOT NULL DEFAULT 0,
  canonical_unit TEXT NOT NULL CHECK (canonical_unit IN ('g', 'ml', 'count')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "What is on hand across this household", the pantry list's own query.
CREATE INDEX IF NOT EXISTS item_stock_household_idx
  ON public.item_stock(household_id);

ALTER TABLE public.item_stock ENABLE ROW LEVEL SECURITY;

-- Read-only to every client role. The table is trigger-maintained, so a client
-- write would by definition be drift. As with inventory_movements, this is
-- enforced twice: the privileges are revoked AND no policy exists for the
-- verbs. The trigger runs as the table owner and is unaffected.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.item_stock FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.item_stock FROM anon;

DROP POLICY IF EXISTS "Household members can view item stock" ON public.item_stock;
CREATE POLICY "Household members can view item stock" ON public.item_stock
  FOR SELECT USING (household_id = public.get_user_household_id(auth.uid()));

COMMENT ON TABLE public.item_stock IS
  'US-666: maintained balance per item. A cache of sum(inventory_movements.delta), never a source of truth. Trigger-maintained and read-only to clients; a client write would be drift by definition.';

-- ---------------------------------------------------------------------------
-- The trigger that keeps it current.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_inventory_movement_to_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $apply_inventory_movement_to_stock$
DECLARE
  existing_unit TEXT;
BEGIN
  SELECT canonical_unit INTO existing_unit
    FROM public.item_stock WHERE item_id = NEW.item_id;

  -- An item's movements must all be denominated the same way. Adding grams to
  -- millilitres would produce a number that means nothing, and it would look
  -- exactly like a correct one, so refuse rather than accumulate nonsense.
  IF existing_unit IS NOT NULL AND existing_unit <> NEW.canonical_unit THEN
    RAISE EXCEPTION
      'inventory movement for item % is in % but its stock is held in %',
      NEW.item_id, NEW.canonical_unit, existing_unit;
  END IF;

  INSERT INTO public.item_stock (item_id, household_id, on_hand_canonical, canonical_unit, updated_at)
  VALUES (NEW.item_id, NEW.household_id, NEW.delta, NEW.canonical_unit, now())
  ON CONFLICT (item_id) DO UPDATE
    SET on_hand_canonical = public.item_stock.on_hand_canonical + EXCLUDED.on_hand_canonical,
        updated_at = now();

  RETURN NULL; -- AFTER trigger: the return value is ignored.
END;
$apply_inventory_movement_to_stock$;

DROP TRIGGER IF EXISTS inventory_movements_apply_to_stock ON public.inventory_movements;
CREATE TRIGGER inventory_movements_apply_to_stock
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_inventory_movement_to_stock();

COMMENT ON FUNCTION public.apply_inventory_movement_to_stock() IS
  'US-666: folds each appended movement into item_stock. Refuses a movement whose canonical_unit disagrees with the stock already held for that item, because adding grams to millilitres yields a number that looks correct and is not.';

-- ---------------------------------------------------------------------------
-- The invariant, as something you can run.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_reconcile_item_stock(target_household UUID)
RETURNS TABLE (
  item_id UUID,
  stored NUMERIC,
  ledger NUMERIC,
  drift NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $rpc_reconcile_item_stock$
  -- FULL OUTER JOIN so three kinds of disagreement all surface: a stock row
  -- whose total is wrong, a stock row with no movements behind it at all, and
  -- movements with no stock row (the trigger having been bypassed or dropped).
  SELECT
    COALESCE(s.item_id, m.item_id) AS item_id,
    COALESCE(s.on_hand_canonical, 0) AS stored,
    COALESCE(m.total, 0) AS ledger,
    COALESCE(s.on_hand_canonical, 0) - COALESCE(m.total, 0) AS drift
  FROM (
    SELECT item_id, on_hand_canonical
      FROM public.item_stock
     WHERE household_id = target_household
  ) s
  FULL OUTER JOIN (
    SELECT item_id, sum(delta) AS total
      FROM public.inventory_movements
     WHERE household_id = target_household
     GROUP BY item_id
  ) m ON m.item_id = s.item_id
  WHERE COALESCE(s.on_hand_canonical, 0) IS DISTINCT FROM COALESCE(m.total, 0);
$rpc_reconcile_item_stock$;

COMMENT ON FUNCTION public.rpc_reconcile_item_stock(UUID) IS
  'US-666: returns only the items whose maintained balance disagrees with the ledger, with the drift. An empty result is the invariant holding. Nonzero drift means something wrote stock directly.';

REVOKE ALL ON FUNCTION public.rpc_reconcile_item_stock(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_reconcile_item_stock(UUID) TO authenticated;
