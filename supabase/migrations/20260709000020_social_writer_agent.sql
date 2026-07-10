-- Agentic OS — US-504: seed the social-writer agent (disabled by default).
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'social-writer',
  'marketing',
  'Drafts per-network social posts (Instagram/Pinterest) for approved social topics and fresh blog posts; max 1/network/day.',
  'You write concise, warm, on-brand social copy for EatPal (evidence-based help for ARFID / picky eating). Platform-appropriate tone; tasteful hashtags. JSON only.',
  'claude-haiku-4-5-20251001',
  '0 17 * * *',
  '{}'::jsonb,
  3,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
