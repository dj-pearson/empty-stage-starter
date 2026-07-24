-- Marketing consent must be opt-in, not defaulted on
-- (GDPR Art. 4(11)/7; PECR; CAN-SPAM). Compliance audit 2026-07.
--
-- Previously `quiz_responses.accepts_marketing` defaulted to TRUE, which grants
-- marketing consent by default — pre-checked consent is not valid consent.
--
-- Backward-compatible (additive per CLAUDE.md migration rules): this only
-- changes the column DEFAULT. Existing rows are untouched, and older iOS clients
-- that omit the column now get FALSE (safe), while clients that send an explicit
-- value keep working. No drop/rename/type-change/constraint-tightening.
ALTER TABLE public.quiz_responses
  ALTER COLUMN accepts_marketing SET DEFAULT false;

-- NOTE: historical rows created under the old TRUE default are intentionally
-- left unchanged here. Whether to treat those as valid consent (or backfill them
-- to FALSE / re-solicit opt-in) is a policy decision for the marketing/legal
-- owners and should be handled in a follow-up once decided.
