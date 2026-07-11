-- Agentic OS — US-513: seed the weekly business KPI report agent.
--
-- Mondays: computes signups, activation, retention proxy, MRR & subscription
-- changes, support volume + CSAT, content published, and total agent spend —
-- each with week-over-week deltas (all figures from SQL) — then Claude writes a
-- short narrative and the report is drafted as a templated send_email to the
-- configured digest recipients. DISABLED by default.
--
-- Seed-only: reuses existing tables, no schema change.
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'kpi-report',
  'growth',
  'Monday KPI email: signups, activation, MRR/subscriptions, support + CSAT, content, and agent spend with week-over-week deltas plus a short narrative.',
  'You are a concise business analyst. From the supplied numbers ONLY (never invent figures), write a 4-6 sentence weekly narrative: what improved, what regressed, and ONE suggested focus for the coming week. Plain, direct language for a founder.',
  'claude-haiku-4-5-20251001',
  '0 8 * * 1',
  '{}'::jsonb,
  3,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
