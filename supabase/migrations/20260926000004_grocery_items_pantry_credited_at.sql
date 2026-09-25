-- Item 16: a receipt scan checks rows off the list AND credits the pantry in
-- one step. Checkout (US-672, ledger mode) credits every checked row, so a row
-- the receipt already credited would be counted twice unless checkout can
-- tell. This column is how it tells: set when something outside checkout put
-- the row's stock in the pantry, cleared by that action's Undo.
--
-- It lives on the row, not in the browser, because the shop is often finished
-- on another device or after a reload, and both have to see it.
--
-- Additive only: one nullable column with no default and no CHECK. Older iOS
-- builds neither send nor read it; their inserts leave it NULL, which means
-- "not credited yet", the behaviour they already have. No new function, so
-- there is nothing to grant or revoke (US-804). RLS is unchanged: the
-- household policies on grocery_items (20260531000001) cover every column.

ALTER TABLE public.grocery_items
  ADD COLUMN IF NOT EXISTS pantry_credited_at timestamptz;

COMMENT ON COLUMN public.grocery_items.pantry_credited_at IS
  'When something other than checkout (a receipt scan) credited this row''s stock to the pantry. NULL = not credited yet; checkout skips rows where it is set.';
