# Shared food catalog

**Status:** design agreed 2026-09-06, not yet implemented.
**Goal:** one canonical food dataset so recipes, planner and grocery describe the
same food the same way.

## The problem, as found

Every household has its own private rows in `foods` (`user_id`, `household_id`)
with free-text `name`, `aisle` and `category`, and no nutrition columns at all.
Three households with "cheerios", "Cheerios" and "cheerios (family size)" hold
three unrelated rows. That is why the three features disagree.

Four catalog-shaped tables already exist, and the important part is which are
live:

| Table | Read by |
| --- | --- |
| `grocery_product_catalog` | **the shipped iOS app** (`SmartProductService`, by `barcode` and by `name_normalized`), one web file |
| `nutrition` | 12 web files, 18 edge functions, 25 migrations. **Not iOS** |
| `canonical_products` | nothing |
| `item_aliases` | nothing |

`nutrition` looked like the live one until the iOS check: its only hit in the
Swift tree is `AICoachService.swift:188`, a `lowered.contains("nutrition")`
string test, not a query. `grocery_product_catalog` is genuinely read by a
shipped build.

So there are two live catalogs, one per client, doing the same job. Neither is
seeded by any migration.

## Decisions

1. **Both generic and branded foods**, because people search both ways: by type
   ("cheese") and by brand or barcode.
2. **Coverage over purity, with provenance.** Unverified rows are usable for
   shopping, visibly marked, and excluded from the ladder and from nutrition
   totals until confirmed.
3. **Household rows reference the catalog.** `foods.canonical_id` is nullable;
   an unmatched row behaves exactly as it does today.
4. **Seed small and complete, then grow from real usage.**
5. **Growth is barcode-automatic plus frequency-with-review.** Barcodes promote
   themselves; generic foods need at least **3 separate households** plus a human.
   Three is a starting value, held in one constant so it can be raised without a
   migration once there is enough traffic to know what it should be.

## Architecture

`grocery_product_catalog` becomes the canonical table. Three reasons in order of
weight: a shipped iOS build reads it and CLAUDE.md forbids breaking that; it
already carries `name_normalized`, `barcode`, `brand`, `default_aisle_section`,
`default_category`, `default_unit` and `package_size`; and every column this
design adds is additive, which is the one migration shape CLAUDE.md calls always
safe.

`nutrition` stays. Eighteen edge functions read it, so it is backfilled into the
catalog, new writes go to the catalog, and it retires across two releases via the
deprecation flow in CLAUDE.md. `canonical_products` and `item_aliases` are read
by neither client and can be dropped.

### Generic and branded in one table

A row is `kind = 'generic'` ("cheddar cheese") or `kind = 'branded'` ("Cathedral
City Mature 350g"). A branded row carries `parent_food_id` pointing at its
generic. Search by type hits generics; a barcode hits a branded row and resolves
up to the parent for anything the ladder or food chaining needs.

### Columns added to `grocery_product_catalog`

Classification: `kind` (check `generic|branded`), `parent_food_id` (self FK,
null for generics).

Nutrition, **per 100 g/ml**: `calories_kcal_100`, `protein_g_100`, `carbs_g_100`,
`fat_g_100`, `fiber_g_100`, `sugar_g_100`, `sodium_mg_100`, plus
`serving_size_g` for display and `allergens text[]`.

Per-100 is a deliberate change from `nutrition`, which stores per-serving against
a free-text `serving_size`. That text field is exactly why those numbers cannot
currently be summed. Both USDA and Open Food Facts publish per-100, and it is the
only basis on which two products compare or a recipe adds up.

Provenance: `source` (`usda|openfoodfacts|foodrepo|user|admin`), `source_ref`
(FDC id or barcode, so a row can be re-checked against its origin),
`verification` (`verified|unverified|rejected`), `verified_at`, `verified_by`.

Search: a GIN trigram index on `name_normalized`.

**Two corrections found while planning US-793, both of which would have broken
the shipped iOS app:**

1. The spec first said "unique index on `(name_normalized, kind)`". It cannot.
   `grocery_product_catalog_name_uq` is already UNIQUE on `name_normalized`
   alone, and iOS relies on `INSERT ... ON CONFLICT (name_normalized)` to bump
   `times_added` instead of duplicating. Changing it to a composite breaks that
   upsert. The existing index stays; one normalized name means one catalog row,
   whatever its kind.
2. The spec first said the catalog is "admin-writable". It is not, and must not
   become so. Live policies allow any authenticated user to INSERT and UPDATE,
   which is how the iOS "first user to add creates the row" flow works.
   Tightening that is precisely the kind of policy change CLAUDE.md warns breaks
   older clients. **The trust boundary is the `verification` column, not RLS**:
   anyone may create an `unverified` row, only an admin may move one to
   `verified`, enforced by a trigger rather than by taking write access away.

### No promotion counter

The frequency rule wants "at least 3 separate households typed this". The existing
`times_added` counts adds, so one household adding the same food five times would
trip a threshold of five alone. Rather than add a second counter, the candidate
list is a `count(distinct household_id)` over `foods`, grouped by normalized
name, computed when the review queue is opened.

This is deliberate. US-784 and US-785 exist in this repo because a stored count
drifted from the rows it summarised. A denormalised counter here would be the
same bug waiting.

## Data flow

**Seed.** USDA Foundation Foods and SR Legacy, filtered to roughly 1,500-2,000
foods families actually eat rather than all ~8,000 lab entries. Each lands
`source = 'usda'`, `verification = 'verified'`.

**Aisle is not in any nutrition dataset.** Aisle is a retail concept; USDA will
never tell you cheddar is in chilled dairy. Each seeded row needs an aisle
assigned, derived from category as a first pass and corrected by hand. For ~2,000
rows that is a real one-time cost, and it is the part of "known correct" that only
the operator can supply. Aisle then layers: catalog default, overridden per store
by the existing `store_aisles` and `food_aisle_mappings`.

**Barcode.** Scan, then `lookup-barcode` (already queries USDA, Open Food Facts
and FoodRepo), then upsert a branded row as `unverified`, linked to a generic
parent where the name resolves.

**Frequency.** The candidate query above, surfaced in the existing
`NutritionManager` admin screen, promoted by a human.

**Reads go through one resolver.** Every screen that reads `foods.name` or
`foods.aisle` must prefer the catalog value when `canonical_id` is set. If each
screen implements that itself they drift within a release, which is what US-777
fixed for grocery inserts with a single `buildGroceryRow`, and what the three
disagreeing streak rules in US-781 show when nobody does. One resolver returns
the effective food; every consumer uses it.

## Failure modes

**The matcher is the dangerous part.** It links an existing household food to a
canonical row by name, and a wrong link is not cosmetic here: if a child's
`is_safe` "chicken" binds to the wrong canonical food, the ladder and safe-food
logic inherit the mistake and a parent may be shown a food as safe that is not.
So the matcher is deliberately timid. Exact normalized-name or barcode match
only, never fuzzy, never across categories. It writes `canonical_id` and nothing
else. The link is reversible without touching household `is_safe` or
`is_try_bite` state.

Barcode misses leave the household row unlinked and working. USDA needs an API
key and rate-limits and Open Food Facts is slow, so lookups degrade to "not
found" rather than failing the add. Bad third-party nutrition is caught twice:
`unverified` keeps it out of totals, and a sanity bound rejects the impossible on
write. The ceiling is **900 kcal per 100 g**, which is pure fat and therefore the
physical maximum; anything above it is a unit error or a bad scrape, not a food.
Macros are bounded at 100 g per 100 g each. Near-duplicates are
constrained by unique `barcode` and unique `name_normalized` per `kind`, with the
existing `merged_into_id` and `rpc_merge_items` for the rest.

**Licensing.** Open Food Facts is ODbL: attribution and share-alike. Rows sourced
from it record `source` and need an attribution line wherever that data is shown.
USDA is public domain and carries no such obligation.

**RLS.** The catalog keeps its existing policies: readable, insertable and
updatable by any authenticated user, because the shipped iOS app creates catalog
rows and tightening that would break it. The trust boundary is the `verification`
column, guarded by a trigger so only an admin can set `verified`. The catalog
holds no user data by construction, which is what the promotion gate in US-798
protects. Household `foods` RLS is untouched.

## Testing

- Seed integrity: every seeded row has a category, an aisle, per-100 nutrition,
  and values inside plausible ranges.
- The resolver, both branches: `canonical_id` set and null.
- The matcher, on fixtures that must NOT match: "chicken" to "chicken nuggets",
  same word across different categories.
- Distinct-household counting where one household adds the same food twice.
- RLS unchanged: an authenticated insert still succeeds, because iOS depends on
  it. A non-admin attempt to set verification=verified is rejected by the trigger.
- A migration test proving the added columns are additive and a client reading
  the old shape still works.

## Stories

US-793 through US-799 in `prd.json`, each independently shippable, in dependency
order: schema, seed, resolver, matcher, barcode promotion, frequency promotion,
retirement of the dead catalogs.
