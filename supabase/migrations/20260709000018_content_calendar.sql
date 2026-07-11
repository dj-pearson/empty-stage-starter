-- Agentic OS — US-502: content calendar.
CREATE TABLE IF NOT EXISTS public.content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('blog', 'social')),
  keywords TEXT[] NOT NULL DEFAULT '{}',
  rationale TEXT,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'generated', 'published', 'rejected')),
  scheduled_for DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_calendar_status ON public.content_calendar(status);
CREATE INDEX IF NOT EXISTS idx_content_calendar_type ON public.content_calendar(content_type);

COMMENT ON TABLE public.content_calendar IS
  'Agent-proposed blog/social content topics, approved before any generation spend (US-502).';

ALTER TABLE public.content_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage content calendar"
  ON public.content_calendar FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin')
  );

-- Seed the content-calendar agent with a seed keyword list in autonomy_policy.
INSERT INTO public.agent_definitions (name, domain, description, system_prompt, model, schedule_cron, autonomy_policy, daily_cost_cap_usd, enabled)
VALUES (
  'content-calendar',
  'marketing',
  'Weekly: proposes 3 blog + 5 social content topics from seed keywords and the published inventory.',
  'You plan on-brand content for EatPal (evidence-based meal planning for ARFID and extreme picky eating). Propose specific, non-duplicative topics that help parents. Each topic: a concrete title, content_type, 2-5 keywords, and a one-line rationale. JSON only.',
  'claude-haiku-4-5-20251001',
  '0 14 * * 1',
  '{"content_keywords": ["ARFID", "picky eating", "food chaining", "safe foods", "sensory food aversion", "mealtime anxiety", "toddler nutrition", "feeding therapy", "try bites", "meal planning"]}'::jsonb,
  5,
  FALSE
)
ON CONFLICT (name) DO NOTHING;
