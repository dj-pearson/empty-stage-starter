-- US-667: keep foods.quantity and foods.is_safe correct for shipped clients.
--
-- iOS is live in the App Store. Every build on a phone reads foods.quantity
-- and foods.is_safe, and cannot be made to stop. So those two columns are not
-- dropped; they are demoted to server-maintained projections of the new truth,
-- and old clients keep working with no rebuild.
--
--   foods.quantity  <- item_stock.on_hand_canonical, converted to the item's
--                      display unit
--   foods.is_safe   <- true only when EVERY kid in the household is at a
--                      'safe' disposition for that item
--
-- Both are retired in Release N+2 (US-689), once MIN_SUPPORTED_IOS_BUILD has
-- moved past the release that reads the new shape.
--
-- Design: docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md

-- ---------------------------------------------------------------------------
-- Unit conversion, server side.
--
-- A SQL mirror of the tables in src/lib/unitNormalize.ts. It exists because
-- the mirror runs in a trigger, where the TypeScript converter cannot reach.
-- Both must agree; the shared fixtures in tests/fixtures/kitchen-loop pin the
-- TypeScript side and this file is the SQL side of the same numbers.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.unit_to_canonical(unit TEXT)
RETURNS TABLE (dimension TEXT, factor NUMERIC)
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $unit_to_canonical$
  SELECT d, f FROM (
    SELECT CASE lower(btrim(coalesce(unit, '')))
      -- mass, canonical grams
      WHEN 'g' THEN 'mass' WHEN 'gram' THEN 'mass' WHEN 'grams' THEN 'mass'
      WHEN 'kg' THEN 'mass' WHEN 'kilogram' THEN 'mass' WHEN 'kilograms' THEN 'mass'
      WHEN 'oz' THEN 'mass' WHEN 'ounce' THEN 'mass' WHEN 'ounces' THEN 'mass'
      WHEN 'lb' THEN 'mass' WHEN 'lbs' THEN 'mass' WHEN 'pound' THEN 'mass' WHEN 'pounds' THEN 'mass'
      -- volume, canonical millilitres
      WHEN 'ml' THEN 'volume' WHEN 'milliliter' THEN 'volume' WHEN 'millilitre' THEN 'volume'
      WHEN 'l' THEN 'volume' WHEN 'liter' THEN 'volume' WHEN 'litre' THEN 'volume'
      WHEN 'tsp' THEN 'volume' WHEN 'teaspoon' THEN 'volume' WHEN 'teaspoons' THEN 'volume'
      WHEN 'tbsp' THEN 'volume' WHEN 'tablespoon' THEN 'volume' WHEN 'tablespoons' THEN 'volume'
      WHEN 'cup' THEN 'volume' WHEN 'cups' THEN 'volume'
      WHEN 'fl oz' THEN 'volume' WHEN 'floz' THEN 'volume'
      WHEN 'pt' THEN 'volume' WHEN 'pint' THEN 'volume'
      WHEN 'qt' THEN 'volume' WHEN 'quart' THEN 'volume'
      WHEN 'gal' THEN 'volume' WHEN 'gallon' THEN 'volume'
      -- count, canonical pieces
      WHEN 'count' THEN 'count' WHEN 'piece' THEN 'count' WHEN 'pieces' THEN 'count'
      WHEN 'each' THEN 'count' WHEN 'ea' THEN 'count' WHEN 'ct' THEN 'count'
      WHEN 'dozen' THEN 'count'
      ELSE NULL
    END AS d,
    CASE lower(btrim(coalesce(unit, '')))
      WHEN 'g' THEN 1 WHEN 'gram' THEN 1 WHEN 'grams' THEN 1
      WHEN 'kg' THEN 1000 WHEN 'kilogram' THEN 1000 WHEN 'kilograms' THEN 1000
      WHEN 'oz' THEN 28.3495 WHEN 'ounce' THEN 28.3495 WHEN 'ounces' THEN 28.3495
      WHEN 'lb' THEN 453.592 WHEN 'lbs' THEN 453.592 WHEN 'pound' THEN 453.592 WHEN 'pounds' THEN 453.592
      WHEN 'ml' THEN 1 WHEN 'milliliter' THEN 1 WHEN 'millilitre' THEN 1
      WHEN 'l' THEN 1000 WHEN 'liter' THEN 1000 WHEN 'litre' THEN 1000
      WHEN 'tsp' THEN 4.92892 WHEN 'teaspoon' THEN 4.92892 WHEN 'teaspoons' THEN 4.92892
      WHEN 'tbsp' THEN 14.7868 WHEN 'tablespoon' THEN 14.7868 WHEN 'tablespoons' THEN 14.7868
      WHEN 'cup' THEN 236.588 WHEN 'cups' THEN 236.588
      WHEN 'fl oz' THEN 29.5735 WHEN 'floz' THEN 29.5735
      WHEN 'pt' THEN 473.176 WHEN 'pint' THEN 473.176
      WHEN 'qt' THEN 946.353 WHEN 'quart' THEN 946.353
      WHEN 'gal' THEN 3785.41 WHEN 'gallon' THEN 3785.41
      WHEN 'count' THEN 1 WHEN 'piece' THEN 1 WHEN 'pieces' THEN 1
      WHEN 'each' THEN 1 WHEN 'ea' THEN 1 WHEN 'ct' THEN 1
      WHEN 'dozen' THEN 12
      ELSE NULL
    END AS f
  ) t;
$unit_to_canonical$;

/**
 * Convert a canonical amount back into an item's display unit.
 * Returns NULL when it genuinely cannot be done, which the caller must treat
 * as "leave the old value alone", never as zero.
 */
CREATE OR REPLACE FUNCTION public.from_canonical(
  value NUMERIC,
  canonical_unit TEXT,
  display_unit TEXT,
  unit_conversions JSONB DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $from_canonical$
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

  -- No display unit at all: the number is unitless, so it is already right.
  IF token = '' THEN
    RETURN value;
  END IF;

  -- A per-item conversion wins, exactly as it does in canonicalUnits.ts.
  IF unit_conversions IS NOT NULL AND jsonb_typeof(unit_conversions) = 'object' THEN
    SELECT (v)::NUMERIC INTO per_item
      FROM jsonb_each_text(unit_conversions) AS e(k, v)
     WHERE lower(btrim(k)) = token
     LIMIT 1;
    IF per_item IS NOT NULL AND per_item <> 0 THEN
      RETURN value / per_item;
    END IF;
  END IF;

  SELECT u.dimension, u.factor INTO dim, fac FROM public.unit_to_canonical(token) u;

  canonical_dim := CASE canonical_unit
    WHEN 'g' THEN 'mass' WHEN 'ml' THEN 'volume' WHEN 'count' THEN 'count' ELSE NULL END;

  -- Same dimension: ordinary arithmetic.
  IF dim IS NOT NULL AND dim = canonical_dim AND fac IS NOT NULL AND fac <> 0 THEN
    RETURN value / fac;
  END IF;

  -- An opaque display unit ("servings", "packages", "bag") over a COUNT
  -- balance is one-to-one, and that is not a fudge: the US-669 backfill
  -- classifies exactly these items as 'count' with their existing quantity, so
  -- one count IS one serving for this item, by construction.
  --
  -- This matters more than it looks. In the sampled production data every
  -- foods.unit value is 'servings' or 'packages', so without this rule the
  -- mirror would decline to convert almost every row and foods.quantity would
  -- silently stop tracking for the clients this whole migration exists to
  -- protect.
  IF dim IS NULL AND canonical_dim = 'count' THEN
    RETURN value;
  END IF;

  -- Different dimensions with no per-item bridge. Refuse.
  RETURN NULL;
END;
$from_canonical$;

COMMENT ON FUNCTION public.from_canonical(NUMERIC, TEXT, TEXT, JSONB) IS
  'US-667: canonical amount back into an item display unit. NULL means genuinely unconvertible and the caller must leave the old value alone rather than write a zero.';

-- ---------------------------------------------------------------------------
-- Where an unconvertible mirror is recorded.
-- ---------------------------------------------------------------------------

ALTER TABLE public.item_stock
  ADD COLUMN IF NOT EXISTS mirror_unconvertible BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.item_stock.mirror_unconvertible IS
  'US-667: the last mirror could not express this balance in the item display unit, so foods.quantity was left as it was. Surfaced by rpc_stock_mirror_divergence.';

-- ---------------------------------------------------------------------------
-- The mirror.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mirror_item_stock_to_foods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $mirror_item_stock_to_foods$
DECLARE
  target_unit TEXT;
  conversions JSONB;
  display_value NUMERIC;
BEGIN
  SELECT f.unit, f.unit_conversions INTO target_unit, conversions
    FROM public.foods f WHERE f.id = NEW.item_id;

  display_value := public.from_canonical(
    NEW.on_hand_canonical, NEW.canonical_unit, target_unit, conversions
  );

  IF display_value IS NULL THEN
    -- Leave foods.quantity exactly as it is. A wrong number here is worse than
    -- a stale one: the stale one is what the client already believed.
    UPDATE public.item_stock SET mirror_unconvertible = true
     WHERE item_id = NEW.item_id AND mirror_unconvertible IS DISTINCT FROM true;
    RETURN NULL;
  END IF;

  -- Announce that this write comes from the mirror, so the US-668 trigger
  -- (which turns a client's direct quantity write into a correction movement)
  -- can tell the two apart and stand down. Without this the two triggers would
  -- feed each other: mirror writes quantity, US-668 sees a quantity change and
  -- appends a movement, the movement updates item_stock, the mirror fires
  -- again. The flag is transaction-local (the third argument is `true`), so it
  -- cannot leak into another statement or another session.
  PERFORM set_config('app.kitchen_loop_mirror', '1', true);

  UPDATE public.foods
     SET quantity = display_value
   WHERE id = NEW.item_id
     AND quantity IS DISTINCT FROM display_value;

  PERFORM set_config('app.kitchen_loop_mirror', '', true);

  UPDATE public.item_stock SET mirror_unconvertible = false
   WHERE item_id = NEW.item_id AND mirror_unconvertible IS DISTINCT FROM false;

  RETURN NULL;
END;
$mirror_item_stock_to_foods$;

DROP TRIGGER IF EXISTS item_stock_mirror_to_foods ON public.item_stock;
CREATE TRIGGER item_stock_mirror_to_foods
  AFTER INSERT OR UPDATE OF on_hand_canonical ON public.item_stock
  FOR EACH ROW
  EXECUTE FUNCTION public.mirror_item_stock_to_foods();

COMMENT ON FUNCTION public.mirror_item_stock_to_foods() IS
  'US-667: projects item_stock into foods.quantity so shipped iOS builds keep reading a correct number. Sets app.kitchen_loop_mirror for the duration so the US-668 direct-write trigger stands down and the two cannot loop.';

CREATE OR REPLACE FUNCTION public.rpc_stock_mirror_divergence(target_household UUID)
RETURNS TABLE (item_id UUID, item_name TEXT, canonical NUMERIC, canonical_unit TEXT, display_unit TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $rpc_stock_mirror_divergence$
  SELECT s.item_id, f.name, s.on_hand_canonical, s.canonical_unit, f.unit
    FROM public.item_stock s
    JOIN public.foods f ON f.id = s.item_id
   WHERE s.household_id = target_household
     AND s.mirror_unconvertible;
$rpc_stock_mirror_divergence$;

COMMENT ON FUNCTION public.rpc_stock_mirror_divergence(UUID) IS
  'US-667: items whose ledger balance cannot be expressed in their display unit, so foods.quantity is stale for older clients. Each needs a per-item conversion in foods.unit_conversions.';

REVOKE ALL ON FUNCTION public.rpc_stock_mirror_divergence(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_stock_mirror_divergence(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- The is_safe rollup.
--
-- US-678 will store `disposition` on kid_food_ladder. It does not exist yet, so
-- the rule lives in a function here and US-678 reuses it rather than restating
-- it. Deriving it in one place now is what stops the stored column and the
-- rollup disagreeing later.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ladder_disposition(current_rung TEXT, status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $ladder_disposition$
  SELECT CASE
    WHEN status = 'mastered' THEN 'safe'
    WHEN status = 'backed_off' THEN 'refused'
    WHEN public.ladder_rung_index(current_rung) >= 6 THEN 'safe'
    WHEN status = 'paused' THEN 'untried'
    ELSE 'trying'
  END;
$ladder_disposition$;

COMMENT ON FUNCTION public.ladder_disposition(TEXT, TEXT) IS
  'US-667: per-kid disposition derived from rung and status. safe at full_bite or above, or mastered. US-678 stores this as a column and must call this function rather than restate the rule.';

CREATE OR REPLACE FUNCTION public.refresh_food_is_safe(target_food UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $refresh_food_is_safe$
DECLARE
  household UUID;
  kid_count INT;
  safe_count INT;
  trying_count INT;
BEGIN
  SELECT f.household_id INTO household FROM public.foods f WHERE f.id = target_food;
  IF household IS NULL THEN
    RETURN; -- pre-household row; leave its flags alone
  END IF;

  SELECT count(*) INTO kid_count FROM public.kids k WHERE k.household_id = household;
  IF kid_count = 0 THEN
    RETURN; -- nothing to roll up; do not flip a flag on no evidence
  END IF;

  SELECT
    count(*) FILTER (WHERE public.ladder_disposition(l.current_rung, l.status) = 'safe'),
    count(*) FILTER (WHERE public.ladder_disposition(l.current_rung, l.status) = 'trying')
    INTO safe_count, trying_count
    FROM public.kid_food_ladder l
    JOIN public.kids k ON k.id = l.kid_id
   WHERE l.food_id = target_food AND k.household_id = household;

  UPDATE public.foods
     SET is_safe = (safe_count = kid_count),
         is_try_bite = (trying_count > 0)
   WHERE id = target_food;
END;
$refresh_food_is_safe$;

CREATE OR REPLACE FUNCTION public.kid_food_ladder_rollup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $kid_food_ladder_rollup$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_food_is_safe(OLD.food_id);
    RETURN NULL;
  END IF;
  PERFORM public.refresh_food_is_safe(NEW.food_id);
  IF TG_OP = 'UPDATE' AND OLD.food_id IS DISTINCT FROM NEW.food_id THEN
    PERFORM public.refresh_food_is_safe(OLD.food_id);
  END IF;
  RETURN NULL;
END;
$kid_food_ladder_rollup$;

DROP TRIGGER IF EXISTS kid_food_ladder_rollup_is_safe ON public.kid_food_ladder;
CREATE TRIGGER kid_food_ladder_rollup_is_safe
  AFTER INSERT OR UPDATE OR DELETE ON public.kid_food_ladder
  FOR EACH ROW
  EXECUTE FUNCTION public.kid_food_ladder_rollup();

COMMENT ON FUNCTION public.kid_food_ladder_rollup() IS
  'US-667: keeps foods.is_safe true only when every kid in the household is at a safe disposition, and foods.is_try_bite true when any kid is trying. Shipped clients read both.';
