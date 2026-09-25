-- Public share links for recipes (item 10).
--
-- A parent can hand a recipe to someone without an account: /r/<token> shows
-- the recipe read-only with a sign-up prompt. The link is a row here, so it
-- can be revoked, and nothing about the household travels with it.
--
-- Shape:
--   * recipe_shares holds one row per link. The token is minted by the
--     database (two v4 uuids, 244 random bits, hex) and a client cannot pick
--     one: INSERT is granted on recipe_id and household_id only, and a BEFORE
--     INSERT trigger overwrites whatever token arrives anyway.
--   * Household members list, create and revoke their household's links.
--     Revoking sets revoked_at, once; a revoked link cannot be switched back
--     on (UPDATE is granted on revoked_at only, and the policy requires it to
--     be set). There is no DELETE: the row is the audit of what was shared.
--   * anon has no privilege on the table at all. The only way in without a
--     session is get_shared_recipe(token), SECURITY DEFINER, which returns the
--     recipe's public fields and nothing else: no household, user, kid,
--     allergen, rating, note or tip column is read into the result.
--   * At most one live link per recipe (partial unique index), so "Share
--     link" pressed twice, or by both parents, lands on the same URL.
--
-- Additive only: a new table and a new function. No shipped iOS build reads
-- either.

CREATE TABLE IF NOT EXISTS public.recipe_shares (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id    uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  token        text NOT NULL DEFAULT (
                 replace(gen_random_uuid()::text, '-', '') ||
                 replace(gen_random_uuid()::text, '-', '')
               ),
  created_by   uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  CONSTRAINT recipe_shares_token_key UNIQUE (token),
  CONSTRAINT recipe_shares_token_length CHECK (char_length(token) >= 32)
);

CREATE UNIQUE INDEX IF NOT EXISTS recipe_shares_one_live_per_recipe
  ON public.recipe_shares (recipe_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS recipe_shares_household_idx
  ON public.recipe_shares (household_id);

ALTER TABLE public.recipe_shares ENABLE ROW LEVEL SECURITY;

-- Table privileges: nothing for anon, and only the columns a member may set.
REVOKE ALL ON TABLE public.recipe_shares FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.recipe_shares TO authenticated;
GRANT INSERT (recipe_id, household_id) ON TABLE public.recipe_shares TO authenticated;
GRANT UPDATE (revoked_at) ON TABLE public.recipe_shares TO authenticated;
GRANT ALL ON TABLE public.recipe_shares TO service_role;

-- The grants above are the first line; these triggers hold even where a
-- blanket GRANT ALL has been applied on top (the local SQL harness does that,
-- and a future migration could). The token and author are always the
-- database's, and a link's identity never changes after it is made.
CREATE OR REPLACE FUNCTION public.recipe_shares_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  NEW.created_at := now();
  NEW.revoked_at := NULL;
  -- created_by is not set here: its default is auth.uid() and the INSERT
  -- policy requires it to equal auth.uid(), so a forged author is refused.
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.recipe_shares_before_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.recipe_id IS DISTINCT FROM OLD.recipe_id
     OR NEW.household_id IS DISTINCT FROM OLD.household_id
     OR NEW.token IS DISTINCT FROM OLD.token
     -- NULL is allowed: ON DELETE SET NULL when the author's account goes.
     OR (NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM OLD.created_by)
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'recipe_shares: only revoked_at can change'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.recipe_shares_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recipe_shares_before_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS recipe_shares_before_insert ON public.recipe_shares;
CREATE TRIGGER recipe_shares_before_insert
  BEFORE INSERT ON public.recipe_shares
  FOR EACH ROW EXECUTE FUNCTION public.recipe_shares_before_insert();

DROP TRIGGER IF EXISTS recipe_shares_before_update ON public.recipe_shares;
CREATE TRIGGER recipe_shares_before_update
  BEFORE UPDATE ON public.recipe_shares
  FOR EACH ROW EXECUTE FUNCTION public.recipe_shares_before_update();

DROP POLICY IF EXISTS "Household members view recipe shares" ON public.recipe_shares;
CREATE POLICY "Household members view recipe shares"
  ON public.recipe_shares
  FOR SELECT
  TO authenticated
  USING (household_id = (SELECT public.get_user_household_id(auth.uid())));

-- The recipe has to belong to the same household: a member cannot mint a link
-- to another household's recipe by guessing its id.
DROP POLICY IF EXISTS "Household members create recipe shares" ON public.recipe_shares;
CREATE POLICY "Household members create recipe shares"
  ON public.recipe_shares
  FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id = (SELECT public.get_user_household_id(auth.uid()))
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.recipes r
       WHERE r.id = recipe_shares.recipe_id
         AND r.household_id = recipe_shares.household_id
    )
  );

DROP POLICY IF EXISTS "Household members revoke recipe shares" ON public.recipe_shares;
CREATE POLICY "Household members revoke recipe shares"
  ON public.recipe_shares
  FOR UPDATE
  TO authenticated
  USING (
    household_id = (SELECT public.get_user_household_id(auth.uid()))
    AND revoked_at IS NULL
  )
  WITH CHECK (
    household_id = (SELECT public.get_user_household_id(auth.uid()))
    AND revoked_at IS NOT NULL
  );

-- ---------------------------------------------------------------------------
-- get_shared_recipe(token): the public read.
--
-- Returns zero rows for an unknown, malformed or revoked token, so a caller
-- cannot tell "never existed" from "revoked". Ingredients come from
-- recipe_ingredients when the recipe has any, otherwise from the names of the
-- foods in food_ids (older recipes); only name, quantity, unit and section are
-- read, never a food's allergens or a note. Steps are the instructions column
-- as stored (a JSON array of strings or plain text); the page splits them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_shared_recipe(p_token text)
RETURNS TABLE (
  name               text,
  image_url          text,
  ingredients        jsonb,
  instructions       text,
  prep_time          text,
  cook_time          text,
  total_time_minutes integer,
  servings           text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipe_id uuid;
BEGIN
  IF p_token IS NULL OR char_length(p_token) < 32 OR char_length(p_token) > 128 THEN
    RETURN;
  END IF;

  SELECT s.recipe_id INTO v_recipe_id
    FROM public.recipe_shares s
   WHERE s.token = p_token
     AND s.revoked_at IS NULL;

  IF v_recipe_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    r.name,
    r.image_url,
    COALESCE(
      (
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'name', COALESCE(NULLIF(btrim(ri.name), ''), ri.ingredient_name),
                   'quantity', ri.quantity,
                   'unit', ri.unit,
                   'group', ri.group_label
                 )
                 ORDER BY ri.sort_order NULLS LAST, ri.id
               )
          FROM public.recipe_ingredients ri
         WHERE ri.recipe_id = r.id
           AND COALESCE(NULLIF(btrim(ri.name), ''), ri.ingredient_name) IS NOT NULL
      ),
      (
        SELECT jsonb_agg(
                 jsonb_build_object('name', f.name, 'quantity', NULL, 'unit', NULL, 'group', NULL)
                 ORDER BY array_position(r.food_ids, f.id)
               )
          FROM public.foods f
         WHERE f.id = ANY (r.food_ids)
      ),
      '[]'::jsonb
    ) AS ingredients,
    r.instructions,
    r.prep_time,
    r.cook_time,
    r.total_time_minutes,
    r.servings
  FROM public.recipes r
  WHERE r.id = v_recipe_id;
END;
$$;

-- US-804: name the roles. A signed-out visitor opens the link, so anon keeps
-- EXECUTE on purpose.
REVOKE ALL ON FUNCTION public.get_shared_recipe(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_recipe(text) TO anon, authenticated;

COMMENT ON TABLE public.recipe_shares IS
  'Revocable public links to one recipe. Read publicly only through get_shared_recipe(token).';
COMMENT ON FUNCTION public.get_shared_recipe(text) IS
  'Public read of a shared recipe: name, image, ingredients, steps, times, servings. Nothing for a revoked token.';
