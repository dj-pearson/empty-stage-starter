-- Agentic OS — US-512: seed the system-health & cost anomaly agent.
--
-- Reads admin_system_health metrics (error_rate, api_response_time_p95) and
-- agent_runs cost data, compares the current window against trailing 7-day
-- baselines, and escalates anomalies (tier-2; a sustained error-rate anomaly
-- upgrades to tier-3). Thresholds live in autonomy_policy.health_thresholds so
-- they are tunable without a deploy. Every 15 min, DISABLED by default.
--
-- Seed-only: reuses existing tables, no schema change.
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'health-watch',
  'dev_maintenance',
  'Every 15 min: compares error rate, p95 latency, and daily agent spend against trailing 7-day baselines; escalates anomalies (tier-3 for a sustained outage).',
  'You write terse operational alerts for on-call engineers. State the metric, its current value, the baseline it breached, and the likely blast radius. Do not speculate beyond the evidence.',
  'claude-haiku-4-5-20251001',
  '*/15 * * * *',
  '{"health_thresholds": {"errorRateBaselineMult": 3, "errorRateFloor": 2, "latencyP95Ms": 1000, "spendBaselineMult": 2, "spendFloor": 5, "sustainChecks": 3}}'::jsonb,
  2,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
