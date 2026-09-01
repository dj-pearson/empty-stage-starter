-- US-668: fold an old client's direct quantity write into the ledger.
--
-- THE HIGHEST-RISK OBJECT IN THIS EPIC. During Release N the shipped iOS app
-- still writes foods.quantity directly, while new code appends movements. Both
-- are happening to the same households at the same time, and the two must not
-- diverge. This trigger is what makes that true: a direct write stops being a
-- competing source of truth and becomes a `correction` movement like any other.
--
-- AFTER, NOT BEFORE. US-668's acceptance criteria say BEFORE UPDATE. That does
-- not work, and Postgres says so itself. A BEFORE trigger that appends a
-- movement fires item_stock -> the US-667 mirror -> an UPDATE of the very row
-- whose UPDATE has not yet returned:
--
--   ERROR:  tuple to be updated was already modified by an operation
--           triggered by the current command
--   HINT:   Consider using an AFTER trigger instead of a BEFORE trigger to
--           propagate changes to other rows.
--
-- Verified by running exactly that shape before writing this. The client's
-- write was silently lost: foods.quantity stayed 0 after being set to 5.
--
-- RE-ENTRANCY. Two triggers now write in a cycle and the cycle is broken twice:
--   1. The mirror sets app.kitchen_loop_mirror while it writes foods.quantity,
--      and this trigger stands down when it sees it.
--   2. Even without the flag, the mirror's UPDATE carries
--      `WHERE quantity IS DISTINCT FROM display_value`, so once the two agree
--      it writes nothing and there is no second firing to guard against.
--
-- CONCURRENCY. The correction is computed from item_stock read under a lock,
-- and two concurrent writes to the same foods row serialize on that row's own
-- lock before ever reaching here. The delta is therefore always against the
-- value that is actually current, never a stale read.
--
-- Retired in Release N+2 (US-689), once no shipped build writes quantity.
--
-- Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md

/**
 * Display amount into an item's canonical unit. The inverse of from_canonical.
 * NULL means genuinely unconvertible.
 */
CREATE OR REPLACE FUNCTION public.to_canonical(
  value NUMERIC,
  display_unit TEXT,
  canonical_unit TEXT,
  unit_conversions JSONB DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $to_canonical$
DECLARE
  token TEXT := lower(btrim(coalesce(display_unit, '')));
  per_item NUMERIC;
  dim TEXT;
  fac NUMERIC;
  canonical_dim TEXT;
BEGIN
  IF value IS NULL OR canonical_unit IS NULL THEN
    RETURN NULL;
  END IF;

  IF token = '' THEN
    RETURN value;
  END IF;

  IF unit_conversions IS NOT NULL AND jsonb_typeof(unit_conversions) = 'object' THEN
    SELECT (v)::NUMERIC INTO per_item
      FROM jsonb_each_text(unit_conversions) AS e(k, v)
     WHERE lower(btrim(k)) = token
     LIMIT 1;
    IF per_item IS NOT NULL THEN
      RETURN value * per_item;
    END IF;
  END IF;

  SELECT u.dimension, u.factor INTO dim, fac FROM public.unit_to_canonical(token) u;
  canonical_dim := CASE canonical_unit
    WHEN 'g' THEN 'mass' WHEN 'ml' THEN 'volume' WHEN 'count' THEN 'count' ELSE NULL END;

  IF dim IS NOT NULL AND dim = canonical_dim AND fac IS NOT NULL THEN
    RETURN value * fac;
  END IF;

  -- Mirrors from_canonical: an opaque display unit over a count balance is
  -- one-to-one, because the backfill established that equivalence.
  IF dim IS NULL AND canonical_dim = 'count' THEN
    RETURN value;
  END IF;

  RETURN NULL;
END;
$to_canonical$;

COMMENT ON FUNCTION public.to_canonical(NUMERIC, TEXT, TEXT, JSONB) IS
  'US-668: display amount into an item canonical unit; the inverse of from_canonical. NULL means unconvertible and the caller must not guess.';

CREATE OR REPLACE FUNCTION public.translate_direct_quantity_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $translate_direct_quantity_write$
DECLARE
  canonical TEXT;
  target NUMERIC;
  balance NUMERIC;
  movement_delta NUMERIC;
  actor UUID;
BEGIN
  -- 1. The mirror wrote this. Stand down; the ledger is already the reason
  --    this value changed.
  IF coalesce(current_setting('app.kitchen_loop_mirror', true), '') = '1' THEN
    RETURN NULL;
  END IF;

  -- 2. A movement needs a household to belong to. Pre-household rows predate
  --    the sharing model and are left entirely alone.
  IF NEW.household_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 3. Which unit is this item's ledger denominated in? An unclassified item
  --    is inferred from its own display unit, defaulting to count, which is
  --    the same rule the US-669 backfill applies.
  canonical := NEW.canonical_unit;
  IF canonical IS NULL THEN
    SELECT CASE u.dimension
             WHEN 'mass' THEN 'g' WHEN 'volume' THEN 'ml' ELSE 'count' END
      INTO canonical
      FROM public.unit_to_canonical(NEW.unit) u;
    canonical := coalesce(canonical, 'count');
  END IF;

  -- 4. A NULL quantity means the client cleared it, which is a correction to
  --    zero, not an absence of information. Criterion 3: a write from NULL to
  --    a value is likewise an ordinary correction from zero, never an
  --    `initial` movement -- `initial` belongs to the US-669 backfill alone,
  --    and using it here would make a parent's edit indistinguishable from
  --    seeded history.
  target := public.to_canonical(coalesce(NEW.quantity, 0), NEW.unit, canonical, NEW.unit_conversions);
  IF target IS NULL THEN
    -- Cannot express the client's number in the ledger's unit. Appending a
    -- guess would corrupt the balance; do nothing and let
    -- rpc_stock_mirror_divergence surface the item.
    RETURN NULL;
  END IF;

  -- 5. Read the balance under a lock so two corrections cannot both compute
  --    against the same starting value. Concurrent writers to this foods row
  --    have already serialized on its row lock before reaching here; this
  --    covers the case where a movement is appended by another path.
  SELECT s.on_hand_canonical INTO balance
    FROM public.item_stock s WHERE s.item_id = NEW.id FOR UPDATE;
  balance := coalesce(balance, 0);

  movement_delta := target - balance;

  -- 6. A no-op update appends nothing. inventory_movements forbids a zero
  --    delta anyway; this is the check that keeps a harmless UPDATE from
  --    raising.
  IF movement_delta = 0 THEN
    RETURN NULL;
  END IF;

  actor := coalesce(auth.uid(), NEW.user_id);

  INSERT INTO public.inventory_movements (
    id, household_id, item_id, delta, canonical_unit,
    display_quantity, display_unit, reason, created_by
  ) VALUES (
    gen_random_uuid(), NEW.household_id, NEW.id, movement_delta, canonical,
    NEW.quantity, NEW.unit, 'correction', actor
  );

  RETURN NULL;
END;
$translate_direct_quantity_write$;

DROP TRIGGER IF EXISTS foods_translate_direct_quantity_write ON public.foods;
CREATE TRIGGER foods_translate_direct_quantity_write
  AFTER UPDATE OF quantity ON public.foods
  FOR EACH ROW
  WHEN (OLD.quantity IS DISTINCT FROM NEW.quantity)
  EXECUTE FUNCTION public.translate_direct_quantity_write();

COMMENT ON FUNCTION public.translate_direct_quantity_write() IS
  'US-668: turns a shipped client direct write to foods.quantity into a correction movement, so old and new clients cannot diverge during Release N. AFTER, not BEFORE: a BEFORE trigger here loses the write with "tuple to be updated was already modified by an operation triggered by the current command". Retired in US-689.';
