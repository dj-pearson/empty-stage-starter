-- Item 25: give the intake questionnaire's three answers a column on kids.
--
-- pickiness_level, texture_sensitivity_level and preferred_preparations were
-- read and written by clients that assumed they existed:
--   * iOS Kid.swift encodes all three (CodingKeys pickiness_level,
--     texture_sensitivity_level, preferred_preparations), so a shipped build's
--     kid save names columns PostgREST did not have.
--   * the web intake computed a pickiness level and a texture level and then
--     had to drop them (CLIENT_ONLY_KID_FIELDS in KidsContext) before saving.
--   * chainNetwork.ts selects kids.pickiness_level, and
--     extract_user_backup_data (20251010232000) reads k.pickiness_level, which
--     is resolved when the function runs and so failed every backup.
--
-- Additive only: three nullable columns with no default. No CHECK
-- constraints, on purpose: the web intake sends not_picky / somewhat_picky /
-- very_picky / extremely_picky and none / mild / strong / severe, but iOS
-- builds already on phones send whatever their pickers hold, and a constraint
-- that rejected one of those would fail that user's whole kid save. The web
-- validates its own values in KidSchema instead.
--
-- RLS is unchanged: the existing household-scoped kids policies cover new
-- columns, and table-level grants to authenticated cover them too.

ALTER TABLE public.kids
  ADD COLUMN IF NOT EXISTS pickiness_level text,
  ADD COLUMN IF NOT EXISTS texture_sensitivity_level text,
  ADD COLUMN IF NOT EXISTS preferred_preparations text[];

COMMENT ON COLUMN public.kids.pickiness_level IS
  'Computed by the web intake from eating_behavior + new_food_willingness (not_picky, somewhat_picky, very_picky, extremely_picky); iOS sets it from its own picker. Free text: no CHECK, older clients send their own labels.';
COMMENT ON COLUMN public.kids.texture_sensitivity_level IS
  'Intake answer: none, mild, strong or severe on the web. Free text: no CHECK.';
COMMENT ON COLUMN public.kids.preferred_preparations IS
  'Preparation styles the child accepts (e.g. "Only cold foods"). NULL = not recorded.';
