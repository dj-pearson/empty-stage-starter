# US-323 — Deploy pending migrations to production

**Why:** Several migrations exist in `supabase/migrations/` but were never applied to the production DB (`api.tryeatpal.com`), so features 4xx in prod:

| Symptom (prod console)                                   | Missing object                          | Migration file |
| -------------------------------------------------------- | --------------------------------------- | -------------- |
| `recipes?select=*,recipe_ingredients(...)` → **400**     | `recipe_ingredients` table/relationship | `20260430000001_create_recipe_ingredients.sql` (+ `20260531000000_reconcile_recipe_ingredients_schema.sql`) |
| `variety_fatigue_snapshots` upserts → **404**            | `variety_fatigue_snapshots` table       | `20260515000000_variety_fatigue.sql` |
| `rpc/check_rate_limit` → **404**                         | `check_rate_limit` RPC                   | `20260223000000_rate_limiting.sql`, `20251010230000_rate_limiting_system.sql` |
| grocery→pantry add rejected by `foods` category CHECK    | tightened CHECK constraint              | `20260530000000_relax_foods_category_check.sql` |

> This is a **deploy gap, not a code bug** — the schema matches the client (`RECIPE_WITH_INGREDIENTS_SELECT`). It must be run against prod with credentials/network not available in the dev sandbox.

## Pre-flight

1. Confirm what prod already has, so you only apply what's missing:
   ```bash
   supabase migration list --linked          # compare against supabase/migrations/
   ```
2. Take a backup / snapshot of the prod DB first (Coolify volume snapshot or `pg_dump`).
3. Verify the migrations are additive (they are — new tables/RPC/relaxed CHECK; no DROP/RENAME), per CLAUDE.md migration rules. Safe for older shipped iOS builds.

## Deploy

**Supabase CLI path:**
```bash
supabase link --project-ref <PROD_REF>     # if not already linked
supabase db push                            # applies all un-applied migrations in order
```

**Coolify / self-hosted Postgres path** (apply in filename order, only the un-applied ones):
```bash
psql "$PROD_DATABASE_URL" -f supabase/migrations/20251010230000_rate_limiting_system.sql
psql "$PROD_DATABASE_URL" -f supabase/migrations/20260223000000_rate_limiting.sql
psql "$PROD_DATABASE_URL" -f supabase/migrations/20260430000001_create_recipe_ingredients.sql
psql "$PROD_DATABASE_URL" -f supabase/migrations/20260515000000_variety_fatigue.sql
psql "$PROD_DATABASE_URL" -f supabase/migrations/20260530000000_relax_foods_category_check.sql
psql "$PROD_DATABASE_URL" -f supabase/migrations/20260531000000_reconcile_recipe_ingredients_schema.sql
```

## Reload PostgREST schema cache (REQUIRED after the table lands)

The `recipe_ingredients` embed won't resolve until PostgREST re-reads the schema:
```sql
NOTIFY pgrst, 'reload schema';
```
(Or restart the PostgREST container.)

## Verify on prod

```sql
-- table + relationship present
select count(*) from public.recipe_ingredients;
-- variety table present
select count(*) from public.variety_fatigue_snapshots;
-- RPC present
select public.check_rate_limit('test', 1, 60);  -- adjust args to the real signature
```
Then in the app:
- Recipes load **with** ingredients (no 400 on the embed).
- Variety-fatigue banner stops 404-ing.
- Auth rate-limit checks resolve.
- A grocery→pantry add with a US category succeeds.

## Related deploys riding the same window
- New edge functions **US-310/311/312** and security fix **US-315** ship on the **same functions deploy** — coordinate them together.

## Already shipped (code side, this branch)
- **Resilience fallback (US-323 optional AC):** `selectRecipesWithFallback` in `src/contexts/RecipesContext.tsx` now degrades to a plain `select` if the `recipe_ingredients` embed 400s, so the recipes list still renders (without structured ingredients) even before this deploy lands. Covered by `src/contexts/RecipesContext.fallback.test.ts`. This mitigates the user-visible breakage but is **not** a substitute for the deploy — structured ingredients only return once the migration + `NOTIFY pgrst` are applied.

---
_This story stays `passes:false` until the deploy is run and verified against `api.tryeatpal.com`._
