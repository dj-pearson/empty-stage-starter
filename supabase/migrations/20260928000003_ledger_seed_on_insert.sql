-- 5a: a food that arrives with a quantity arrives with a ledger balance.
--
-- THE BUG. The US-669 backfill (20260901000005) seeded every row that existed
-- on the day it ran, and the only ledger trigger on foods since then is
-- AFTER UPDATE OF quantity (US-668, 20260901000004). An INSERT that carries a
-- quantity -- which is how every shipped iOS build adds a food
-- (DataService.insertFood / bulkInsertFoods) and how the web's addFood and
-- addFoods do it -- never reaches the ledger. The food has foods.quantity = 5
-- and no item_stock row at all.
--
-- That is harmless while every write is an absolute foods.quantity write,
-- because US-668 computes its correction against the balance and lands on the
-- right number. It stops being harmless the moment the web appends DELTAS
-- (kitchen_loop_ledger_writes on): a purchase of 2 becomes a balance of 2, the
-- US-667 mirror writes 2 over foods.quantity, and the 5 the parent had is gone
-- on every device. Reproduced against a database built from the migration
-- history before writing this: Yogurt 5 + purchase 2 read back 2, Crackers 4
-- corrected to 3 read back -1, and detect_item_stock_drift() reported nothing,
-- because ledger and balance agreed perfectly on the wrong number.
--
-- THE FIX has two parts.
--
-- 1. An AFTER INSERT trigger on foods appends the opening balance as an
--    `initial` movement. `initial` rather than `correction` on purpose: it is
--    the reason the ledger already uses for "this is what the item started
--    with", and backfill_initial_movements' idempotence guard looks for exactly
--    that reason, so an operator re-running the backfill skips these rows
--    instead of doubling them. US-668's note that `initial` belongs to the
--    backfill alone was about a parent's EDIT; a row being created with a
--    quantity is not an edit, it is the item's first fact.
--
-- 2. inventory_movements.item_id cascades when its food is deleted. See the
--    section below: without it, part 1 would make every food added with a
--    quantity impossible to delete, on iOS and on the web.
--
-- NO DOUBLE SEED. No client path inserts a food with a quantity and then
-- appends a movement for the same stock: addFood/addFoods, the receipt
-- `creates`, checkout's fallback credit and every iOS insert send the quantity
-- on the row and append nothing. The trigger is still written so a client that
-- did both could not double-count: the seed is `target - current balance`, the
-- same arithmetic as US-668, so it only ever tops the balance up to what the
-- row says. At the moment an AFTER INSERT trigger runs no movement can exist
-- yet (the FK on item_id needs the row first), so in practice that delta is the
-- whole quantity.
--
-- Additive. Old clients send the same INSERTs and get the same row back; they
-- also get a correct balance behind it, which is the point.
--
-- Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md

-- ---------------------------------------------------------------------------
-- The seed, as one function the trigger and the repair (20260928000004) share.
-- ---------------------------------------------------------------------------

/**
 * Bring one food's ledger balance up to what foods.quantity says, with a
 * single `initial` movement. Returns what it did, so a caller can count:
 *
 *   seeded         a movement was appended
 *   balanced       the balance already matched; nothing appended
 *   no_quantity    NULL or zero quantity; nothing to seed
 *   no_household   a pre-household row; the ledger has nowhere to put it
 *   merged         a merged-away row; its stock lives on the survivor
 *   unconvertible  the quantity cannot be expressed in the item's canonical
 *                  unit; appending a guess would corrupt the balance
 *   missing        no such food
 *
 * The guards are translate_direct_quantity_write's (US-668), restated in the
 * order that trigger applies them, so the two cannot disagree about which
 * rows the ledger owns.
 */
CREATE OR REPLACE FUNCTION public.seed_food_ledger_balance(p_food_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $seed_food_ledger_balance$
DECLARE
  f RECORD;
  canonical TEXT;
  target NUMERIC;
  balance NUMERIC;
  movement_delta NUMERIC;
BEGIN
  SELECT fo.id, fo.household_id, fo.user_id, fo.quantity, fo.unit,
         fo.canonical_unit, fo.unit_conversions, fo.merged_into_id
    INTO f
    FROM public.foods fo
   WHERE fo.id = p_food_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  IF f.household_id IS NULL THEN
    RETURN 'no_household';
  END IF;

  IF f.merged_into_id IS NOT NULL THEN
    RETURN 'merged';
  END IF;

  IF f.quantity IS NULL OR f.quantity = 0 THEN
    RETURN 'no_quantity';
  END IF;

  -- Same inference as US-668 and the US-669 backfill: the declared unit wins,
  -- else the display unit's dimension, else count (an opaque "servings" or
  -- "packages" is one-to-one with count; from_canonical depends on that).
  canonical := f.canonical_unit;
  IF canonical IS NULL THEN
    SELECT CASE u.dimension
             WHEN 'mass' THEN 'g' WHEN 'volume' THEN 'ml' ELSE 'count' END
      INTO canonical
      FROM public.unit_to_canonical(f.unit) u;
    canonical := coalesce(canonical, 'count');
  END IF;

  target := public.to_canonical(f.quantity, f.unit, canonical, f.unit_conversions);
  IF target IS NULL THEN
    -- The row declares one dimension and is measured in another with no
    -- bridge. Leave it unseeded; detect_foods_quantity_drift (20260928000005)
    -- reports it, where a per-item conversion can be added.
    RETURN 'unconvertible';
  END IF;

  SELECT s.on_hand_canonical INTO balance
    FROM public.item_stock s WHERE s.item_id = f.id FOR UPDATE;
  movement_delta := target - coalesce(balance, 0);

  IF movement_delta = 0 THEN
    RETURN 'balanced';
  END IF;

  -- Record the classification on the row, as the backfill does, so the web
  -- builder and US-668 both denominate this item's later movements the way
  -- its stock is held. Without it a later change of display unit (kg to cups)
  -- makes US-668 infer a different canonical unit, and the append is refused
  -- by apply_inventory_movement_to_stock -- which, inside the client's UPDATE,
  -- fails the client's write. Only fills a NULL; a declared unit is kept.
  IF f.canonical_unit IS NULL THEN
    UPDATE public.foods SET canonical_unit = canonical
     WHERE id = f.id AND canonical_unit IS NULL;
  END IF;

  INSERT INTO public.inventory_movements (
    id, household_id, item_id, delta, canonical_unit,
    display_quantity, display_unit, reason, created_by
  ) VALUES (
    gen_random_uuid(), f.household_id, f.id, movement_delta, canonical,
    f.quantity, f.unit, 'initial', coalesce(auth.uid(), f.user_id)
  );

  RETURN 'seeded';
END;
$seed_food_ledger_balance$;

COMMENT ON FUNCTION public.seed_food_ledger_balance(UUID) IS
  '5a: tops one food''s ledger balance up to foods.quantity with a single `initial` movement (target minus current balance, so it cannot double-count). Shared by the foods AFTER INSERT trigger and the one-off repair in 20260928000004. Returns seeded, balanced, no_quantity, no_household, merged, unconvertible or missing. Private.';

-- Private. It writes the ledger for any food id it is handed and checks no
-- household, so it is no client's to call. US-804: name the roles, because the
-- Supabase default ACL grants anon and authenticated EXECUTE directly.
REVOKE ALL ON FUNCTION public.seed_food_ledger_balance(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The trigger.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_ledger_on_food_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $seed_ledger_on_food_insert$
BEGIN
  -- The US-667 mirror never inserts a food, but the guard costs nothing and
  -- keeps this trigger's rules identical to US-668's.
  IF coalesce(current_setting('app.kitchen_loop_mirror', true), '') = '1' THEN
    RETURN NULL;
  END IF;

  -- The row is visible to an AFTER trigger, and auto_fill_household_id (a
  -- BEFORE INSERT trigger) has already filled household_id for the shipped
  -- iOS builds that omit it.
  PERFORM public.seed_food_ledger_balance(NEW.id);
  RETURN NULL;
END;
$seed_ledger_on_food_insert$;

REVOKE ALL ON FUNCTION public.seed_ledger_on_food_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS foods_seed_ledger_on_insert ON public.foods;
CREATE TRIGGER foods_seed_ledger_on_insert
  AFTER INSERT ON public.foods
  FOR EACH ROW
  WHEN (NEW.quantity IS NOT NULL AND NEW.quantity <> 0)
  EXECUTE FUNCTION public.seed_ledger_on_food_insert();

COMMENT ON FUNCTION public.seed_ledger_on_food_insert() IS
  '5a: a food INSERTed with a quantity gets its opening balance as an `initial` movement, so a later delta movement (web, ledger writes on) adds to that quantity instead of replacing it. The insert-side twin of translate_direct_quantity_write (US-668).';

-- ---------------------------------------------------------------------------
-- Deleting a food deletes its movements.
-- ---------------------------------------------------------------------------
--
-- inventory_movements.item_id was created REFERENCES foods(id) with no ON
-- DELETE action, so a food with even one movement cannot be deleted:
--
--   ERROR: update or delete on table "foods" violates foreign key constraint
--          "inventory_movements_item_id_fkey" on table "inventory_movements"
--
-- Reproduced on the suite database. It already bit every food the US-669
-- backfill seeded and every food an iOS build ever changed the quantity of;
-- the seed above would extend it to every food added with a quantity, and the
-- shipped iOS delete (DataService.deleteFood, a plain DELETE) and the web's
-- deleteFood would both start failing for nearly every pantry item. item_stock
-- already cascades, and 20260901000007 was written on the assumption that a
-- food delete works ("via ON DELETE CASCADE when a food is removed").
--
-- CASCADE, not SET NULL. SET NULL would keep the rows but needs item_id to
-- become nullable, and then every fold that groups by item_id
-- (rpc_reconcile_item_stock, detect_item_stock_drift, the client's
-- foldMovements) would grow a NULL item carrying a balance nobody owns --
-- reported as drift every night. The history of an item the parent deleted
-- explains a balance that no longer exists. The cost is real and is the
-- owner's to weigh: spend and waste reports lose a deleted food's rows. A merge
-- is unaffected, because rpc_merge_items redirects (merged_into_id) rather than
-- deleting.
--
-- The append-only rule is unchanged for clients: UPDATE, DELETE and TRUNCATE
-- stay revoked and no policy grants them. A cascade is the foreign key's own
-- action and needs neither.
--
-- Loosening a constraint is backward-compatible: a DELETE that used to fail
-- now succeeds, and nothing that used to succeed changes.
ALTER TABLE public.inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_item_id_fkey;
ALTER TABLE public.inventory_movements
  ADD CONSTRAINT inventory_movements_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES public.foods(id) ON DELETE CASCADE;

COMMENT ON TABLE public.inventory_movements IS
  'US-665: append-only kitchen ledger. Pantry stock is the sum of these, never a number a module writes. Clients never update or delete a row; a correction is a new row and an undo is an appended reversal. 5a: an item''s rows go when the item itself is deleted (ON DELETE CASCADE), as its item_stock row always did.';
