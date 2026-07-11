-- Agentic OS — US-499: seed the onboarding nurture sequence.
-- 4 steps: welcome (0h), add-a-kid (24h, exit on first_kid_added),
-- first-plan (72h, exit on first_plan_created), week-1 recap (168h).
-- Seeded enabled=TRUE; nothing sends until the nurture-engine agent is enabled.
INSERT INTO public.nurture_sequences (name, trigger_event, steps, enabled)
SELECT
  'onboarding',
  'signup',
  '[
    { "delay_hours": 0,   "template_key": "welcome" },
    { "delay_hours": 24,  "template_key": "add_kid",    "exit_on_events": ["first_kid_added"] },
    { "delay_hours": 72,  "template_key": "first_plan",  "exit_on_events": ["first_plan_created"] },
    { "delay_hours": 168, "template_key": "week1_recap" }
  ]'::jsonb,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.nurture_sequences WHERE name = 'onboarding');
