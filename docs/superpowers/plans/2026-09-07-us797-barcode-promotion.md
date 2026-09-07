# Barcode Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A product a parent scans becomes a catalog row, so the next family to scan it finds it already there — recorded as `unverified`, with its provenance, and never at the cost of failing the add.

**Architecture:** The promotion decision is a pure function in `supabase/functions/_shared/`, unit-tested without a network. `lookup-barcode` calls it best-effort after a successful external lookup, and gains a catalog-by-barcode read step so a previously promoted row is found before any API is called.

**Tech Stack:** Deno edge functions, Postgres, psql SQL tests, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-shared-food-catalog-design.md`

**Story:** US-797 in `prd.json`.

## Scope

This plan covers acceptance criteria **1, 2, 4 and 6** — promotion, provenance and parent linking, graceful degradation, and the CHECK-rejection test.

It deliberately does **not** cover ACs 3 and 5: marking unverified rows in the UI, and the ODbL attribution line for Open Food Facts data. Both are display concerns that read `EffectiveFood.isVerified` from `src/lib/effectiveFood.ts`, which is in PR #267 and not yet in `main`. Building them against an unmerged branch is what caused US-795's commits to land on a dead branch earlier today. They follow once #267 merges.

## Global Constraints

- **A lookup failure must never fail the add.** Rate limits, timeouts and bad payloads all degrade to "not found"; the household's food row is created unlinked and works exactly as it does today.
- Promoted rows are `kind = 'branded'`, `verification = 'unverified'`, with `source` and `source_ref` recorded.
- Only an admin can set `verification = 'verified'` — `gpc_guard_verification()` enforces it and a promotion must never try.
- `name_normalized` must be produced the same way the shipped iOS client produces it: lowercase, trim, collapse whitespace, **punctuation preserved**. The catalog's UNIQUE index is on that column and iOS upserts on it.
- Nutrition is per 100 g. Anything outside the CHECK bounds (calories 0-900, each macro 0-100) is a unit error or a bad scrape; drop the value rather than store it, and let the constraint be the backstop.
- Additive only. A live App Store build reads and writes this table.
- ASCII only in migrations and SQL tests. No `any`.

---

### Task 1: The promotion decision, as a pure function

**Files:**
- Create: `supabase/functions/_shared/catalogPromotion.ts`
- Test: `supabase/functions/_shared/catalogPromotion.test.ts`

**Interfaces:**
- Produces: `export function toCatalogRow(input: BarcodeLookupResult, barcode: string): CatalogInsert | null`, and `export function normalizeProductName(raw: string): string`.
- Returns `null` when the input cannot make a sound row — no name, or no usable nutrition — rather than inventing values.

- [ ] **Step 1: Write the failing test**

Cover, at minimum:

1. A well-formed Open Food Facts result becomes a row with `kind: 'branded'`, `verification: 'unverified'`, `source: 'openfoodfacts'`, `source_ref` = the barcode, and the barcode set.
2. `normalizeProductName` matches the iOS algorithm: `'  Kraft   Mac & Cheese '` becomes `'kraft mac & cheese'`. **Punctuation and the ampersand survive.** Read `ios/EatPal/EatPal/Models/SmartProduct.swift` and assert against a transliteration of it, kept separate from the implementation so this tests behaviour rather than shared source.
3. A payload whose calories are per-serving or in kilojoules — say 2100 — does NOT become `calories_kcal_100: 2100`. The value is dropped and the row is still produced with the macros it does have. Assert the field is null or absent, and say in a comment that the CHECK constraint is the second line of defence, not the first.
4. A macro above 100 g per 100 g is dropped the same way.
5. A result with no name returns `null`.
6. `source_ref` records which provider answered: `usda` and `foodrepo` results carry their own source value, not `openfoodfacts`.
7. Nothing in the output sets `verification` to anything but `'unverified'` — a test that would fail if someone later "helpfully" promoted a trusted source straight to verified.

- [ ] **Step 2: Run it and watch it fail**

Run: `deno test supabase/functions/_shared/catalogPromotion.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Note for the nutrition mapping: `lookup-barcode/index.ts:118` currently reads `nutriments.energy_value || nutriments['energy-kcal_100g']`. That precedence is wrong for our purposes — `energy_value` carries whatever unit the product declared, frequently kJ, while `energy-kcal_100g` is what we actually want. Prefer the per-100g kcal field and fall back only to values you can confirm are kcal per 100 g.

- [ ] **Step 4: Run the test until it passes**

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/catalogPromotion.ts supabase/functions/_shared/catalogPromotion.test.ts
git commit -m "feat(catalog): decide a branded catalog row from a barcode lookup (US-797)"
```

---

### Task 2: Wire it into the lookup, and into CI

**Files:**
- Modify: `supabase/functions/lookup-barcode/index.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `src/lib/ciGatesWired.test.ts`

- [ ] **Step 1: Add the CI step and its guard test first**

`ci.yml` runs each Deno test by explicit filename — `deno test functions/_shared/helpers_test.ts` and four others. There is no glob, so Task 1's test does not run in CI until a step is added. Add one, next to the existing Deno steps, and add an assertion to `src/lib/ciGatesWired.test.ts` that the step exists. Read that file first and match how it asserts the other gates.

This ordering is deliberate: a test that exists but never runs is the defect this repo has already filed as US-792.

- [ ] **Step 2: Add a catalog-by-barcode read step**

Before the external APIs, look the barcode up in `grocery_product_catalog`. A row promoted by an earlier scan — by any family — should be found without calling a third party. Put it after the pantry check and before or alongside the legacy `nutrition` table check.

- [ ] **Step 3: Promote after a successful external lookup**

Upsert `ON CONFLICT (barcode) DO NOTHING`, so a concurrent scan of the same product cannot fail either caller. Wrap the whole promotion in its own try/catch: **a failed promotion is logged and swallowed**, because the caller is a parent adding a food and the catalog is best-effort. Never let it change the response the client receives.

Link `parent_food_id` to a generic row where `normalizeProductName(name)` matches an existing `kind = 'generic'` catalog row exactly. No match means no parent, which is fine.

- [ ] **Step 4: Verify the degradation path by hand**

Point the function at a barcode that no provider knows, and one that makes a provider return a malformed payload, and confirm both return the same "not found" shape they return today. Paste both.

- [ ] **Step 5: Commit**

---

### Task 3: The constraint is the backstop, and a test says so

**Files:**
- Create: `supabase/tests/us797_barcode_promotion.test.sql`

- [ ] **Step 1: Write the failing test**

Match the style of `supabase/tests/us796_catalog_matcher.test.sql` exactly — every assertion a `DO` block that `RAISE EXCEPTION`s on mismatch and `RAISE NOTICE`s on success, file wrapped in `BEGIN;` / `ROLLBACK;`.

1. An INSERT with `calories_kcal_100 = 2100` is rejected by `gpc_nutrition_sane`, not stored. Catch `check_violation` specifically, and assert on the constraint name so a different constraint firing does not satisfy the test.
2. Same for a macro above 100.
3. A promoted row shaped the way Task 1 produces one INSERTs successfully as a non-admin authenticated user, and lands `verification = 'unverified'`.
4. A non-admin promotion that tries to set `verification = 'verified'` is rejected by `gpc_guard_verification` — assert on the message text, not only the SQLSTATE, since RLS raises the same code.
5. `ON CONFLICT (barcode) DO NOTHING` makes a second promotion of the same barcode a no-op rather than an error, and does not disturb the existing row.

- [ ] **Step 2: Run it and watch it fail, then pass**

Get the connection string from `npx supabase status -o env`. Never write a literal connection string into a file — a CI check fails the build on that shape.

- [ ] **Step 3: Prove it can fail**

Change assertion 1's bound to a value inside the range, confirm the run goes green for the wrong reason, then restore. Paste both.

- [ ] **Step 4: Commit**
