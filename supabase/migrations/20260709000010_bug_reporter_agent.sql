-- Agentic OS — US-493: seed the bug-reporter agent (disabled by default).
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'bug-reporter',
  'dev_maintenance',
  'Turns triaged bug tickets into well-formed GitHub issue drafts, with duplicate suppression by normalized title.',
  'You convert user bug reports into precise, engineer-ready GitHub issues for EatPal. Extract concrete reproduction steps, the expected vs actual behavior, and any device/platform details. Do not speculate beyond the report. Choose severity conservatively. Respond with JSON only.',
  'claude-haiku-4-5-20251001',
  '*/5 * * * *',
  '{}'::jsonb,
  5,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
