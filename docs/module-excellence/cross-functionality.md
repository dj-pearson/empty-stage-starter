# EatPal cross-functionality audit: the kitchen loop as one system

Audit date 2026-09-22, `main` at ca6debe (PR #282). Read-only. Every claim cites
`file:line` in this repo; where a claim is an inference rather than a read, it says so.

Headline: the loop has most of its server parts (ledger, catalog, mark-made RPCs,
plan-result -> attempt trigger, ladder -> is_safe rollup) but **web calls almost none of
them**, and iOS calls the older half. The joins between modules are still string
compares, now implemented in at least 15 places across TS, Swift and SQL. Two of the
seams have live correctness bugs (pantry unit overwrite on check-off; household partner
cannot debit the pantry through mark-made) and one is a security finding (S1,
withheld from this public doc until fixed).

---

## 0. Status of the 2026-06-03 review findings

| June finding | Status today | Evidence |
|---|---|---|
| 3.1 `unitNormalize` not wired into `recipeShortfall` | **Open.** Still exact-string unit compare, unit mismatch reads on-hand as 0 | `src/lib/recipeShortfall.ts:96-97,132-136`. Unit-aware subtraction exists elsewhere (`groceryMerge.requiredAfterStock`, `src/lib/groceryMerge.ts:38`; `SmartGroceryDialog.tsx:106-109`), so the fix is now a reuse, not a port |
| 3.2 `source_recipe_id` written, never read | **Open.** Only writers; zero readers on web, iOS or SQL | writers `Planner.tsx:135`, `Recipes.tsx:356,383`, `TonightSuggestionsDialog.tsx:87`, `MissingIngredientsSheet.swift:207` |
| 3.3 "I made it" means different things | **Open and wider.** Now four web meanings | Planner "ate" debits 1 unit of `food_id` (`Planner.tsx:504-529`); RecipeDetail bumps `times_made` only (`RecipeDetailView.tsx:176-186`); Tonight cook "complete" is analytics only (`TonightCookDialog.tsx:147-162`); Dashboard quick-log "ate" writes result with no debit (`Dashboard.tsx:187-199`) |
| 3.4 hardcoded `quantity: 1` on recipe-detail add | **Open** | `Recipes.tsx:352`, and the list is presence-only `RecipeDetailView.tsx:139` |
| 3.5 web/iOS parity uneven | **Open, partly scaffolded.** Shared fixtures exist for normalize/unit/resolve (`tests/fixtures/kitchen-loop/*.json`, US-660) but no Swift test reads them (US-682 open) | `ios/EatPal/EatPalTests/` has no fixture reader |
| R2 one `resolvePantryFood` | **Partly.** Grocery page moved to a catalog-aware index (US-795, dff276c, `groceryData.ts:30-44`); the ledger resolver did not follow it (see B3) | `movementBuilders.ts:345-357` |
| R3 auto-check grocery on mark-made | **Server done, web missing.** `rpc_mark_meal_made(_v2)` checks rows joined through `grocery_item_sources`; web never writes that table and never calls the RPC | `20260614000001_mark_meal_made_v2.sql:95-113`; only iOS writes sources (`DataService.swift:221-242`) |
| R4 unify markMade | **Open on web.** iOS routes through `MealMadeStrategy` + v2 RPC | `AppState.swift:975-1060` |
| R6 write the contract down once | **Done as a design, not as code.** `docs/superpowers/specs/2026-08-31-unified-kitchen-loop-design.md`; kitchen-loop US-676..681 carry it and are all `passes:false` | `prd-kitchen-loop.json` |
| Category drift | **Partly fixed.** `generateGroceryList` now takes `EffectiveFood` (US-795, `mealPlanner.ts:131-202`); Planner shortfall still defaults to `"snack"` | `Planner.tsx:133`, `SmartGroceryDialog.tsx:136` |

Landed since June and relevant to the loop: ledger tables + mirrors (US-665..669,
b399d27..8e2b09c), web ledger reads/writes behind flags defaulting **off**
(`InventoryContext.tsx:298-299`, US-671/672), one grocery row builder (US-777,
f57a3ea), plan sync persists (US-713, ce355f4), bought food not marked safe (US-803,
908c8e6), shared catalog + `foods.canonical_id` (US-793..798), retirement of
`item_aliases`/`canonical_products` (US-799, 5e648dd).

A stale spec note: kitchen-loop US-661 AC4 still says "confirming a row writes an
`item_aliases` row", a table dropped on 2026-09-19
(`20260919000000_retire_canonical_products_item_aliases.sql`). `src/lib/itemResolver.ts`
still types `ResolverAlias`/`ResolverCanonicalProduct` and has no production importer.
US-661 needs its alias memory re-pointed at the catalog before anyone builds it.

---

## 1. The loop as it runs today

Legend: **A** automatic, **M** manual (user does it by hand), **X** missing, **B** broken.

| # | Handoff | Web | iOS (1.0.9) | Evidence |
|---|---|---|---|---|
| 1 | Kid preferences -> plan suggestions | M/A-lite: AI week uses household `foods.is_safe`, not per-kid; Sibling finder/tonight read `kids.disliked_foods` as ids *and* names | Same AI inputs (`AIMealService.swift:138`) | `supabase/functions/ai-meal-plan/index.ts:34-39`; `siblingConstraintSolver.ts:290-295`; `tonight-mode/index.ts:268-269` |
| 2 | Plan -> recipe ingredients | B for new recipes: `schedule_recipe_to_plan` raises "Recipe has no foods" when `food_ids` is empty, and expands to one plan row per food per kid | Same RPC | `20251012011805_*.sql:28-31,41-` |
| 3 | Recipe -> shortfall vs pantry | A but wrong on units (exact string) | A, same flaw (`ShortfallCalculator.swift:96`) | `recipeShortfall.ts:96` |
| 4 | Shortfall -> grocery | M (dialog), quantity lost on RecipeDetail path | M (sheet) with quantities | `Planner.tsx:124-139`, `Recipes.tsx:344-358` |
| 5 | Plan -> grocery (bulk) | A but counts plan rows vs `foods.quantity`, ignores recipe ingredients and units | A, recipe-aware, unit-converting, writes `grocery_item_sources` | `mealPlanner.ts:143-202` vs `GroceryGeneratorService.swift:86-160` |
| 6 | Grocery -> aisle order | A by `aisle` string; walk order unread (US-732) | A via `GroceryAisleClassifier` | `effectiveFood.ts:71`, `GroceryAisleClassifier.swift` |
| 7 | Check-off -> pantry restock | A per tap (flag off) but **B: overwrites pantry unit** | M: "Move to pantry" button, unit-converting, creates food `isSafe: true` | `Grocery.tsx:356-364`; `AppState.swift:1894-1930` |
| 8 | Checkout -> ledger purchase | A only when `ledger_writes` flag on (default off); **B: can silently skip credit** (B3) | X (writes `foods.quantity`) | `Grocery.tsx:462-500` |
| 9 | Cook ("meal made") -> pantry decrement | B: Planner debits 1 unit of one food per kid-row; other surfaces debit nothing | A via `rpc_mark_meal_made_v2`, ingredient-scaled | `Planner.tsx:504-529`; `AppState.swift:983-1003` |
| 10 | Cook -> grocery auto-check | X (no sources written) | A (sources join) | `mark_meal_made_v2.sql:95-113` |
| 11 | Plate outcome -> try-bite log | A via trigger `create_attempt_from_plan_result` | A (same trigger) plus ladder log links back | `20251010220000_link_planner_food_tracker.sql:30-100`; `AppState.swift:1390` |
| 12 | Try-bite log -> ladder progress | **X from planner**: a planner "tasted" inserts `food_attempts` but never runs `applyAttemptOutcome`; backfill upserts with `ignoreDuplicates` so existing rows never move | A only from Ladder controls | `useFoodLadder.ts:304-329`; no SQL trigger on `food_attempts` touches the ladder |
| 13 | Ladder -> `foods.is_safe` | A (trigger rollup, all kids safe) | A | `20260901000003_kitchen_loop_legacy_mirrors.sql:254-330` |
| 14 | Progress -> better suggestions | M/X: no edge function reads `kid_food_ladder`; `platePlanner.ts` does on web recipe plates only | X | `grep kid_food_ladder supabase/functions` returns nothing |
| 15 | Stock -> restock suggestion | Three models: SQL `detect_restock_needs` (user-scoped, `is_safe` only, `LOWER(name)` match), web `depletionForecast`, iOS `RestockPredictor` (add cadence) | | `20251010221000_smart_grocery_restock.sql:106-167` |

Expo (`app/`) has no cross-module automation (lists and meals are independent queries,
`app/(tabs)/lists.tsx:132-151`) and is slated for deletion (US-720). Recommend no loop
work there.

### Bugs found on the seams (new, not in June)

- **B1 Check-off overwrites the pantry unit.** Legacy credit adds the grocery quantity
  and sets `unit: item.unit` on the pantry row: 2 lb chicken + 1 pack = "3 pack".
  `Grocery.tsx:359-364` and again `:480-485`. `groceryMerge.requiredAfterStock` already
  has the convert-or-refuse logic.
- **B2 Household partner cannot cook.** Both mark-made RPCs filter foods and grocery rows
  by `user_id = auth.uid()`, not `household_id`
  (`20260614000001_mark_meal_made_v2.sql:75,83,100,105`; v1 `:119,124,143,149`). A second
  parent marking a meal made debits nothing the first parent created. The idempotency
  window is also per user (`:49`), so two parents can double-debit the same entry.
- **B3 Ledger checkout can drop a purchase.** `resolveGroceryItemId` matches raw
  lowercased name only (`movementBuilders.ts:345-357`); the page's fallback matches the
  catalog-aware index (`groceryData.ts:30-44`). When the ledger finds nothing, `skipped`
  carries `itemId: null` (`InventoryContext.tsx:468-474`), the page finds the food via the
  catalog name, sees its id is not in `skippedItemIds`, and credits nothing
  (`Grocery.tsx:475-479`). Latent while the writes flag is off.
- **B4 Bought food is safe on iOS, not on web.** Web US-803 sets
  `ACQUIRED_FOOD_IS_SAFE = false` (`src/lib/foodSafetyDefault.ts:29`); iOS creates
  `isSafe: true` in `AppState.swift:1928`, `ScanReceiptSheet.swift:256`,
  `PantryQuickAddBar.swift:209`. The same shop produces opposite kid-safety data per
  device, and `detect_restock_needs` filters on `is_safe`, so web-bought items are never
  restock candidates.
- **B5 Security finding S1, withheld** until the fix ships. See the "Fix first" section
  of `docs/module-excellence-2026-09.md`.
- **B6 Cook and eat are one event, per kid.** Plan rows are per kid per food; Planner
  "ate" on each kid's row debits again (`Planner.tsx:504-512`), iOS `markPlanEntryMade`
  also writes `result='ate'` which the trigger turns into a `success` attempt for that
  kid (`AppState.swift:1043-1047`). Cooking once for three kids either debits three times
  (web) or logs a fake full-portion success (iOS). This is exactly what kitchen-loop
  US-674/677/679 fix with a `meals` row.

---

## 2. Shared-logic drift

Each row is one cross-module question and every place that answers it.

**"Is this line the same item as that pantry food?"** (15 implementations)

| Where | Key |
|---|---|
| `recipeShortfall.ts:74-77` | food_id, else trim+lower exact |
| `SmartGroceryDialog.tsx:85-86` | food_id, else lower exact (no trim) |
| `mealPlanner.ts:152` | food_id only |
| `groceryData.ts:30-44` (Grocery page) | lower of household name or catalog effective name |
| `movementBuilders.ts:345-357` (ledger) | item_id, else lower exact (no catalog) |
| `groceryMerge.ts:117` `ingredientMatchKey` | tokenized, unit-noise stripped, singularized, sorted |
| `itemNormalize.ts:155` + `itemResolver.ts:196` | normalize + Damerau-Levenshtein 0.82; no production caller |
| `tonight-mode/index.ts:260-264` | `recipe.food_ids` vs pantry ids |
| SQL `auto_add_restock_items` `:161`, view `:254` | `LOWER(name)`, `f.name = gi.name` |
| `ShortfallCalculator.swift:124-137` | foodId, else trim+lower |
| `PantryDedup.swift:10-21` | barcode, else trim+lower |
| `AppState.swift:1894` moveCheckedToPantry | lower, no trim |
| `GroceryGeneratorService.swift:96-137` | lower exact, then `IngredientNameMatcher` word subset |
| `RecipeMatcher.swift:180-184` | lower, drop trailing "s" if len > 3 |
| `RestockPredictor.swift:102-104` | lower |

**Unit conversion** (4): `unitNormalize.ts` (generic families), `canonicalUnits.ts`
(item-aware, ledger only), `ios/EatPal/Shared/UnitConverter.swift` (third table,
different alias sets, "oz" forced to mass), and `recipeShortfall`/`ShortfallCalculator`
which do no conversion at all. Only `canonical-unit-cases.json` pins any of it, and only
on web.

**Category / aisle** (6): `foodCategoryMap.inferFoodCategory` (GroceryContext),
`groceryAisle.suggestCategory` (no importer), `foodNameDefaults.ts:89-91`,
`pantryQuickAddParser.ts:52`, catalog `default_category` via `effectiveFood.resolveFood`,
iOS `GroceryAisleClassifier` + `UnitInference`. Plus literal `"snack"` fallbacks at
`Planner.tsx:133`, `SmartGroceryDialog.tsx:136`, `TonightSuggestionsDialog.tsx:85`,
`FoodChainingRecommendations.tsx:267`.

**"Do I have enough?"** (7): the four web shortfall paths above plus
`countMissingForRecipe` (`recipeShortfall.ts:153`), iOS `ShortfallCalculator`,
`GroceryGeneratorService` (the only one that is recipe-aware and unit-aware at once).

**Kid acceptance** (5 sources of truth): `foods.is_safe` / `is_try_bite` (household,
trigger rollup), `kid_food_ladder` rung/status (per kid), `food_attempts` (per kid log),
`kids.favorite_foods / always_eats_foods / disliked_foods` (text arrays that hold ids in
some writers and names in others, which is why every reader checks both,
`siblingConstraintSolver.ts:290-295`), and the acquired-food default (B4).

**Restock** (3): SQL cadence-free thresholds, web `depletionForecast`, iOS
`RestockPredictor`.

### Canonical homes

The rule: **pure arithmetic lives in a shared TS module with a Swift mirror pinned by
JSON fixtures** (the pattern `exposureLadder.ts` / `ExposureLadderPolicy.swift` already
proves); **anything that writes two modules' tables lives in one Postgres RPC**, because
it must be atomic, household-scoped, idempotent, and identical for iOS builds already in
the store.

| Question | Home | Notes |
|---|---|---|
| Name normalize + match | `src/lib/itemNormalize.ts` + a new `ItemNormalize.swift`; fixtures `normalize-cases.json` | Retire the 15 inline compares. Barcode first, then `foods.canonical_id`, then normalized name |
| Identity resolution with memory | Postgres: extend `match_foods_to_catalog` into `rpc_resolve_items(household, lines[])` returning `food_id`, `canonical_id`, confidence | Client resolver stays for instant UI; server writes the link. Replaces the retired alias table with `food_aliases` (see section 3) |
| Unit conversion | `canonicalUnits.ts` on top of `unitNormalize.ts`; Swift mirror of both; `canonical-unit-cases.json` | Delete the exact-string `normalizeUnitTag` in both shortfall files |
| Shortfall / need | `src/lib/kitchenShortfall.ts` (US-676) + Swift mirror; add `shortfall-cases.json` | Every badge, dialog, list generator calls it |
| Category + aisle | Catalog columns first (`default_category`, `default_aisle_section`), then `GroceryAisle.swift` port (US-728) with `aisle-classify-cases.json` | Delete `suggestCategory`, the `"snack"` literals |
| Kid acceptance | Postgres: `kid_food_ladder.disposition` (US-678) as truth; `kid_food_acceptance` view per (kid, food) | Planner, AI edge functions and grocery read the view, not `foods.is_safe` |
| Cook, purchase, outcome | Postgres RPCs: `rpc_cook_meal` (US-677), `rpc_record_purchase`, `rpc_log_plate_outcome` | Section 4 |
| Restock | Postgres view over `inventory_movements` (cook rate) + plan need; one TS formatter | Replaces all three models |

---

## 3. Data model: one identity for a food

Today there are **two identity layers and five partially-populated foreign keys**:

- `foods` (household item; `canonical_id` -> `grocery_product_catalog`, which has
  `kind in (generic, branded)` and `parent_food_id`,
  `20260906000000_canonical_food_catalog.sql:16-51`).
- Links to `foods.id`: `recipe_ingredients.food_id` (nullable, written only when the
  builder links a row), `plan_entries.food_id` (always), `grocery_items.item_id`
  (column added in `20260901000000_kitchen_loop_merge_items.sql:15-30`, **written by no
  client**; `grep item_id: src` finds only ledger code), `kid_food_ladder.food_id`,
  `food_attempts.food_id`. `inventory_movements.item_id` / `item_stock.item_id` are the
  ledger's.
- `kids.*_foods` arrays are untyped text.
- Brand has no identity at all: `grocery_items.brand_preference` is free text
  (`AddGroceryItemDialog.tsx`, 24 references, none resolved to the catalog).

So the identity exists as columns; what is missing is **population at write time** and
**a per-kid brand link**. Proposed additive path (no drop, no rename, no NOT NULL):

Release N (server only, old iOS unaffected):
1. `food_aliases(household_id, food_id, normalized_text, source, confidence)` with RLS
   by household. It is the retired `item_aliases` pointed at `foods`, owned by the
   resolver RPC.
2. `grocery_items.item_id` gets a `BEFORE INSERT/UPDATE` trigger that fills it when null
   (barcode -> alias -> normalized name within household). Old iOS inserts without
   `item_id` get linked server-side, so no client change is needed for the link to exist.
3. Same trigger shape on `recipe_ingredients.food_id` when null, marking
   `foods.needs_review` for low-confidence matches (column exists from US-656).
4. `kid_food_preferences(kid_id, food_id, catalog_id null, stance in
   ('safe','favorite','disliked','always'), source)`, backfilled from the three `kids`
   arrays: uuid-shaped strings map to `food_id`, others go through the resolver. Keep the
   arrays; a trigger mirrors new rows back into them for shipped clients.
5. `kid_food_acceptance` view: per (kid, food) disposition from ladder, else preference
   stance, else `untried`; plus `preferred_catalog_id` (the exact brand).

Release N+1: web and iOS write `item_id` / `food_id` themselves from the resolver RPC and
read `kid_food_acceptance`. Release N+2 (after `MIN_SUPPORTED_IOS_BUILD` moves): stop
mirroring into the `kids` arrays.

---

## 4. Event model

The ledger already is an event log for stock (`inventory_movements`, reasons
`purchase|cook|waste|expire|correction|initial`,
`20260901000001_kitchen_loop_inventory_movements.sql:49`). Extend the idea to the rest of
the loop with one additive outbox table rather than more hand-wired page code:

`domain_events(id uuid client-generated, household_id, type, subject_id, payload jsonb,
actor_id, occurred_at)`, RLS by household, in the `supabase_realtime` publication.
Written **only** inside the RPCs that perform the action, in the same transaction.

| Event | Emitted by | Synchronous subscribers (trigger, same tx) | Async subscribers (realtime / cron / edge) |
|---|---|---|---|
| `meal_planned` | `planMeal` RPC (US-724) | write `grocery_item_sources` need rows | clients refresh shortfall badges; reminders |
| `list_generated` | `rpc_generate_list` | none | analytics funnel |
| `item_purchased` | `rpc_record_purchase` | `purchase` movement; `grocery_items.checked`; price history (US-749) | restock model; "safe food back in stock" nudge |
| `meal_cooked` | `rpc_cook_meal` | `cook` movements per ingredient; auto-check sourced rows; `recipes.times_made` | low-stock nudge (iOS US-352 today) |
| `plate_outcome_logged` (food_tried) | `rpc_log_plate_outcome` | `food_attempts` row; ladder `applyAttemptOutcome` equivalent; `plan_entries.result` mirror | badges/streaks; AI coach context refresh |
| `food_accepted` | ladder disposition trigger | `foods.is_safe` rollup (exists) | suggestion ranking; "pin this brand?" prompt |
| `stock_low` | nightly job over `item_stock` + plan need | none | restock suggestion / auto-add (respect the 20-a-day rail) |
| `item_resolved` / `items_merged` | resolver RPC, `rpc_merge_items` | alias row | none |

Undo is one generic call, `rpc_reverse_by_ref(ref_type, ref_id)` (US-677), which
reverses movements and emits `*_reversed`. The rule from the design doc still holds and
this is how it becomes enforceable: no module writes another module's table except
through a subscriber listed here.

Ladder progression in SQL means porting `applyAttemptOutcome` to plpgsql. That is a
third copy; the alternative is having `rpc_log_plate_outcome` accept the client-computed
next state (as `rpc_mark_meal_made_v2` accepts client-computed debits) and validate it.
Recommend the second: it keeps the policy in the two pinned pure modules.

---

## 5. Top 10 magic moments, ranked by value / effort

1. **"You already have it" is true.** (value high, effort S) Replace the unit compare in
   `recipeShortfall.ts:96` with `unitNormalize.compare/convert` (reuse
   `requiredAfterStock`), same in `ShortfallCalculator.swift:96` via `UnitConverter`.
   Add `tests/fixtures/kitchen-loop/shortfall-cases.json` read by
   `recipeShortfall.test.ts` and `ShortfallCalculatorTests.swift`. Fixes the planner
   badge, missing dialog, grocery "missing flags" (`Grocery.tsx:553`) in one change.
2. **Checking off groceries restocks the pantry correctly on every device.** (high, S)
   Fix B1 (convert into the pantry unit or refuse and flag, `Grocery.tsx:359,480`), B3
   (make `resolveGroceryItemId` use `buildFoodByDisplayNameIndex`, or pass the resolved
   id from the page), B4 (iOS `isSafe: false` at the three sites). Test: one fixture of
   purchase -> expected pantry row, run by vitest and XCTest.
3. **Your partner taps "cooked" and the pantry updates.** (high, S) New
   `rpc_mark_meal_made_v3` scoped by `household_id` with a household-level idempotency
   key (v1/v2 untouched for shipped builds). Ship the S1 fix in the same migration.
   Assert with `has_function_privilege` in
   `supabase/tests/`.
4. **One "Cooked it" button on web that does everything iOS does.** (high, M) A
   `markMade({ planEntryId | recipeId, servings })` in `src/lib/markMade.ts` that ports
   `MealMadeStrategy.swift` (fixture-pinned), calls the v3 RPC, and is used by
   `Planner.tsx:492`, `RecipeDetailView.tsx:176`, `TonightCookDialog.tsx:147`. Stops
   Planner "ate" from debiting (eating is an outcome, not a cook). Undo via the RPC's
   reversal.
5. **Plan -> aisle-sorted list that excludes the pantry, in one tap.** (very high, M-L)
   Replace `generateGroceryList` (`mealPlanner.ts:131`) with `kitchenShortfall.need`
   (US-676/680): recipe ingredients scaled by servings, pantry subtracted with units,
   deduped by `item_id`, grouped by aisle walk order (US-732). Write
   `grocery_item_sources` on web so moment 4's auto-check works for web-made lists.
6. **Logging "tasted" in the planner moves the ladder.** (high for the picky-eater core,
   S-M) When `handleMarkResult` (`Planner.tsx:492`) or quick-log records a result for a
   food with a ladder row, run `applyAttemptOutcome` and update the row, the same path
   `LadderQuickLogControls` uses via `useFoodLadder.ts:193`. Later move into
   `rpc_log_plate_outcome`.
7. **The list uses each kid's exact safe-food brand.** (very high for this audience, M)
   `kid_food_preferences.catalog_id` (section 3). When the list includes a food any kid
   has pinned, stamp `brand_preference` and `barcode` from the catalog row and show
   "Maya's Annie's". Barcode scan at checkout confirms the match; a mismatch asks "Maya
   only eats Annie's, still buy this?". Files: `groceryRow.ts`, `GroceryGeneratorService.swift`,
   new pin control on `FoodCard.tsx`.
8. **Safe-food runway.** (high, M) "Dino nuggets run out Thursday; Leo has no other safe
   protein." Join `kid_food_acceptance` (safe, per kid) with ledger cook rate and planned
   need; feed `SafeFoodInsuranceCard.tsx` / `safeFoodRisk.ts`, one-tap add. Replaces the
   `is_safe`-filtered SQL restock that currently cannot see web-bought items.
9. **"What can I make tonight" ranked by who will eat it.** (medium-high, M) Web port of
   `RecipeMatcher.swift` on top of `kitchenShortfall` + acceptance view; update
   `tonight-mode` edge to read `recipe_ingredients` and the ladder instead of
   `recipe.food_ids` and `disliked_foods` strings (`tonight-mode/index.ts:260-269`).
10. **Suggestions get better as progress lands.** (medium, M) `ai-meal-plan` and
    `suggest-foods` read `kid_food_acceptance` per kid (not household `is_safe`,
    `ai-meal-plan/index.ts:34`) and pair a due ladder food with that kid's safe food
    (`kid_food_ladder.paired_safe_food_id` already exists).

Suggested order: 3 (security + household) and 2 this week; 1 next; 4 and 6 together;
then 5, which is the biggest and depends on sections 3 and 4.

---

## 6. Test strategy for the loop

1. **Contract fixtures, both languages.** Extend `tests/fixtures/kitchen-loop/` with
   `match-cases.json`, `shortfall-cases.json`, `purchase-credit-cases.json`,
   `mark-made-cases.json` (recipe + pantry + servings -> expected debits and mismatch
   flags). Vitest reads them in `kitchenLoopFixtures.test.ts`; add a Swift reader in
   `EatPalTests` (US-682) so a fixture case with no Swift behaviour fails on the Mac gate.
2. **One SQL loop walk.** `supabase/tests/kitchen_loop_contract.test.sql`, run by
   `scripts/dev/local-sql-suite.sh`: two users in one household, one kid on a ladder;
   plan a recipe, generate sources, purchase (partner), cook (other parent), log a plate
   outcome, undo the cook. Assert `item_stock` equals the movement sum, `foods.quantity`
   mirror, grocery rows checked/unchecked, one `food_attempts` row, ladder rung moved,
   `foods.is_safe` rollup, and that a second cook inside the window appends nothing.
3. **Old-client compatibility.** Same file or US-673's suite: replay what 1.0.9 does
   (direct `foods.quantity` update, `rpc_mark_meal_made` v1, grocery insert without
   `item_id`) and assert the ledger, the `item_id` trigger and the rollup stay consistent.
4. **Privilege assertions** for every loop RPC (`has_function_privilege('anon', ...)`
   false), following `us804_function_privileges.test.sql`. Would have caught B5.
5. **Web integration walk (US-735).** One vitest test mounting `AppContext` against the
   fake PostgREST helper: add recipe -> plan -> generate list -> check off -> done
   shopping -> cook -> outcome, asserting the in-memory slices after each step. Run with
   the ledger flags both off and on, since both ship.
6. **One Playwright happy path** over the same steps on the built `dist/`, non-blocking
   at first.
7. **An architecture guard.** A vitest that fails when `src/pages/**` or
   `src/components/**` contains a `.toLowerCase() ===` compare against a food name, or
   imports a shortfall function other than `kitchenShortfall`. The repo already uses
   this style of test (`iconButtonNames.test.ts`, `effectiveFoodUsage.test.ts`); it is
   what keeps the 15 matchers from growing back.
