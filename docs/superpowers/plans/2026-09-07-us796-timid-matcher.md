# Timid Catalog Matcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link a household's existing foods to the shared catalog by exact name or barcode, writing `canonical_id` and nothing else, so families get consistent aisles and nutrition without anything changing under them.

**Architecture:** Two Postgres functions and a one-shot backfill. `normalize_product_name` reproduces the shipped iOS normalizer exactly; `match_foods_to_catalog` sets `canonical_id` where it is NULL and exactly one catalog row matches. Delivered as a migration because backend changes reach the live iOS app without a rebuild.

**Tech Stack:** Postgres 15 (Supabase), psql SQL tests.

**Spec:** `docs/superpowers/specs/2026-09-06-shared-food-catalog-design.md`

**Story:** US-796 in `prd.json`.

## Global Constraints

- **The matcher is the dangerous part of this design.** A wrong link is not cosmetic: if a child's `is_safe` "chicken" binds to the wrong canonical food, the safe-food ladder inherits the mistake and a parent may be shown a food as safe that is not. When in doubt, do not match.
- Exact match only. Never fuzzy, never a substring, never a trigram. The `pg_trgm` index on the catalog exists for search, not for this.
- The matcher writes `canonical_id` and NOTHING else. Not `name`, not `category`, not `is_safe`, not `quantity`.
- Additive only. A live App Store build reads and writes both tables.
- `grocery_product_catalog.name_normalized` holds what the shipped iOS `ProductNameNormalizer.normalize` produces: lowercase, trim, collapse internal whitespace runs, **punctuation preserved** (`ios/EatPal/EatPal/Models/SmartProduct.swift`). It is UNIQUE and iOS upserts on it.
- Verified against the live data before this plan was written: `btrim(regexp_replace(lower(name), '\s+', ' ', 'g'))` reproduces `name_normalized` for all 2,337 seeded rows with zero mismatches. Use that expression.
- Never `supabase db push` against production.
- ASCII only in migrations and tests.

---

### Task 1: `normalize_product_name`, and proof it matches the shipped client

**Files:**
- Create: `supabase/migrations/20260908000000_match_foods_to_catalog.sql`
- Create: `supabase/tests/us796_catalog_matcher.test.sql`

**Interfaces:**
- Produces, for Task 2: `public.normalize_product_name(p_name text) RETURNS text`, `IMMUTABLE`, `STRICT`, `SET search_path = public`.

- [ ] **Step 1: Write the failing test**

`supabase/tests/us796_catalog_matcher.test.sql`. Read `supabase/tests/us794_usda_seed.test.sql` FIRST and match its style exactly: every assertion is a `DO` block that `RAISE EXCEPTION`s on mismatch and `RAISE NOTICE`s on success. A bare `SELECT` that builds a label string is NOT an assertion — psql prints it and exits 0. Begin the file with `BEGIN;` and end it with `ROLLBACK;`.

Assertions for this task:

1. The function exists and is `IMMUTABLE` (read `pg_proc.provolatile`; `i` means immutable). An expression index depends on this.
2. Lowercases and trims: `normalize_product_name('  Hummus, Commercial  ')` is `'hummus, commercial'`.
3. Collapses internal whitespace runs: `normalize_product_name('Hummus,   commercial')` is `'hummus, commercial'`.
4. Collapses tabs and newlines too, not just spaces.
5. **PRESERVES punctuation**: `normalize_product_name('Cheese, cheddar')` is `'cheese, cheddar'` — with the comma. This is the assertion that pins the whole story to the shipped client; a normalizer that strips punctuation matches nothing.
6. Preserves apostrophes and accented characters: `'Mother''s loaf'` keeps its apostrophe.
7. **The equivalence check against real data.** Over every row in `grocery_product_catalog` with `source = 'usda'`, `normalize_product_name(name)` equals the stored `name_normalized`. Assert zero mismatches and assert the row count is at least 1500, so the test cannot pass by matching over an empty table.

- [ ] **Step 2: Run it and watch it fail**

Get the connection string from `npx supabase status -o env` — do NOT write a literal connection string into any file; `scripts/ci/check-committed-secrets.sh` fails the build on that shape.

Run: `psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/us796_catalog_matcher.test.sql`
Expected: FAIL on assertion 1, function does not exist.

- [ ] **Step 3: Write the function**

```sql
CREATE OR REPLACE FUNCTION public.normalize_product_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(lower(p_name), '\s+', ' ', 'g'));
$$;
```

Comment it with WHY it is shaped this way: it must reproduce `ProductNameNormalizer.normalize` in `ios/EatPal/EatPal/Models/SmartProduct.swift`, because the shipped app upserts the catalog `ON CONFLICT (name_normalized)` and any divergence means the matcher silently matches nothing. Note that an earlier version of the seed used a more aggressive normalizer and 90.7% of rows carried a key the app would never produce.

Then add the expression index the matcher needs:

```sql
CREATE INDEX IF NOT EXISTS foods_name_normalized_expr_idx
  ON public.foods (public.normalize_product_name(name))
  WHERE canonical_id IS NULL;
```

Partial on `canonical_id IS NULL` because the matcher only ever looks at unlinked rows.

- [ ] **Step 4: Run the test until it passes**

```bash
npx supabase db reset
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/us796_catalog_matcher.test.sql
```
Expected: PASS, 7 assertions.

- [ ] **Step 5: Prove the test can fail**

Change assertion 5's expectation to `'cheese cheddar'` (no comma), re-run, confirm psql exits non-zero, revert, confirm green. Paste both.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260908000000_match_foods_to_catalog.sql supabase/tests/us796_catalog_matcher.test.sql
git commit -m "feat(catalog): normalize_product_name, matching the shipped iOS normalizer (US-796)"
```

---

### Task 2: `match_foods_to_catalog`, and the fixtures that must NOT match

**Files:**
- Modify: `supabase/migrations/20260908000000_match_foods_to_catalog.sql` (append)
- Modify: `supabase/tests/us796_catalog_matcher.test.sql` (append before the final `ROLLBACK;`)

**Interfaces:**
- Consumes: `public.normalize_product_name` from Task 1.
- Produces: `public.match_foods_to_catalog(p_household_id uuid DEFAULT NULL) RETURNS integer` — returns the number of rows linked.

- [ ] **Step 1: Write the failing test**

Append assertions. Every one creates its own fixtures inside the transaction; the file already ends in `ROLLBACK;` so nothing persists.

**Must match:**

8. Exact normalized name AND same category links: a food named `'Cheese, cheddar'`, category `dairy`, against the seeded catalog row, gets `canonical_id` set.
9. Case and whitespace differences still link: `'  CHEESE,   CHEDDAR  '` links to the same row.
10. Exact barcode links even when the names differ entirely. A barcode is a product identity.
11. The function returns the count of rows it linked, and running it a second time returns 0 (nothing left unlinked to do).

**Must NOT match — this is the half that matters:**

12. Same name, DIFFERENT category: a food named `'Cheese, cheddar'` with category `snack` is left NULL. Never across categories.
13. `'chicken'` does NOT link to a catalog `'chicken nuggets'`. No substring, no prefix.
14. `'chicken nuggets'` does NOT link to a catalog `'chicken'` either — assert both directions.
15. A barcode differing by ONE digit does not link.
16. A food that already has a `canonical_id` is not re-pointed at a different row, even if a better match exists.

**Must not damage:**

17. Only `canonical_id` changes. Capture a food's full row before and after and assert `name`, `category`, `is_safe`, `is_try_bite`, `quantity`, `unit` and `barcode` are all identical. Compare the whole row minus `canonical_id` and `updated_at`, so a column added later is covered without editing this test.
18. Reversible: setting `canonical_id` back to NULL leaves the row exactly as it was before matching ran, including `is_safe`.
19. An unmatched food keeps `canonical_id` NULL and is still selectable — a shipped client reading it sees nothing new.

- [ ] **Step 2: Run and watch it fail**

Expected: FAIL on assertion 8, function does not exist.

- [ ] **Step 3: Write the matcher**

`SECURITY INVOKER`, not DEFINER. RLS then applies to whoever calls it, and the backfill below runs as the migration role, which bypasses RLS legitimately. A DEFINER function here would let any authenticated user relink every household's foods.

Rules, in this order:
1. Only rows where `canonical_id IS NULL`.
2. Barcode match: `f.barcode IS NOT NULL AND f.barcode = c.barcode`. No category requirement — a barcode is the product's identity.
3. Otherwise name match: `public.normalize_product_name(f.name) = c.name_normalized AND f.category = c.default_category`.
4. `p_household_id` NULL means every household; non-NULL narrows to one.

Both `name_normalized` and `barcode` carry UNIQUE indexes on the catalog, so at most one row can match either way — ambiguity is structurally impossible rather than resolved by a tie-break. Say that in a comment, and do not add a `LIMIT 1` that would hide a future violation.

- [ ] **Step 4: Add the backfill**

At the end of the migration, call `public.match_foods_to_catalog()` once for every household, and `RAISE NOTICE` the count so the migration output says what it did.

- [ ] **Step 5: Run the tests until they pass**

```bash
npx supabase db reset
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/us796_catalog_matcher.test.sql
```
Expected: PASS, all 19 assertions.

- [ ] **Step 6: Prove the dangerous assertions can fail**

Temporarily drop the `f.category = c.default_category` condition from the name match, re-run, and confirm assertion 12 fails. Revert, confirm green. Paste both. That condition is the one standing between a household's "chicken" and the wrong canonical food, and a test that has never been seen to fail is not a test.

- [ ] **Step 7: Confirm the shipped iOS write path still works**

Replay the catalog upsert as a non-admin authenticated role and confirm it still succeeds and does not disturb `verification`:

```sql
INSERT INTO public.grocery_product_catalog
  (id, name, name_normalized, default_aisle_section, default_category, default_unit,
   default_quantity, times_added, last_added_at)
VALUES (gen_random_uuid(), 'Cheese, cheddar', 'cheese, cheddar', 'dairy', 'dairy',
        'block', 1, 1, now())
ON CONFLICT (name_normalized) DO UPDATE SET times_added = EXCLUDED.times_added;
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260908000000_match_foods_to_catalog.sql supabase/tests/us796_catalog_matcher.test.sql
git commit -m "feat(catalog): timid matcher links household foods by exact name or barcode (US-796)"
```
