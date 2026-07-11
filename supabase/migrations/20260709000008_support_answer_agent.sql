-- Agentic OS — US-491: seed the RAG support answer agent (disabled by default).
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'support-answer',
  'customer_service',
  'Drafts grounded reply emails for triaged how_to tickets using the knowledge base; escalates when confidence is low.',
  'You are the support answer agent for EatPal. Answer strictly from the provided knowledge-base entries. Never invent product behavior. If the entries do not clearly answer the question, set confidence to "low" so a human handles it. Keep replies warm, concise, and specific.',
  'claude-sonnet-4-5',
  '*/5 * * * *',
  '{}'::jsonb,
  5,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
