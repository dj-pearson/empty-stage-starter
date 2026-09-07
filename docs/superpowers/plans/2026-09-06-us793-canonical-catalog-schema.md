# US-793 Canonical Food Catalog Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the columns, constraints and indexes that let
`public.grocery_product_catalog` describe both a generic food and a branded
product, and link household `foods` rows to it, without changing anything the
shipped iOS app reads.

**Architecture:** One additive migration on an existing table. `kind` plus a
self-referencing `parent_food_id` carry the generic/branded split; nutrition is
stored per 100 g/ml; `verification` carries trust and is guarded by a trigger
rather than by taking write access away from clients that need it. A nullable
`foods.canonical_id` links household rows, so an unmatched row behaves exactly as
it does today.

**Tech Stack:** Postgres 16 (self-hosted Supabase), SQL migrations under
`supabase/migrations/`, SQL tests under `supabase/tests/`, generated TypeScript
types in `src/integrations/supabase/types.ts`.

**Spec:** `docs/superpowers/specs/2026-09-06-shared-food-catalog-design.md`

## Global Constraints

- **Additive only.** No column on `grocery_product_catalog` or `foods` may be
  renamed, dropped or retyped. A shipped iOS build reads both.
- **Do not touch `grocery_product_catalog_name_uq`.** It is UNIQUE on
  `name_normalized` alone and iOS relies on `INSERT ... ON CONFLICT
  (name_normalized)`. A composite index breaks that upsert.
- **Do not tighten the RLS write policies.** Any authenticated user may INSERT
  and UPDATE the catalog; that is how the iOS "first user to add creates the row"
  flow works. Trust lives in the `verification` column.
- Admin checks use the existing helper: `public.has_role(auth.uid(), 'admin')`.
- Migration filenames are `YYYYMMDDHHMMSS_snake_case.sql`. This plan uses
  `20260906000000_canonical_food_catalog.sql`.
- Nutrition is per 100 g/ml. Calories are bounded 0-900 (pure fat is the physical
  maximum); each macro is bounded 0-100.
- Never run `supabase db push` against production. CI applies migrations to a
  fresh local instance; production is a separate operator step.

---

### Task 1: Catalog columns, constraints and search index

**Files:**
- Create: `supabase/migrations/20260906000000_canonical_food_catalog.sql`
- Create: `supabase/tests/us793_canonical_catalog.test.sql`

**Interfaces:**
- Consumes: existing `public.grocery_product_catalog` (id, name,
  name_normalized, barcode, default_aisle_section, default_category,
  default_unit, brand, package_size, times_added, created_at, updated_at).
- Produces: columns `kind`, `parent_food_id`, `calories_kcal_100`,
  `protein_g_100`, `carbs_g_100`, `fat_g_100`, `fiber_g_100`, `sugar_g_100`,
  `sodium_mg_100`, `serving_size_g`, `allergens`, `source`, `source_ref`,
  `verification`, `verified_at`, `verified_by` on that table. Task 2 adds the
  trigger that guards `verification`; Task 3 references
  `grocery_product_catalog(id)` from `foods.canonical_id`.

- [ ] **Step 1: Write the failing test**

Create `supabase/tests/us793_canonical_catalog.test.sql`:

```sql
-- US-793: the catalog can describe a generic food and a branded product.
-- Run: psql -f supabase/tests/us793_canonical_catalog.test.sql
\set ON_ERROR_STOP on
BEGIN;

-- 1. The columns exist.
SELECT 'EXPECTED 17, GOT ' || count(*)::text AS columns_added
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'grocery_product_catalog'
  AND column_name IN (
    'kind','parent_food_id','calories_kcal_100','protein_g_100','carbs_g_100',
    'fat_g_100','fiber_g_100','sugar_g_100','sodium_mg_100','serving_size_g',
    'allergens','source','source_ref','verification','verified_at','verified_by',
    'name_normalized'
  );

-- 2. A generic row inserts and defaults to unverified.
INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, source, calories_kcal_100)
VALUES ('Cheddar Cheese', 'cheddar cheese', 'generic', 'usda', 416);
SELECT 'EXPECTED unverified, GOT ' || verification AS default_verification
FROM public.grocery_product_catalog WHERE name_normalized = 'cheddar cheese';

-- 3. A branded row may point at a generic parent.
INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, source, parent_food_id)
SELECT 'Cathedral City Mature 350g', 'cathedral city mature 350g', 'branded', 'openfoodfacts', id
FROM public.grocery_product_catalog WHERE name_normalized = 'cheddar cheese';
SELECT 'EXPECTED 1, GOT ' || count(*)::text AS branded_with_parent
FROM public.grocery_product_catalog WHERE kind = 'branded' AND parent_food_id IS NOT NULL;

-- 4. A generic row may NOT have a parent.
DO $$
BEGIN
  INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, parent_food_id)
  VALUES ('Bad Generic', 'bad generic', 'generic',
          (SELECT id FROM public.grocery_product_catalog WHERE name_normalized = 'cheddar cheese'));
  RAISE EXCEPTION 'EXPECTED reject, GOT insert accepted for generic with parent';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'EXPECTED reject, GOT check_violation -- ok';
END $$;

-- 5. Impossible calories are rejected. 900 kcal/100g is pure fat.
DO $$
BEGIN
  INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, calories_kcal_100)
  VALUES ('Impossible', 'impossible', 'generic', 4000);
  RAISE EXCEPTION 'EXPECTED reject, GOT insert accepted at 4000 kcal/100g';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'EXPECTED reject, GOT check_violation -- ok';
END $$;

-- 6. BACKWARD COMPATIBILITY: the shape the shipped iOS app selects still works.
SELECT 'EXPECTED ok, GOT ' || count(*)::text AS ios_shape_still_selectable
FROM (
  SELECT id, name, name_normalized, barcode, default_aisle_section,
         default_category, default_unit, brand, package_size, times_added
  FROM public.grocery_product_catalog
) AS ios_shape;

-- 7. The name_normalized unique index is UNCHANGED (iOS upserts on it).
SELECT 'EXPECTED 1, GOT ' || count(*)::text AS name_uq_intact
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'grocery_product_catalog_name_uq'
  AND indexdef LIKE '%UNIQUE%(name_normalized)%';

ROLLBACK;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `supabase start && psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/us793_canonical_catalog.test.sql`
Expected: FAIL at step 1 with `columns_added` reporting `EXPECTED 17, GOT 1`
(only `name_normalized` exists).

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260906000000_canonical_food_catalog.sql`:

```sql
-- US-793: make grocery_product_catalog the canonical food catalog.
--
-- WHY THIS TABLE AND NOT `nutrition`. `nutrition` looks like the live catalog
-- (12 web files, 18 edge functions, 25 migrations) but the shipped iOS app does
-- not read it -- its only hit in the Swift tree is a lowered.contains("nutrition")
-- string test at AICoachService.swift:188. iOS reads THIS table, through
-- SmartProductService, by barcode and by name_normalized. See
-- docs/superpowers/specs/2026-09-06-shared-food-catalog-design.md.
--
-- ADDITIVE ONLY. Every statement below adds; nothing is renamed, dropped or
-- retyped, because a shipped build reads this table and CLAUDE.md forbids it.

ALTER TABLE public.grocery_product_catalog
  -- generic ("cheddar cheese") vs branded ("Cathedral City Mature 350g").
  -- Default 'generic' so existing rows get a valid value without a backfill.
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS parent_food_id UUID
    REFERENCES public.grocery_product_catalog(id) ON DELETE SET NULL,
  -- Nutrition PER 100 G/ML. Not per serving: `nutrition` stores per-serving
  -- against a free-text serving_size, which is exactly why those numbers
  -- cannot be summed. USDA and Open Food Facts both publish per-100.
  ADD COLUMN IF NOT EXISTS calories_kcal_100 NUMERIC,
  ADD COLUMN IF NOT EXISTS protein_g_100 NUMERIC,
  ADD COLUMN IF NOT EXISTS carbs_g_100 NUMERIC,
  ADD COLUMN IF NOT EXISTS fat_g_100 NUMERIC,
  ADD COLUMN IF NOT EXISTS fiber_g_100 NUMERIC,
  ADD COLUMN IF NOT EXISTS sugar_g_100 NUMERIC,
  ADD COLUMN IF NOT EXISTS sodium_mg_100 NUMERIC,
  ADD COLUMN IF NOT EXISTS serving_size_g NUMERIC,
  ADD COLUMN IF NOT EXISTS allergens TEXT[],
  -- Provenance. source_ref is the FDC id or barcode, so a row can be
  -- re-checked against where it came from.
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_ref TEXT,
  ADD COLUMN IF NOT EXISTS verification TEXT NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Constraints as separate statements so a re-run is idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gpc_kind_check') THEN
    ALTER TABLE public.grocery_product_catalog
      ADD CONSTRAINT gpc_kind_check CHECK (kind IN ('generic','branded'));
  END IF;

  -- Only a branded row may have a generic parent.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gpc_parent_only_branded') THEN
    ALTER TABLE public.grocery_product_catalog
      ADD CONSTRAINT gpc_parent_only_branded
      CHECK (parent_food_id IS NULL OR kind = 'branded');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gpc_source_check') THEN
    ALTER TABLE public.grocery_product_catalog
      ADD CONSTRAINT gpc_source_check
      CHECK (source IS NULL OR source IN ('usda','openfoodfacts','foodrepo','user','admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gpc_verification_check') THEN
    ALTER TABLE public.grocery_product_catalog
      ADD CONSTRAINT gpc_verification_check
      CHECK (verification IN ('verified','unverified','rejected'));
  END IF;

  -- 900 kcal/100 g is pure fat and therefore the physical maximum. Anything
  -- above it is a unit error or a bad scrape, not a food.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gpc_nutrition_sane') THEN
    ALTER TABLE public.grocery_product_catalog
      ADD CONSTRAINT gpc_nutrition_sane CHECK (
        (calories_kcal_100 IS NULL OR calories_kcal_100 BETWEEN 0 AND 900)
        AND (protein_g_100 IS NULL OR protein_g_100 BETWEEN 0 AND 100)
        AND (carbs_g_100   IS NULL OR carbs_g_100   BETWEEN 0 AND 100)
        AND (fat_g_100     IS NULL OR fat_g_100     BETWEEN 0 AND 100)
        AND (fiber_g_100   IS NULL OR fiber_g_100   BETWEEN 0 AND 100)
        AND (sugar_g_100   IS NULL OR sugar_g_100   BETWEEN 0 AND 100)
        AND (sodium_mg_100 IS NULL OR sodium_mg_100 BETWEEN 0 AND 100000)
      );
  END IF;
END $$;

-- Search by type and search by brand both need this. pg_trgm may already be on.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS grocery_product_catalog_name_trgm
  ON public.grocery_product_catalog USING GIN (name_normalized gin_trgm_ops);

CREATE INDEX IF NOT EXISTS grocery_product_catalog_parent_idx
  ON public.grocery_product_catalog(parent_food_id) WHERE parent_food_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS grocery_product_catalog_verification_idx
  ON public.grocery_product_catalog(verification) WHERE verification <> 'verified';

COMMENT ON COLUMN public.grocery_product_catalog.calories_kcal_100 IS
  'Per 100 g or ml, never per serving. See serving_size_g for display.';
COMMENT ON COLUMN public.grocery_product_catalog.verification IS
  'Trust boundary. Anyone may create unverified; only an admin may set verified (see the guard trigger). Unverified rows are usable for shopping but excluded from ladder and nutrition totals.';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `supabase db push --local && psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/us793_canonical_catalog.test.sql`
Expected: PASS. `columns_added` reports 17, both rejection blocks report
`check_violation -- ok`, `ios_shape_still_selectable` and `name_uq_intact`
report 1.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260906000000_canonical_food_catalog.sql supabase/tests/us793_canonical_catalog.test.sql
git commit -m "feat(catalog): generic/branded split and per-100 nutrition on the catalog (US-793)"
```

---

### Task 2: Only an admin can mark a row verified

**Files:**
- Modify: `supabase/migrations/20260906000000_canonical_food_catalog.sql` (append)
- Modify: `supabase/tests/us793_canonical_catalog.test.sql` (append before ROLLBACK)

**Interfaces:**
- Consumes: `verification` column from Task 1; existing
  `public.has_role(auth.uid(), 'admin')`.
- Produces: trigger `gpc_guard_verification` on
  `public.grocery_product_catalog`.

- [ ] **Step 1: Write the failing test**

Append to `supabase/tests/us793_canonical_catalog.test.sql`, immediately before
the final `ROLLBACK;`:

```sql
-- 8. A non-admin cannot set verification='verified'.
--    RLS is deliberately NOT tightened -- iOS creates catalog rows -- so the
--    trust boundary is this column, not write access.
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  UPDATE public.grocery_product_catalog
     SET verification = 'verified'
   WHERE name_normalized = 'cheddar cheese';
  RAISE EXCEPTION 'EXPECTED reject, GOT a non-admin promoted a row to verified';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'EXPECTED reject, GOT insufficient_privilege -- ok';
END $$;
RESET ROLE;

-- 9. A non-admin may still INSERT, because the iOS flow depends on it.
SET LOCAL ROLE authenticated;
INSERT INTO public.grocery_product_catalog (name, name_normalized, kind, source)
VALUES ('User Typed Thing', 'user typed thing', 'generic', 'user');
RESET ROLE;
SELECT 'EXPECTED unverified, GOT ' || verification AS non_admin_insert_lands_unverified
FROM public.grocery_product_catalog WHERE name_normalized = 'user typed thing';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/us793_canonical_catalog.test.sql`
Expected: FAIL at step 8 with `EXPECTED reject, GOT a non-admin promoted a row to
verified` — with no trigger, the UPDATE succeeds.

- [ ] **Step 3: Write the trigger**

Append to `supabase/migrations/20260906000000_canonical_food_catalog.sql`:

```sql
-- The trust boundary is this column, NOT the RLS write policies.
--
-- The catalog's policies let any authenticated user INSERT and UPDATE, because
-- the shipped iOS app creates catalog rows on first add. Tightening them to
-- admin-only is exactly the policy change CLAUDE.md warns breaks older clients.
-- So writes stay open and promotion to 'verified' is guarded here instead.
CREATE OR REPLACE FUNCTION public.gpc_guard_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.verification = 'verified'
     AND (TG_OP = 'INSERT' OR OLD.verification IS DISTINCT FROM 'verified')
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'only an admin may mark a catalog row verified'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.verification = 'verified' AND NEW.verified_at IS NULL THEN
    NEW.verified_at := now();
    NEW.verified_by := auth.uid();
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS gpc_guard_verification ON public.grocery_product_catalog;
CREATE TRIGGER gpc_guard_verification
  BEFORE INSERT OR UPDATE OF verification ON public.grocery_product_catalog
  FOR EACH ROW EXECUTE FUNCTION public.gpc_guard_verification();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `supabase db reset && psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/us793_canonical_catalog.test.sql`
Expected: PASS. Step 8 reports `insufficient_privilege -- ok`, step 9 reports
`unverified`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260906000000_canonical_food_catalog.sql supabase/tests/us793_canonical_catalog.test.sql
git commit -m "feat(catalog): only an admin can mark a row verified (US-793)"
```

---

### Task 3: Link household foods to the catalog

**Files:**
- Modify: `supabase/migrations/20260906000000_canonical_food_catalog.sql` (append)
- Modify: `supabase/tests/us793_canonical_catalog.test.sql` (append before ROLLBACK)

**Interfaces:**
- Consumes: `public.grocery_product_catalog(id)`.
- Produces: `public.foods.canonical_id UUID NULL` referencing it, and index
  `foods_canonical_id_idx`. US-795's resolver and US-796's matcher both read
  this column.

- [ ] **Step 1: Write the failing test**

Append before the final `ROLLBACK;`:

```sql
-- 10. foods.canonical_id exists, is NULLABLE, and points at the catalog.
--     Nullable is load-bearing: an unmatched household row must keep working
--     exactly as it does today.
SELECT 'EXPECTED YES, GOT ' || is_nullable AS canonical_id_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'foods' AND column_name = 'canonical_id';

SELECT 'EXPECTED 1, GOT ' || count(*)::text AS canonical_id_fk
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'foods' AND tc.constraint_type = 'FOREIGN KEY'
  AND ccu.table_name = 'grocery_product_catalog';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/us793_canonical_catalog.test.sql`
Expected: FAIL — `canonical_id_nullable` returns no row, because the column does
not exist.

- [ ] **Step 3: Add the column**

Append to the migration:

```sql
-- US-793: the household row references the catalog.
--
-- NULLABLE ON PURPOSE. An unmatched row behaves exactly as it does today, which
-- is what lets US-796's matcher fill this in gradually instead of requiring a
-- big-bang rename of every household's food on day one. ON DELETE SET NULL for
-- the same reason: losing a catalog row must never take a household's food with
-- it.
ALTER TABLE public.foods
  ADD COLUMN IF NOT EXISTS canonical_id UUID
    REFERENCES public.grocery_product_catalog(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS foods_canonical_id_idx
  ON public.foods(canonical_id) WHERE canonical_id IS NOT NULL;

COMMENT ON COLUMN public.foods.canonical_id IS
  'Optional link to the shared catalog (US-793). NULL means unmatched, which is a valid steady state. Household-specific fields (is_safe, is_try_bite, quantity, expiry_date) are never read from the catalog.';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `supabase db reset && psql "$(supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/us793_canonical_catalog.test.sql`
Expected: PASS. `canonical_id_nullable` reports `YES`, `canonical_id_fk` reports 1.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260906000000_canonical_food_catalog.sql supabase/tests/us793_canonical_catalog.test.sql
git commit -m "feat(catalog): nullable foods.canonical_id linking households to the catalog (US-793)"
```

---

### Task 4: Run the SQL tests in CI and regenerate types

**Files:**
- Modify: `.github/workflows/ci.yml` (the `migration-test` job, after "Apply migrations")
- Modify: `src/integrations/supabase/types.ts` (regenerated, not hand-edited)
- Modify: `src/lib/ciGatesWired.test.ts`

**Interfaces:**
- Consumes: the migration from Tasks 1-3.
- Produces: a CI step that executes every `supabase/tests/*.test.sql`, and a
  `types.ts` containing the new columns.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/ciGatesWired.test.ts`:

```typescript
describe('the migration job runs the SQL tests', () => {
  const ci = readFileSync(path.join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');

  // supabase/tests/ has held .test.sql files for months with nothing executing
  // them -- US-780's own notes record its 11 cases as never run, blocked on
  // "no Postgres in the container". US-760 fixed `supabase start`, so the
  // Migration Test job can now afford to run them.
  it('executes every supabase/tests/*.test.sql', () => {
    expect(ci).toContain('supabase/tests/*.test.sql');
  });

  it('runs them after migrations are applied', () => {
    expect(ci.indexOf('Apply migrations')).toBeLessThan(ci.indexOf('supabase/tests/*.test.sql'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ciGatesWired.test.ts`
Expected: FAIL — `expect(ci).toContain('supabase/tests/*.test.sql')` because no
workflow references that path.

- [ ] **Step 3: Add the CI step and regenerate types**

In `.github/workflows/ci.yml`, in the `migration-test` job, directly after the
`Apply migrations` step and before `Stop local Supabase`:

```yaml
      # US-793: supabase/tests/*.test.sql existed for months with nothing
      # running them (US-780's notes record its 11 cases as never executed,
      # blocked on "no Postgres in the container"). US-760 fixed
      # `supabase start`, so they can run here now. \set ON_ERROR_STOP makes
      # each file fail the step rather than print and continue.
      - name: Run SQL tests
        run: |
          DB_URL="$(supabase status -o env | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
          shopt -s nullglob
          for f in supabase/tests/*.test.sql; do
            echo "--- $f"
            psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f"
          done
```

Then regenerate types from the migrated schema (never hand-edit):

```bash
supabase gen types typescript --local > src/integrations/supabase/types.ts
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ciGatesWired.test.ts`
Expected: PASS, both cases.

Then confirm the regenerated types carry the new columns:

Run: `grep -c "calories_kcal_100\|canonical_id" src/integrations/supabase/types.ts`
Expected: at least 2.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml src/integrations/supabase/types.ts src/lib/ciGatesWired.test.ts
git commit -m "ci(migrations): run the SQL tests, and regenerate types for the catalog (US-793)"
```

---

## Verification

The branch is done when, on a CI run:

- `Migration Test` is green, having applied all 231 migrations to a fresh
  instance and executed `supabase/tests/*.test.sql`.
- `Types Drift & Edge Functions` is green. That step is blocking as of US-761,
  so a stale `types.ts` fails the build on its own.
- `Lint & Typecheck` is at or below the committed baselines (814 typecheck,
  1156 lint).
- No iOS change is needed, and none is made.
