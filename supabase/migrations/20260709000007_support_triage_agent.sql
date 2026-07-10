-- Agentic OS — US-490: support triage agent.
-- Seeds the 'support-triage' agent definition and widens the support_tickets
-- category CHECK to allow the triage taxonomy (adds how_to, account_data).

-- ============================================================================
-- 1. Widen support_tickets.category CHECK (union of old + triage categories).
--    Backward-compatible: existing values stay valid; new ones become allowed.
-- ============================================================================
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_category_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_category_check
  CHECK (category IN (
    -- original categories
    'bug', 'feature_request', 'question', 'billing', 'other',
    -- triage taxonomy additions (US-490)
    'how_to', 'account_data'
  ));

-- ============================================================================
-- 2. Seed the support-triage agent (disabled by default).
-- ============================================================================
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'support-triage',
  'customer_service',
  'Classifies new support tickets (category, sentiment, priority, tier) and escalates sensitive/urgent ones.',
  'You are the support triage agent for EatPal, a meal-planning app for parents of picky eaters and children with ARFID. Classify each ticket accurately and conservatively. Prefer "account_data" for data-deletion/privacy/account-access requests, "billing" for payment/subscription issues, "how_to" for usage questions, "bug" for defects, "feature_request" for suggestions, else "other". Judge sentiment from the user''s tone. Set priority by urgency and impact. Respond with JSON only.',
  'claude-haiku-4-5-20251001',
  '*/5 * * * *',
  '{}'::jsonb,
  5,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
