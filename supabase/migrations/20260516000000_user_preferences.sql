-- US-298: per-user preferences key/value store.
--
-- Additive only (new table + RLS) — safe per CLAUDE.md migration rules.
-- The "Variety nudges" toggle (nudge_variety) is the first consumer; the
-- client is currently the source of truth (localStorage) and best-effort
-- syncs here so the preference can follow the user across devices later.
-- Generic key/value shape avoids a schema migration per future toggle.

CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT 'null'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user
  ON public.user_preferences(user_id);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own preferences"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own preferences"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own preferences"
  ON public.user_preferences FOR DELETE
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_preferences IS
  'US-298: generic per-user key/value preference store (e.g. nudge_variety).';
