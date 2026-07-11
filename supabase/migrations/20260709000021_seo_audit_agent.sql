-- Agentic OS — US-505: seed the seo-audit agent (disabled by default).
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'seo-audit',
  'marketing',
  'Weekly self-audit of production pages (titles/meta/canonical/broken links/JSON-LD); compiles a deduped tier-2 escalation.',
  'Deterministic SEO audit — no LLM generation required.',
  'claude-haiku-4-5-20251001',
  '0 5 * * 1',
  '{}'::jsonb,
  1,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
