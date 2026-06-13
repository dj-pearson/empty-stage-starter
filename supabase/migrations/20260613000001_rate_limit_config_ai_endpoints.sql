-- US-325: seed rate-limit config for the AI/LLM edge functions that now call
-- check_rate_limit_with_tier(). Without an explicit row these endpoints fall
-- back to the hardcoded default (50/hr) inside the RPC; explicit config lets
-- us tune per-tier limits and document them.
--
-- Backward-compatible: additive INSERT ... ON CONFLICT DO NOTHING. Old clients
-- never read rate_limit_config; new edge functions tolerate a missing row.

INSERT INTO rate_limit_config
  (endpoint, free_tier_limit, premium_tier_limit, enterprise_tier_limit, window_minutes, description)
VALUES
  ('tonight-mode',            20, 200, 2000, 60, 'Tonight Mode dinner suggestions'),
  ('parse-grocery-image',     10, 100, 1000, 60, 'Vision: grocery-list OCR'),
  ('parse-receipt-image',     10, 100, 1000, 60, 'Vision: receipt OCR'),
  ('identify-product',        10, 100, 1000, 60, 'Vision: single-product identification'),
  ('generate-social-content',  5,  50,  500, 60, 'Admin: social content generation'),
  ('generate-blog-content',    5,  50,  500, 60, 'Admin: blog content generation')
ON CONFLICT (endpoint) DO NOTHING;
