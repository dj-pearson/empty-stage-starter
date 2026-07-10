-- Agentic OS — US-503: blog writer agent + content-approval rejection trigger.

-- Seed the blog-writer agent (disabled by default).
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'blog-writer',
  'marketing',
  'Turns approved blog calendar topics into complete post drafts (body + hero image) for review.',
  'You are an evidence-based content writer for EatPal (food-chaining science for ARFID and extreme picky eating). Calm, hopeful, non-blaming; concrete examples; HTML body. JSON only.',
  'claude-sonnet-4-5',
  '0 16 * * 1',
  '{}'::jsonb,
  10,
  FALSE
)
ON CONFLICT (name) DO NOTHING;

-- When a content approval (content_topic / blog_post / social_post) is rejected,
-- mark its source content_calendar row 'rejected' so the topic is not retried
-- automatically (US-503 AC4; also covers US-502 content_topic).
CREATE OR REPLACE FUNCTION public.agent_content_approval_rejected()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_calendar_id uuid;
BEGIN
  IF NEW.status = 'rejected'
     AND OLD.status IS DISTINCT FROM 'rejected'
     AND NEW.action_type IN ('content_topic', 'blog_post', 'social_post')
     AND (NEW.payload->>'calendar_id') IS NOT NULL THEN
    BEGIN
      v_calendar_id := (NEW.payload->>'calendar_id')::uuid;
      UPDATE public.content_calendar
        SET status = 'rejected'
        WHERE id = v_calendar_id AND status <> 'published';
    EXCEPTION WHEN OTHERS THEN
      NULL; -- bad uuid / missing row: ignore, non-fatal
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_content_approval_rejected ON public.agent_approvals;
CREATE TRIGGER trg_agent_content_approval_rejected
  AFTER UPDATE ON public.agent_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.agent_content_approval_rejected();
