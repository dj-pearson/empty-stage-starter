-- US-231: Per-meal feedback rating + optional note.
--
-- Captures the "how much did they enjoy it?" follow-up that fires after
-- the parent has tapped a result button (ate/tasted/refused). Used by the
-- iOS dashboard's "Most loved meals" card and the AI meal-planner prompt
-- to prefer historically-loved meals over historically-refused ones.

CREATE TABLE IF NOT EXISTS public.plan_entry_feedback (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_entry_id UUID         NOT NULL REFERENCES public.plan_entries(id) ON DELETE CASCADE,
    user_id       UUID         NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
    -- 1-5 emoji scale on the iOS sheet; 0 reserved for "no rating, just a note"
    rating        SMALLINT     NOT NULL CHECK (rating BETWEEN 0 AND 5),
    -- Optional free-text from the parent. NULL means rating-only feedback.
    note          TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS plan_entry_feedback_user_id_idx
    ON public.plan_entry_feedback (user_id);

CREATE INDEX IF NOT EXISTS plan_entry_feedback_plan_entry_id_idx
    ON public.plan_entry_feedback (plan_entry_id);

-- RLS: scope strictly to the row owner. Mirrors the policies used on
-- plan_entries / foods so the realtime + select queries the iOS client
-- already issues stay friendly to the same auth.uid() check.
ALTER TABLE public.plan_entry_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own feedback"
    ON public.plan_entry_feedback
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users insert own feedback"
    ON public.plan_entry_feedback
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own feedback"
    ON public.plan_entry_feedback
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users delete own feedback"
    ON public.plan_entry_feedback
    FOR DELETE
    USING (auth.uid() = user_id);

COMMENT ON TABLE public.plan_entry_feedback IS
    'US-231: Optional per-meal 1-5 emoji rating + note captured after the parent logs a result. Powers the iOS Dashboard "Most loved meals" card and AIMealService prompt enrichment.';
