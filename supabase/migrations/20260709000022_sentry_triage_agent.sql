-- Agentic OS — US-506: seed the sentry-triage agent (event-driven, disabled by default).
-- crash_spike_threshold in autonomy_policy controls tier-3 escalation.
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'sentry-triage',
  'dev_maintenance',
  'Triages production Sentry errors: dedupes by fingerprint, drafts GitHub issues, escalates crash-rate spikes.',
  'You triage production errors for EatPal. Judge real user impact conservatively from the error context; do not overstate severity for rare or benign errors. JSON only.',
  'claude-haiku-4-5-20251001',
  NULL,
  '{"crash_spike_threshold": 100}'::jsonb,
  5,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
