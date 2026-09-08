# Effective Food Resolver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One place decides whether a food's name, category and aisle come from the shared catalog or from the household's own row, so the grocery list, planner, recipes and pantry cannot drift apart.

**Architecture:** A pure `resolveFood(food, catalog)` in `src/lib/effectiveFood.ts`, plus the catalog rows a household's foods point at, loaded once in `FoodsContext` and exposed as a lookup. Consumers read the resolved value instead of the raw column. A repo-scan test keeps new direct reads out.

**Tech Stack:** React 19, TypeScript, Supabase, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-06-shared-food-catalog-design.md`

**Story:** US-795 in `prd.json`.

## Global Constraints

- Household-specific state is NEVER read from the catalog: `is_safe`, `is_try_bite`, `quantity`, `unit`, `expiry_date`, `servings_per_container`, `package_quantity`. A wrong `is_safe` is a child eating something unsafe.
- `foods.canonical_id` is nullable and unmatched is a valid steady state. An unlinked food must behave exactly as it does today.
- `grocery_product_catalog.default_aisle_section` holds **iOS `GroceryAisle` rawValues** (lowercase snake_case: `produce`, `meat_deli`, `frozen_meals`, `rice_grains`, ...). `SmartProductService.swift:478` parses it with `GroceryAisle(rawValue:)`. The web has its own display strings and reads the column nowhere today. Mapping rawValue to display text belongs in this resolver and nowhere else.
- The catalog's `default_category` is the app's `FoodCategory` union.
- No `any`. Use `Database['public']['Tables'][...]['Row']` where a row type is needed.
- Never modify `src/components/ui/`.
- Scope of "every reader" is the four surfaces the story names: grocery, planner, recipes, pantry. A display-only `food.name` in an unrelated component is not a uniformity risk and is out of scope.

---

### Task 1: The pure resolver

**Files:**
- Create: `src/lib/effectiveFood.ts`
- Test: `src/lib/effectiveFood.test.ts`

**Interfaces:**
- Produces, for Tasks 2 and 3:
  - `export interface CatalogEntry { id: string; name: string; default_category: string | null; default_aisle_section: string | null; verification: string; }`
  - `export interface EffectiveFood { id: string; name: string; category: FoodCategory; aisle: string | undefined; aisleRaw: string | null; isCanonical: boolean; isVerified: boolean; }`
  - `export function resolveFood(food: Food, catalog?: CatalogEntry | null): EffectiveFood`
  - `export function aisleDisplayName(rawValue: string | null | undefined): string | undefined`

Why the catalog name may override the household's: US-796's matcher links only on an EXACT normalized-name or barcode match, so a linked pair already agrees on the name. Taking the catalog's spelling is a casing and punctuation normalisation, not a rename. Put that reasoning in a comment — it is the question a reviewer will ask.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { resolveFood, aisleDisplayName, type CatalogEntry } from './effectiveFood';
import type { Food } from '@/types';

const householdFood: Food = {
  id: 'f1',
  name: 'cheddar cheese',
  category: 'dairy',
  is_safe: true,
  is_try_bite: false,
  aisle: 'Whatever the parent typed',
  quantity: 2,
  unit: 'block',
};

const catalog: CatalogEntry = {
  id: 'c1',
  name: 'Cheese, cheddar',
  default_category: 'dairy',
  default_aisle_section: 'dairy',
  verification: 'verified',
};

describe('resolveFood', () => {
  it('uses the household row when there is no catalog match', () => {
    const r = resolveFood(householdFood, null);
    expect(r.name).toBe('cheddar cheese');
    expect(r.aisle).toBe('Whatever the parent typed');
    expect(r.isCanonical).toBe(false);
  });

  it('prefers catalog values when linked', () => {
    const r = resolveFood(householdFood, catalog);
    expect(r.name).toBe('Cheese, cheddar');
    expect(r.aisle).toBe('Dairy');
    expect(r.aisleRaw).toBe('dairy');
    expect(r.isCanonical).toBe(true);
  });

  it('NEVER takes household state from the catalog', () => {
    // The catalog has no is_safe and must never appear to. A wrong is_safe is
    // a child eating something they react to.
    const r = resolveFood(householdFood, catalog) as unknown as Record<string, unknown>;
    expect(r.is_safe).toBeUndefined();
    expect(r.quantity).toBeUndefined();
    expect(r.is_try_bite).toBeUndefined();
  });

  it('falls back to the household value when a catalog field is null', () => {
    const sparse: CatalogEntry = { ...catalog, default_aisle_section: null, default_category: null };
    const r = resolveFood(householdFood, sparse);
    expect(r.aisle).toBe('Whatever the parent typed');
    expect(r.category).toBe('dairy');
  });

  it('reports verification so unverified rows can be marked', () => {
    expect(resolveFood(householdFood, { ...catalog, verification: 'unverified' }).isVerified).toBe(false);
    expect(resolveFood(householdFood, catalog).isVerified).toBe(true);
  });

  it('ignores a catalog category that is not a FoodCategory', () => {
    // Nothing constrains default_category in the database, so a bad value
    // must not become the food's category.
    const r = resolveFood(householdFood, { ...catalog, default_category: 'Protein' });
    expect(r.category).toBe('dairy');
  });
});

describe('aisleDisplayName', () => {
  it('maps every iOS rawValue to human text', () => {
    expect(aisleDisplayName('meat_deli')).toBe('Meat & Deli');
    expect(aisleDisplayName('rice_grains')).toBe('Rice & Grains');
    expect(aisleDisplayName('frozen_veg')).toBe('Frozen Vegetables');
  });

  it('returns undefined for an unknown or absent rawValue rather than echoing it', () => {
    expect(aisleDisplayName(null)).toBeUndefined();
    expect(aisleDisplayName(undefined)).toBeUndefined();
    expect(aisleDisplayName('Produce')).toBeUndefined(); // a web display string is NOT a rawValue
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/effectiveFood.test.ts`
Expected: FAIL, cannot resolve `./effectiveFood`.

- [ ] **Step 3: Write the resolver**

Read `ios/EatPal/EatPal/Models/GroceryAisle.swift` for the rawValue-to-displayName pairs and copy them exactly; do not invent wording. Validate `default_category` against the `FoodCategory` union before using it.

- [ ] **Step 4: Run the test until it passes**

Run: `npx vitest run src/lib/effectiveFood.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/effectiveFood.ts src/lib/effectiveFood.test.ts
git commit -m "feat(catalog): one resolver for the effective food (US-795)"
```

---

### Task 2: Load the catalog rows a household's foods point at

**Files:**
- Modify: `src/types/index.ts` (add `canonical_id?: string | null` to `Food`)
- Modify: `src/contexts/FoodsContext.tsx`
- Test: `src/contexts/FoodsContext.catalog.test.tsx`

**Interfaces:**
- Consumes: `CatalogEntry` from Task 1.
- Produces: `catalogById: Record<string, CatalogEntry>` on the foods context value, and `useEffectiveFood(food): EffectiveFood`.

- [ ] **Step 1: Write the failing test**

Assert, with a mocked Supabase client:
1. When no food has a `canonical_id`, no catalog query is issued at all.
2. When two foods share one `canonical_id`, exactly one query is issued and it asks for that single id (deduped).
3. A failed catalog fetch leaves `catalogById` empty and does NOT clear or disturb `foods` — an unlinked-looking food still renders.
4. `parseFoodRow` carries `canonical_id` through.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/contexts/FoodsContext.catalog.test.tsx`

- [ ] **Step 3: Implement**

Fetch with `.in('id', ids)` over the deduped non-null `canonical_id` values, after foods load. Follow the existing load and realtime patterns in the file rather than inventing a new one.

- [ ] **Step 4: Run the test until it passes**

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/contexts/FoodsContext.tsx src/contexts/FoodsContext.catalog.test.tsx
git commit -m "feat(catalog): load the catalog rows a household's foods link to (US-795)"
```

---

### Task 3: Route the four surfaces through the resolver, and keep them there

**Files:**
- Modify: `src/pages/Pantry.tsx`, `src/pages/Recipes.tsx`, `src/lib/mealPlanner.ts`, `src/components/AddFoodDialog.tsx`, and any other read of `food.aisle` / `food.category` / `food.name` on the grocery, planner, recipes or pantry paths.
- Test: `src/lib/effectiveFoodUsage.test.ts`

- [ ] **Step 1: Write the failing repo-scan test**

A test that greps the tracked source for direct reads of `.aisle` on a food-shaped value outside `src/lib/effectiveFood.ts` and fails listing them. Model it on the existing repo-scan tests in `src/lib/` — read one first and match its shape. Allow an explicit, commented exception list so the test names what is deliberately exempt rather than being silently weakened.

**AddFoodDialog is an exception and must stay one.** It edits the household row, so it has to read and write the household's own `name`, `category` and `aisle`, never the catalog's. Put it in the exception list with that reason. Resolving there would silently overwrite a parent's own values with the catalog's on save.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/effectiveFoodUsage.test.ts`
Expected: FAIL, listing the current direct readers.

- [ ] **Step 3: Rewire the consumers**

- [ ] **Step 4: Run the whole affected suite**

Run: `npx vitest run src/lib/effectiveFood.test.ts src/lib/effectiveFoodUsage.test.ts src/contexts/FoodsContext.catalog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(catalog): read the effective food on grocery, planner, recipes and pantry (US-795)"
```
