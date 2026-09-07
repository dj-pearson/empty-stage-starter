-- US-796 precondition: fail loudly, by name, if this database is missing a
-- column this file depends on, rather than applying cleanly and leaving
-- match_foods_to_catalog (below) to fail later with a raw "column does not
-- exist" four stack frames down inside a plpgsql body -- which is what
-- happens otherwise: CREATE FUNCTION never resolves the column references
-- in its body, so a database missing a prerequisite migration accepts this
-- file with no error and only breaks the first time anyone actually calls
-- the function (typically the backfill script, well after the fact, far
-- from whichever migration was actually skipped).
DO $precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'foods' AND column_name = 'canonical_id'
  ) THEN
    RAISE EXCEPTION
      'public.foods.canonical_id is missing. Apply 20260906000000_canonical_food_catalog.sql (US-793) first: this matcher writes that column and cannot work without it.'
      USING ERRCODE = 'undefined_column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'grocery_product_catalog' AND column_name = 'name_normalized'
  ) THEN
    RAISE EXCEPTION
      'public.grocery_product_catalog.name_normalized is missing. Apply 20260505000000_smart_product_catalog.sql first: this matcher joins on that column and cannot work without it.'
      USING ERRCODE = 'undefined_column';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'grocery_product_catalog' AND column_name = 'barcode'
  ) THEN
    RAISE EXCEPTION
      'public.grocery_product_catalog.barcode is missing. Apply 20260505000000_smart_product_catalog.sql first: this matcher joins on that column and cannot work without it.'
      USING ERRCODE = 'undefined_column';
  END IF;
END $precondition$;

-- US-796: normalize_product_name -- the shared normalization key that lets
-- a household's own foods be matched against the shared product catalog.
--
-- This MUST reproduce ProductNameNormalizer.normalize in
-- ios/EatPal/EatPal/Models/SmartProduct.swift exactly:
--
--   enum ProductNameNormalizer {
--       static func normalize(_ raw: String) -> String {
--           let lower = raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
--           let parts = lower.split(whereSeparator: { $0.isWhitespace })
--           return parts.joined(separator: " ")
--       }
--   }
--
-- i.e. lowercase, trim, collapse any run of whitespace (including tabs and
-- newlines) to a single space -- and nothing else. In particular it does
-- NOT strip punctuation. The shipped app upserts the catalog
-- ON CONFLICT (name_normalized), so any divergence between this function
-- and the Swift one means the matcher silently matches nothing: a parent's
-- own food would never resolve to an existing catalog row and a duplicate
-- gets created instead.
--
-- This has already gone wrong once. The seed migration that populated
-- grocery_product_catalog originally used a more aggressive normalizer
-- (one that also stripped punctuation), and 90.7% of the ~2,337 seeded
-- rows ended up with a name_normalized value the shipped app could never
-- produce -- e.g. "Hummus, commercial" normalized to a key without the
-- comma, so the app's own upsert would never find it. That seed was fixed
-- to use this same btrim/regexp_replace shape before this migration
-- landed; see supabase/tests/us796_catalog_matcher.test.sql assertion 7,
-- which re-derives the equivalence against the live table rather than
-- trusting this comment.
CREATE OR REPLACE FUNCTION public.normalize_product_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(lower(p_name), '\s+', ' ', 'g'));
$$;

COMMENT ON FUNCTION public.normalize_product_name(text) IS
  'US-796: reproduces ProductNameNormalizer.normalize in ios/EatPal/EatPal/Models/SmartProduct.swift (lowercase, trim, collapse whitespace runs). Punctuation is intentionally preserved -- do not add punctuation stripping here without changing the Swift side first, or the catalog matcher silently stops matching.';

-- Deliberately no REVOKE/GRANT here, unlike match_foods_to_catalog below.
-- This is a pure IMMUTABLE SQL string transform with no table access and
-- no side effect -- there is no foods scan, no catalog join, nothing an
-- anonymous caller could use as a compute-exhaustion vector the way
-- match_foods_to_catalog's default anon grant (see that function's REVOKE
-- comment) could. Revoking EXECUTE here would cost real things later: any
-- future client-side or edge-function caller that wants to preview a
-- normalized name before submitting it would need re-granting, for a
-- function that does nothing worth restricting in the first place. Left at
-- whatever this platform's default ACL already grants (anon,
-- authenticated, service_role -- see pg_default_acl).
--
-- No expression index on public.normalize_product_name(name) here. An
-- earlier draft added one (a partial index WHERE canonical_id IS NULL, on
-- the theory the matcher's name join would want it), but two things rule
-- it out: EXPLAIN on the matcher's actual UPDATE shows the planner drives
-- from grocery_product_catalog into foods via grocery_product_catalog's
-- own name_normalized unique index and never touches this one, so it earns
-- nothing; and building it would run inside this migration's single
-- transaction, which -- see the backfill note below -- is exactly the kind
-- of lock a live App Store client must never wait behind. It also makes
-- every canonical_id write non-HOT and every plain foods write evaluate a
-- non-inlinable function for no benefit. If a future profiling pass finds
-- a real case for it, add it CONCURRENTLY, outside a migration transaction.
--
-- US-796 Task 2: match_foods_to_catalog -- links a household's own foods
-- rows to the shared catalog by exact identity, and only by exact identity.
--
-- WHY TIMID. foods.is_safe is a flag a parent sets deliberately, and the
-- safe-food ladder reads it through whatever canonical_id a food carries. A
-- wrong link here binds a child's is_safe to the wrong canonical food, so a
-- parent can be shown a food as safe that their child actually reacts to.
-- Every rule below exists to make a false-positive link structurally
-- impossible rather than merely unlikely:
--
--   1. Only rows where canonical_id IS NULL are ever touched. An existing
--      link is never re-pointed, even if a "better" match later appears --
--      see assertion 16 in the test file.
--   2. Barcode match requires no category agreement. A barcode is the
--      product's identity; two rows sharing one are the same product by
--      definition. But BOTH sides of that comparison must be a real,
--      non-blank barcode: an empty string (or a string that is only
--      whitespace) is not an identity, it is the absence of one, and
--      grocery_product_catalog's barcode column has no CHECK stopping one
--      from being inserted (nor should it -- older rows and other paths may
--      legitimately carry ''). Without this, a single catalog row planted
--      with barcode = '' -- which any authenticated user can INSERT, and
--      the partial unique index on barcode permits exactly one of --
--      matches *every* empty-barcode food in *every* household on the next
--      run, regardless of category: exactly the cross-category mislink
--      rule 3 exists to prevent, walked straight around it. Empty barcodes
--      are not hypothetical here -- src/lib/itemMergeProposals.ts
--      defensively nulls '' and whitespace-only barcodes for this exact
--      reason. See assertions 22-24.
--   3. Name match additionally requires f.category = c.default_category.
--      A name alone is not an identity -- "cheddar" as a dairy and
--      "cheddar" as a snack are different foods, and crossing that line is
--      the exact mislink this story exists to avoid. See assertion 12.
--
-- NO LIMIT 1, AND NO TIE-BREAK. grocery_product_catalog_barcode_uq is a
-- partial UNIQUE index on barcode WHERE barcode IS NOT NULL, and
-- grocery_product_catalog_name_uq is a UNIQUE index on name_normalized (see
-- 20260505000000_smart_product_catalog.sql). At most one catalog row can
-- ever satisfy either join condition, so the safety here comes from those
-- two indexes, not from anything in this function. A LIMIT 1 would suggest
-- there's an ambiguity being resolved, and there isn't one to resolve --
-- worse, it would silently paper over a future violation of that invariant
-- (e.g. one of those indexes dropped by mistake). Postgres does NOT raise
-- "more than one row returned" for an UPDATE ... FROM that joins to more
-- than one source row -- it silently picks one of the matches arbitrarily
-- and proceeds. So if either unique index is ever dropped, this function's
-- behavior doesn't change from "safe" to "loudly broken"; it changes from
-- "safe" to "links to a random one of the duplicates, with no error, no
-- log, nothing" -- which is the real reason those two indexes matter and
-- why this function has no test coverage of its own for that case (there
-- is nothing to assert against once it's silent).
--
-- SECURITY INVOKER, NOT DEFINER. RLS applies to whoever calls this, exactly
-- as it would for a hand-written UPDATE against foods and
-- grocery_product_catalog. A DEFINER function here would let any
-- authenticated user relink every other household's foods. EXECUTE is
-- revoked from PUBLIC and anon and granted only to authenticated and
-- service_role below, both so anon can never drive a scan of foods joined
-- against the whole catalog over RPC and so the RLS scoping this paragraph
-- claims is actually exercised by a real non-superuser caller rather than
-- only by the migration/operator role, which bypasses RLS and so proves
-- nothing about it. See assertions 20-21 (two households, an authenticated
-- caller who is a member of only one of them) and assertion 26 (anon
-- genuinely cannot execute, not just "the REVOKE statement is present").
--
-- anon is named EXPLICITLY in the REVOKE, not just PUBLIC -- see the
-- comment on the REVOKE/GRANT below for why that's load-bearing rather
-- than redundant.
--
-- One more side effect worth naming rather than hiding: the pre-existing
-- update_foods_updated_at trigger fires on every UPDATE this function
-- issues, so a matched row's updated_at also changes -- the one column
-- besides canonical_id this function does touch, and the one user-visible
-- effect assertion 17's row-diff cannot see because it deliberately strips
-- updated_at before comparing. That's correct for a table with a generic
-- updated-at trigger (this function has no way to suppress it, and
-- shouldn't try to), just documented so the next reader isn't left
-- wondering whether it was considered.
CREATE OR REPLACE FUNCTION public.match_foods_to_catalog(p_household_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_barcode_matched INTEGER;
  v_name_matched INTEGER;
BEGIN
  -- Barcode: identity match, no category requirement -- but only a real
  -- barcode counts as an identity. btrim(...) <> '' on BOTH sides excludes
  -- NULL (already excluded by IS NOT NULL), '', and whitespace-only values
  -- from ever satisfying the join, on either side of it. See the "WHY
  -- TIMID" comment above (rule 2) for why this is load-bearing rather than
  -- decorative.
  UPDATE public.foods f
     SET canonical_id = c.id
    FROM public.grocery_product_catalog c
   WHERE f.canonical_id IS NULL
     AND f.barcode IS NOT NULL
     AND btrim(f.barcode) <> ''
     AND c.barcode IS NOT NULL
     AND btrim(c.barcode) <> ''
     AND f.barcode = c.barcode
     AND (p_household_id IS NULL OR f.household_id = p_household_id);
  GET DIAGNOSTICS v_barcode_matched = ROW_COUNT;

  -- Name: normalized name AND category must both agree. Runs after the
  -- barcode pass and re-checks canonical_id IS NULL, so a row the barcode
  -- pass already linked is excluded here even if its name would also match.
  UPDATE public.foods f
     SET canonical_id = c.id
    FROM public.grocery_product_catalog c
   WHERE f.canonical_id IS NULL
     AND public.normalize_product_name(f.name) = c.name_normalized
     AND f.category = c.default_category
     AND (p_household_id IS NULL OR f.household_id = p_household_id);
  GET DIAGNOSTICS v_name_matched = ROW_COUNT;

  RETURN v_barcode_matched + v_name_matched;
END;
$$;

COMMENT ON FUNCTION public.match_foods_to_catalog(uuid) IS
  'US-796: links household foods rows (canonical_id IS NULL) to grocery_product_catalog by exact non-blank barcode, or by normalized name AND matching category. SECURITY INVOKER so RLS scopes every call to the caller''s own household -- EXECUTE is granted only to authenticated and service_role, not PUBLIC or anon. Returns the number of rows linked. p_household_id NULL means every household the caller''s RLS allows. Also bumps updated_at on every matched row via the pre-existing update_foods_updated_at trigger. Not called by this migration -- run the operator script at supabase/diagnostics/us-796-backfill-match-foods.sql to backfill, in committed per-household batches rather than inside one migration transaction.';

-- anon is named explicitly, not just PUBLIC. On this platform, CREATE
-- FUNCTION in the public schema grants EXECUTE to anon, authenticated, and
-- service_role DIRECTLY at creation time, via a schema-level default ACL
-- (pg_default_acl) Supabase sets up outside any migration in this repo --
-- see `SELECT defaclacl FROM pg_default_acl WHERE defaclobjtype = 'f' AND
-- defaclnamespace = 'public'::regnamespace`. That grant does not come from
-- PUBLIC, so `REVOKE ALL ... FROM PUBLIC` alone does not touch it --
-- has_function_privilege('anon', ...) stays true after it runs. This was
-- caught only by testing the actual privilege (assertion 26), not by
-- reading the REVOKE statement -- a REVOKE that compiles proves nothing
-- about what it revoked. Naming anon here closes the real grant, not a
-- hypothetical one. Measured exposure before this fix: an unauthenticated
-- caller could execute this function repeatedly over PostgREST RPC and
-- always got back 0 (RLS on foods requires household_id =
-- get_user_household_id(auth.uid()), which auth.uid() IS NULL never
-- satisfies) -- a compute-exhaustion vector, not a data leak or privilege
-- escalation, but worth closing outright rather than accepting. If a
-- future edit "simplifies" this back to `FROM PUBLIC`, it silently reopens
-- exactly this.
--
-- service_role is granted EXECUTE (in addition to authenticated) so a
-- trusted backend caller -- an edge function, the operator script's own
-- session if it ever ran as service_role instead of the migration role --
-- isn't left needing superuser bypass for something this ordinary.
REVOKE ALL ON FUNCTION public.match_foods_to_catalog(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_foods_to_catalog(uuid) TO authenticated, service_role;

-- No backfill call here. Deliberately -- see
-- supabase/diagnostics/us-796-backfill-match-foods.sql. Supabase applies a
-- migration file as one transaction, so a backfill call (or several,
-- batched, inside this same file) would hold row locks on every matched
-- foods row, and the write lock the barcode/name UPDATEs need on
-- grocery_product_catalog's indexes, from wherever it started through
-- COMMIT at the very end of the whole migration -- blocking a live App
-- Store client's writes to foods for the entire span. The functions above
-- are the deliverable; when and how existing rows get backfilled is an
-- operator decision made outside migration transactions, in commits small
-- enough that a live write never waits behind more than one household.
