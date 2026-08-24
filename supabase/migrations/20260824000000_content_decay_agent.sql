-- US-650: content decay agent.
--
-- Registers the agent so the dispatcher picks it up. The dispatcher resolves
-- handlers by convention (agent_definitions.name -> agent-<name>), so this row
-- plus the config.toml entry is the whole registration.
--
-- Additive only: one INSERT, no schema change. 'content_refresh' needs no
-- migration because agent_approvals.action_type is free-form TEXT with no CHECK
-- constraint; the only trigger that switches on action_type
-- (agent_content_approval_rejected, 20260709000019) matches an explicit list
-- that this type is deliberately not in -- a rejected refresh has no
-- content_calendar row to mark rejected.
--
-- enabled = FALSE to match every other agent seed. Turning it on is a
-- deliberate act in the Command Center, not a side effect of deploying.

INSERT INTO public.agent_definitions (
  name, domain, description, system_prompt, model, schedule_cron,
  autonomy_policy, daily_cost_cap_usd, enabled
)
VALUES (
  'content-decay',
  'marketing',
  'Weekly: compares the trailing 28 days of gsc_page_performance against the preceding 28 and drafts a content_refresh approval for each published page that lost clicks.',
  'You do not generate text for this agent. The decay comparison is deterministic and runs in code; the handler drafts approvals directly.',
  'claude-haiku-4-5-20251001',
  -- Monday 16:00 UTC, two hours after content-calendar, so the two do not land
  -- in the approval queue at the same moment.
  '0 16 * * 1',
  -- Thresholds are overridable without a deploy. Defaults mirror
  -- DEFAULT_THRESHOLDS in functions/_shared/content-decay-logic.ts; change both
  -- or neither.
  '{"decay_thresholds": {"windowDays": 28, "minClickDrop": 0.3, "minPriorImpressions": 100, "minPageAgeDays": 60}}'::jsonb,
  -- Lower cap than the writing agents: this run does no model inference, so any
  -- spend at all means something is wrong.
  1,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
