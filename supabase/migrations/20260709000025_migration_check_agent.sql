-- Agentic OS — US-509: seed the migration-check agent (event-driven, disabled by default).
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'migration-check',
  'dev_maintenance',
  'Lints PR migrations against backward-compatibility rules; drafts a PR comment + escalates real violations.',
  'You review Supabase migrations for backward compatibility. The DB is shared by shipped iOS versions, so changes must be additive. A CHECK WIDENING (adding allowed values) is safe; a tightening is not. Drop false positives from the deterministic linter. JSON only.',
  'claude-haiku-4-5-20251001',
  NULL,
  '{}'::jsonb,
  5,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
