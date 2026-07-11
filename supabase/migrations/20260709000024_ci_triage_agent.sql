-- Agentic OS — US-508: seed the ci-triage agent (event-driven, disabled by default).
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'ci-triage',
  'dev_maintenance',
  'Triages failed GitHub Actions runs: flake vs real failure, drafts a PR-comment with a suggested fix.',
  'You triage CI failures for EatPal. Distinguish transient flakes (network/timeout/infra) from real failures. Identify the failing step, likely cause, and a concrete suggested fix. Be precise and terse. JSON only.',
  'claude-haiku-4-5-20251001',
  NULL,
  '{}'::jsonb,
  5,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
