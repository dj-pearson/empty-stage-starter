-- US-468: explicit recipe favorites.
--
-- Additive + backward-compatible (see CLAUDE.md Migration Rules):
--   * New nullable-with-default column — old iOS builds simply ignore the
--     unknown column on SELECT, and their INSERTs (which omit it) get the
--     DEFAULT, so nothing breaks for users on shipped versions.
--   * No RLS change needed: the existing per-user / per-household recipe
--     policies already govern this column.
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;

-- Partial index so "favorites only" filters and any future "most loved"
-- surfacing stay cheap as libraries grow.
CREATE INDEX IF NOT EXISTS idx_recipes_is_favorite
  ON public.recipes (user_id)
  WHERE is_favorite;
