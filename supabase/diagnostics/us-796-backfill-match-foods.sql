-- US-796: backfill public.match_foods_to_catalog() in committed batches.
--
-- Why this isn't in the migration: supabase db push / db reset applies a
-- migration file as ONE transaction. A single call (or several batched
-- calls, still inside that same file) to match_foods_to_catalog() holds
-- its row locks on every matched foods row -- and its lock on the
-- grocery_product_catalog indexes it reads -- from wherever it starts
-- through the migration's own COMMIT at the very end. A live App Store
-- client writing to foods blocks for the whole span. This script instead
-- runs one committed statement PER HOUSEHOLD, via psql's \gexec: each
-- generated statement is its own top-level command with no enclosing
-- BEGIN, so it commits (and releases its locks) before the next one
-- starts. A live write only ever waits behind one household's worth of
-- locking, never the whole table's.
--
-- Run manually, against the target database, NOT via supabase db push or
-- db reset -- this file lives in supabase/diagnostics specifically because
-- that directory is never picked up by the migration CLI:
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/diagnostics/us-796-backfill-match-foods.sql
--
-- Safe to re-run. match_foods_to_catalog() only ever touches rows where
-- canonical_id IS NULL, so a repeat pass is a fast no-op wherever an
-- earlier pass (or a client mutation in between) already linked a row or
-- correctly left it unmatched.
--
-- Run as a role that bypasses RLS (the migration/operator role, or any
-- role with auth.uid() IS NULL in this session) so one pass actually
-- covers every household -- the function itself is SECURITY INVOKER, so
-- an ordinary authenticated connection would only backfill its own
-- household. That's the correct behavior for the function; this script
-- just isn't that caller.

\timing on
\echo 'US-796 backfill: one committed statement per household.'

-- \gexec sends each string from the preceding query straight to the server
-- as its own top-level command (not reparsed by psql's meta-command
-- parser), so the generated text below is plain SQL -- no \gset/\echo
-- embedded in it. Each one prints its own (household_id, linked) result
-- row as it runs, which is the audit trail: household by household, in
-- the order this ran.
SELECT format(
  'SELECT %L::uuid AS household_id, public.match_foods_to_catalog(%L::uuid) AS linked;',
  h.id, h.id
)
FROM public.households h
ORDER BY h.id
\gexec

-- Rows with no household_id (legacy/orphaned data predating the household
-- model) are never touched by the per-household calls above, because the
-- function's household filter is `f.household_id = p_household_id`, which
-- never matches NULL. One trailing NULL-scoped call sweeps whatever is
-- left -- by this point that's just the household_id IS NULL rows (plus
-- anything genuinely new since the loop started), so it stays cheap: the
-- partial index on canonical_id IS NULL keeps the scan to unlinked rows
-- only, and there are normally few or none of these.
\echo '-- trailing pass: household_id IS NULL rows'
SELECT public.match_foods_to_catalog(NULL) AS orphaned_rows_linked;

\echo '-- remaining unlinked, for a quick sanity read (not an error either way)'
SELECT count(*) AS still_unmatched FROM public.foods WHERE canonical_id IS NULL;
