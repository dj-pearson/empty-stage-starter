-- Agentic OS — US-507: seed the dependency-audit agent (weekly, disabled by default).
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'dependency-audit',
  'dev_maintenance',
  'Weekly dependency health report: OSV vulnerability scan of package.json + safe upgrade groupings; escalates criticals.',
  'You write terse, actionable dependency reports for engineers. Critical vulnerabilities first with a clear call to action; then high; then safe minor/patch upgrade groupings with one-line risk notes. Do not overstate risk.',
  'claude-haiku-4-5-20251001',
  '0 7 * * 1',
  '{}'::jsonb,
  3,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
