-- US-276: Recurring-restock predictor.
--
-- Tracks the last 12 add timestamps per user-product so the iOS client
-- can compute interquartile cadence and surface "you usually buy this
-- every 7 days, last add was 6 days ago — restock?" suggestions.
--
-- The history is intentionally a JSONB array on the existing prefs row
-- (rather than a separate add_log table) for two reasons:
--
--   1. The query is always "give me all products + their last 12 adds
--      for this user" — colocating the history with the row avoids a
--      join on every dashboard load.
--
--   2. Twelve ISO timestamps fit comfortably in a JSONB column
--      (~360 bytes). Trimming to 12 on insert caps the row size.
--
-- Maintenance is owned by the iOS client: `SmartProductService.recordAdd`
-- appends the current timestamp and trims to the last 12 entries before
-- upserting. No server-side trigger needed.

ALTER TABLE public.user_product_preferences
  ADD COLUMN IF NOT EXISTS add_history JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.user_product_preferences.add_history IS
  'US-276: ordered array of ISO-8601 timestamps for the last <=12 grocery adds of this product. Drives the RestockPredictor cadence computation in iOS.';
