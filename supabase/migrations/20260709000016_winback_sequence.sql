-- Agentic OS — US-500: seed the win-back re-engagement sequence.
-- Triggered by inactive_14d; a second touch ~16 days later (~inactive_30d).
-- Both steps exit on the 'reactivated' sentinel (household became active).
-- Bodies are Claude-generated per household (winback_1/2 are generative) and
-- reviewed individually (templated:false). A 30-day frequency cap is enforced
-- at enrollment in the engine.
INSERT INTO public.nurture_sequences (name, trigger_event, steps, enabled)
SELECT
  'winback',
  'inactive_14d',
  '[
    { "delay_hours": 0,   "template_key": "winback_1", "exit_on_events": ["reactivated"] },
    { "delay_hours": 384, "template_key": "winback_2", "exit_on_events": ["reactivated"] }
  ]'::jsonb,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.nurture_sequences WHERE name = 'winback');
