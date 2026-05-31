-- Reconcile recipe_ingredients across environments.
--
-- Some databases created recipe_ingredients via the original Oct phase-1
-- migrations (20251014*) as a link table — columns like `ingredient_name`,
-- `ingredient_id` (FK -> ingredients), `section`, `preparation_notes`,
-- `is_optional`, with `ingredient_name` NOT NULL. On those DBs the later
-- 20260430000001_create_recipe_ingredients.sql `CREATE TABLE IF NOT EXISTS`
-- no-op'd (only its policies were applied), so the structured columns the
-- current app selects (name, quantity, unit, group_label, optional_notes,
-- sort_order, created_at) were missing — every
--   recipes?select=*,recipe_ingredients(...,name,...)
-- query 400'd with "column recipe_ingredients_1.name does not exist", so NO
-- recipes loaded on web at all (and iOS recipes appeared to "not sync").
--
-- This migration makes the table match the canonical structured shape on any
-- environment, idempotently:
--   1) add the structured columns if missing,
--   2) drop NOT NULL from legacy columns so new writes (which only set the
--      structured fields) don't fail,
--   3) backfill the structured columns from legacy data so existing rows
--      still render their ingredient name / group / notes,
--   4) ensure the recipe_id -> recipes FK exists (PostgREST needs it to embed).
-- Additive + loosening only; safe to re-run.

-- 1) Structured columns the app selects.
ALTER TABLE public.recipe_ingredients ADD COLUMN IF NOT EXISTS recipe_id      UUID;
ALTER TABLE public.recipe_ingredients ADD COLUMN IF NOT EXISTS food_id        UUID;
ALTER TABLE public.recipe_ingredients ADD COLUMN IF NOT EXISTS sort_order     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.recipe_ingredients ADD COLUMN IF NOT EXISTS name           TEXT;
ALTER TABLE public.recipe_ingredients ADD COLUMN IF NOT EXISTS quantity       NUMERIC;
ALTER TABLE public.recipe_ingredients ADD COLUMN IF NOT EXISTS unit           TEXT;
ALTER TABLE public.recipe_ingredients ADD COLUMN IF NOT EXISTS group_label    TEXT;
ALTER TABLE public.recipe_ingredients ADD COLUMN IF NOT EXISTS optional_notes TEXT;
ALTER TABLE public.recipe_ingredients ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2) Loosen legacy NOT NULL columns + 3) backfill structured columns from them.
DO $reconcile$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='recipe_ingredients' AND column_name='ingredient_name') THEN
    EXECUTE 'ALTER TABLE public.recipe_ingredients ALTER COLUMN ingredient_name DROP NOT NULL';
    EXECUTE 'UPDATE public.recipe_ingredients SET name = ingredient_name WHERE name IS NULL AND ingredient_name IS NOT NULL';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='recipe_ingredients' AND column_name='ingredient_id') THEN
    EXECUTE 'ALTER TABLE public.recipe_ingredients ALTER COLUMN ingredient_id DROP NOT NULL';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='recipe_ingredients' AND column_name='section') THEN
    EXECUTE 'UPDATE public.recipe_ingredients SET group_label = section WHERE group_label IS NULL AND section IS NOT NULL';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='recipe_ingredients' AND column_name='preparation_notes') THEN
    EXECUTE 'UPDATE public.recipe_ingredients SET optional_notes = preparation_notes WHERE optional_notes IS NULL AND preparation_notes IS NOT NULL';
  END IF;
END
$reconcile$;

-- 4) Ensure the FK PostgREST needs for the embed.
DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.recipe_ingredients'::regclass
      AND contype = 'f' AND confrelid = 'public.recipes'::regclass
  ) THEN
    ALTER TABLE public.recipe_ingredients
      ADD CONSTRAINT recipe_ingredients_recipe_id_fkey
      FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;
  END IF;
END
$fk$;
