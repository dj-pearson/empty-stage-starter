# Unified kitchen loop: canonical items, an inventory ledger, and a household meal

Date: 2026-08-31
Status: approved design, pending decomposition into implementation plans
Scope: EatPal (Munch Maker Mate). iOS Swift app (`ios/EatPal/`) leads; web (`src/`) takes model parity.

## Problem

The app already implements the whole loop the product describes. Recipes parse into
structured ingredients. The meal plan generates a grocery list carrying provenance.
Marking a meal made debits the pantry, auto-checks the sourced grocery rows, and can be
undone. Bought items credit the pantry. None of it is missing.

It still reads as five apps that argue with each other, for five specific reasons.

### 1. Every seam between modules is a lowercased string compare

`AppState.moveCheckedToPantry` credits the pantry by
`foods.firstIndex { $0.name.lowercased() == item.name.lowercased() }`
(`ios/EatPal/EatPal/App/AppState.swift:1725`). `GroceryGeneratorService` de-duplicates
candidates by a lowercased name key. `ShortfallCalculator` matches through
`IngredientNameMatcher`. `PantryDedup` exists as a utility, which is itself the evidence.

There is no canonical item identity. "chicken breast", "chicken breasts" and "boneless
chicken breasts" are three things to the app and one thing to the parent. Each module is
internally correct and they still disagree on screen.

### 2. `foods` is three entities in one row

- Pantry stock: `quantity`, `unit`, `expiry_date`, `price_per_unit`, `currency`
- Household catalog entry: `name`, `category`, `barcode`, `aisle`, `allergens`, `package_quantity`
- ARFID disposition: `is_safe`, `is_try_bite`

The third is household-wide, but disposition is per child, and `kid_food_ladder` already
keys on `(kid_id, food_id)`. Two competing answers to "is this safe for this child".

### 3. The one path that should subtract the pantry does not

`GroceryGeneratorService.swift:63` passes `skipPantryStocked: false` on the meal-plan
path. The recipe-direct path defaults to `true`. The product definition of the grocery
list ("what the plan needs that is not already in the pantry") is the only branch that
skips the rule.

### 4. There is no meal

`plan_entries` is one row per `(kid, date, slot, food)`, with `is_primary_dish` patching
over it. Nothing owns "the household cooked stir-fry on Tuesday". The planner is
kid-centric while pantry and grocery are household-centric, so the join between them is
always awkward and always inferred.

### 5. Cooking and eating are one event

`markPlanEntryMade` force-writes `plan_entries.result = "ate"` alongside the pantry debit
(`AppState.swift:898`). Cooked is not eaten. The exposure record is the artifact a
dietitian, psychologist or trainer would read, and it is currently populated by an action
about inventory.

Related: the clinician report (`src/components/LadderReportDialog.tsx`,
`src/lib/clinicianLadderPdf.ts`) exists on web only. iOS has no export.

## Decisions

Settled during design review:

1. **The household logistics loop is the spine.** Plan, shop, stock, cook, restock running
   without friction is the product. The child's exposure record is the highest-value thing
   riding on top of it, not the thing everything else serves.
2. **Introduce a canonical item entity.** Full re-foundation rather than a better string
   matcher. Additive migration, dual-write, readers migrate across releases.
3. **Introduce a real household meal entity.** Per-kid rows become plates hanging off it.
   Cooking is a state transition on the meal (`cooked_at`), not a separate cook-event
   entity.
4. **Per-kid disposition is truth.** `kid_food_ladder` wins; `foods.is_safe` survives only
   as a server-maintained rollup for shipped clients.
5. **Architecture: the kitchen ledger.** Stock is a balance derived from an append-only
   movement log, not a number that modules write.

## Architecture

Six modules, each owning exactly one write path. The invariant that ends the fighting:
**no module writes another module's tables.** Cross-module effects are appended movements
or explicit domain events.

| Module | Owns | Reads |
|---|---|---|
| Catalog | `foods`, `item_aliases`, `canonical_products` | nothing |
| Inventory | `inventory_movements`, `item_stock` | catalog |
| Planning | `meals`, `plan_entries`, `recipes`, `recipe_ingredients` | catalog, inventory |
| Shopping | `grocery_items`, `grocery_lists`, `grocery_item_sources`, `store_layouts` | planning, inventory |
| Child record | `kids`, `kid_food_ladder`, `food_attempts` | planning |
| Insight | nothing | all of the above |

### Catalog

`foods` stops pretending to be three things and becomes the household's canonical item:
name, category, barcode, aisle, allergens, package size. One row per distinct thing the
household buys or cooks. Stable id. Everything points at it.

New columns on `foods` (all nullable, additive):

- `merged_into_id uuid null references foods(id)` - de-duplication redirects rather than
  deletes, so nothing an old client references disappears.
- `canonical_unit text null` - one of `g`, `ml`, `count`.
- `unit_conversions jsonb null` - per-item conversions expressed in `canonical_unit`,
  e.g. a can of this product weighing 400 g.
- `needs_review boolean not null default false` - set on provisional items the resolver
  created below its confidence threshold. Drives the "N items need confirming" affordance.

Two existing stock columns stay on `foods` rather than moving:

- `expiry_date` stays, holding the oldest known expiry for the item, matching today's
  behaviour and the v1 oldest-wins decision below.
- `price_per_unit` and `currency` stay as the last-known price, used for forecasting a
  list before it is bought. Actual spend comes from `purchase` movements, which is what
  `BudgetService` reports against.

New table `item_aliases`:

```
id              uuid pk
household_id    uuid not null
item_id         uuid not null references foods(id)
normalized_text text not null
source          text check in (barcode, user_confirmed, receipt, import, ai_suggested, legacy_migration)
confidence      numeric not null default 1.0
created_at      timestamptz default now()
unique (household_id, normalized_text)
```

New table `canonical_products` - a shared, read-only seed keyed by barcode and normalized
name carrying category, default unit and default aisle, so a new household does not
resolve from zero. `SmartProductService` and `BarcodeService` already reach for this and
do not have it.

### The resolver

A pure module, mirrored in Swift and TypeScript with a shared fixture suite, following
the existing `ExposureLadderPolicy.swift` / `src/lib/exposureLadder.ts` pattern.

Input: raw text, optional barcode, household id.
Output: an item id with a confidence score, or a disambiguation request.

Resolution order:

1. Barcode exact
2. Household alias exact (on normalized text)
3. Household alias fuzzy, above threshold
4. `canonical_products` seed
5. Propose new item

Below the confidence threshold it never guesses. It creates a provisional item that
behaves normally everywhere and carries a flag, and the app surfaces a single quiet
"N items need confirming" affordance. It must never block a parent mid-task to ask a
taxonomy question. Every confirmation writes an `item_aliases` row.

### Inventory: the ledger

```
inventory_movements
  id                uuid pk              -- client-generated, idempotent offline replay
  household_id      uuid not null
  item_id           uuid not null references foods(id)
  delta             numeric not null     -- signed, in canonical_unit
  canonical_unit    text not null
  display_quantity  numeric null         -- what the parent actually said
  display_unit      text null            -- e.g. gal
  reason            text check in (purchase, cook, waste, expire, correction, initial)
  ref_type          text null            -- meal | grocery_item | receipt | null
  ref_id            uuid null
  occurred_at       timestamptz not null default now()
  created_by        uuid not null
  reversed_by_id    uuid null references inventory_movements(id)
  created_at        timestamptz default now()
```

Rows are never mutated or deleted. A correction is a new row. An undo is an appended
reversal. That property is what makes `plan_entry_made_log.reversal_payload` unnecessary,
and it is what makes offline replay safe: a replayed movement is a no-op on unique id,
where a replayed deduct double-debits today.

```
item_stock
  item_id            uuid pk references foods(id)
  household_id       uuid not null
  on_hand_canonical  numeric not null default 0
  canonical_unit     text not null
  updated_at         timestamptz not null
```

`item_stock` is a cache maintained by trigger on `inventory_movements`. The ledger is
truth. A second trigger mirrors `on_hand_canonical` into `foods.quantity` in the item's
display unit, so every shipped iOS build keeps reading the column it already reads and
sees correct numbers with no rebuild.

**Canonical units are half the fix.** `UnitConverter` and `UnitInference` are promoted
from utilities called at one site into the write boundary. An item with an unknown
conversion records movements in its own declared unit and is excluded from arithmetic
that would be wrong, rather than fudged into it. That is the discipline the
`mismatchedNames` list in `moveCheckedToPantry` is currently groping toward without a
model to support it.

### Planning

```
meals
  id                uuid pk
  household_id      uuid not null
  date              date not null
  meal_slot         text not null        -- matches MealSlot.rawValue
  recipe_id         uuid null references recipes(id)
  title             text null            -- for recipe-less meals
  servings_planned  numeric not null default 1
  cooked_at         timestamptz null
  cooked_servings   numeric null
  created_at, updated_at
```

A null `cooked_at` means planned. Setting it is the cook event, and that is what appends
the debit movements with a `meal` ref type.

`plan_entries` gains `meal_id uuid null references meals(id)` and becomes the per-kid
plate. It keeps `kid_id`, `food_id`, `result`, `notes`, `food_attempt_id`, and loses
ownership of the pantry debit. Per-kid substitution stops being a hack: kid B's plain
pasta is a plate on the same meal, not an orphan row that confuses the debit.

`plan_entries.result` is no longer written by the cook action.

### Child record

`kid_food_ladder` is truth for disposition. It gains a `disposition text` column
(safe, trying, refused, untried), maintained by trigger from `current_rung` and `status`
using the same thresholds as `ExposureLadderPolicy`, so views stop re-deriving policy in
five places. It is stored rather than computed on read so the household rollup trigger on
`foods.is_safe` has something cheap to aggregate.

`foods.is_safe` survives as a trigger-maintained rollup: true when every active kid in the
household is at safe. Purely so shipped clients keep rendering.

### Shopping

Unchanged in shape. `grocery_items` gains `item_id uuid null references foods(id)`.
`grocery_item_sources` already models provenance well and stays as-is. Aisle assignment
moves from per-row guessing (`GroceryAisleClassifier` on a name string) to a property of
the item, learned once per household. Correct an item's aisle once and it is right in
every future list, every recipe that pulls it in, and every store layout mapped against it.

### Insight

Read-only across everything. Waste and actual spend become recorded facts rather than
inferences. `RestockPredictor` reads purchase cadence from movements instead of guessing.

## The five transitions

### 1. Capture to recipe library

Sources: share extension (`EatPalShare`), URL paste, photo OCR (`ImageTextRecognizer`),
manual entry, AI generation. Parses into `recipes` plus structured `recipe_ingredients`.

**Every ingredient runs through the resolver at import time**, not at grocery-generation
time. Ingredients resolve to an item id with confidence; anything below threshold surfaces
as one "confirm N ingredients" step inside the import sheet, with the parent present and
the recipe in front of them.

This is the largest single behavioural change. Today resolution happens repeatedly,
downstream, silently, in four different matchers, at moments when the parent has no idea
a decision is being made for them.

### 2. Recipe to week

Creates a `meals` row. Per-kid `plan_entries` become plates hanging off it. `RecipeScaling`
drives quantities from `servings_planned`. The Week view renders per-meal coverage from
`item_stock` via the single shortfall function.

### 3. Week to grocery

One function, one definition:

```
requirement = sum over meals of (ingredient.quantity * servings_planned / recipe.servings),
              in canonical units, grouped by item id
need        = requirement - projected_on_hand(shop_date) - already_on_list
```

`projected_on_hand` subtracts meals scheduled between now and the shop date, so shopping
Saturday for a week that cooks Thursday and Friday accounts for Thursday and Friday.
Nothing does this today.

De-duplication is by item id. Package rounding uses `package_quantity` and
`servings_per_container`, which exist on `foods` and are unused for this: need 300 g of
something sold in 500 g packs, buy one pack, and the ledger knows about the 200 g surplus.

`skipPantryStocked: false` is deleted. Both generation paths subtract the pantry.

### 4. Shop to pantry

Aisle walk-order, store layouts and `ShoppingModeView` are unchanged; Shopping Mode gains
a primary button on the List segment. Checkout is one action: each checked row appends a
`purchase` movement with canonical quantity, price when known, and a `grocery_item` ref.
Rows close. The pantry is credited before the car is unloaded, rather than as a separate
"move completed to pantry" chore.

Receipt scanning (`ReceiptScanService`) becomes a second path into the same append, with
the resolver mapping receipt lines to items. A receipt is a hundred real-world name
variants per trip, so this is the fastest route to a rich alias table. Price on the
movement is what makes `BudgetService` report actual spend instead of an estimate.

### 5. Cook, then eat

**Cook** is one action on the meal card. Sets `cooked_at` and `cooked_servings`, appends
one `cook` movement per resolved ingredient scaled to servings, and auto-checks grocery
rows sourced from that meal (the good half of US-262, kept). Idempotent on meal id.

**Eat** is a separate evening card on Today: one row per kid, three taps
(ate / tasted / refused), plus a rung when it was a try bite, writing `plan_entries.result`
and, for exposures, a `food_attempts` row with ladder progression through
`ExposureLadderPolicy`. **Skipping writes nothing.** A blank is honest; a defaulted "ate"
quietly poisons the record a clinician would read.

The Watch app and widget are the right surfaces for outcome logging and already exist.

**Undo** for either is an appended reversal against the ref. `rpc_undo_meal_made` collapses
into a generic "reverse movements by ref", and `reversal_payload` is retired.

### Cross-cutting flows

- Expiry writes `expire` movements.
- An explicit "threw this out" writes `waste`, giving the household a waste number it has
  never had.
- A manual pantry edit writes a `correction` whose delta is new minus current, so editing
  stays one number to the parent and stays auditable underneath.

**Expiry granularity.** `expiry_date` on the item row is lossy once there are two cartons
of milk bought a week apart. v1 keeps one expiry per item with oldest-wins, matching
today's behaviour. The ledger means per-batch expiry can be added later by putting a lot
id on movements, with no rework above.

## iOS layout

Current tabs are Home, Planner, Pantry, Grocery, More, with Recipes demoted into More
(US-373) to stay inside the tab budget. Every tab is a table with a screen on it, so the
parent has to know which table their question lives in.

**Proposed tabs: Today, Week, Recipes, Grocery, Kids.** No More tab; settings moves to a
profile control on Today.

- **Today** is time-aware rather than a dashboard. Morning shows what to thaw and what is
  planned. Late afternoon shows the cook card with live coverage. Evening shows outcome
  logging. Shopping day surfaces the list. The parent's question genuinely changes by hour
  and a static card grid cannot answer it.
- **Week** is the meal plan, with the shortfall rendered inline.
- **Recipes** keeps a tab. Recipe collection is a couch activity, disconnected from
  planning, and it is the entry point of the whole loop.
- **Grocery** opens on the list and holds two segments, **List** and **Pantry**, defaulting
  to List. Aisle grouping, the 32-value `GroceryAisle` taxonomy, `StoreLayout` walk-order,
  `ShoppingModeView` and `ARShelfFinderView` are all preserved unchanged. Pantry rides
  inside Grocery because the two segments are the same list at two points in time: you shop
  the List, you check out, the rows appear in Pantry. Making them separate root tabs is
  what forces a parent to hold that connection in their head.
- **Kids** is promoted out of More and holds ladders, exposure progress, the picky-eater
  quiz, food chaining, and the clinician report. It is the app's differentiator and is
  currently three taps deep behind an ellipsis. The clinician export ships here on iOS.

**The provenance thread** is what makes it read as one system, and the ledger is what makes
it possible:

- Tap a List row: for Tuesday stir-fry, you have 200 g of 500 g.
- Tap a Pantry row: bought Aug 12, used in 3 meals, expires Friday.
- Tap a cooked meal: every movement it created, reversible.

**One shortfall number, computed once.** `PantryCoverage`, `ShortfallCalculator`,
`ShortfallChecker` and `GroceryGeneratorService` each compute a variant of "what is
missing" today, which is why modules can disagree on screen. One function, rendered on
Week, Today and the List segment.

`DeepLinkHandler` and its `MoreRoute` enum need rework alongside the tab change.

## Web

Web takes slices 1 through 3 for model parity: canonical items, ledger, meals, per-kid
disposition. Its navigation rework can lag, since the five-tab budget is an iOS
constraint. The mirrored-policy pattern covers the pure logic (resolver, unit converter,
shortfall, movement fold) with shared fixtures, so the two platforms cannot drift.

`src/contexts/AppContext.tsx` load precedence (US-341) is unaffected: movements load like
any other domain slice, and being append-only makes the "server overwrites cache" rule
trivially safe for them.

## Failure, offline, and conflict

**Resolver failure** creates a provisional item and defers the question. Never blocking.

**Unknown unit conversion** excludes the item from arithmetic rather than fudging it.

**Balance drift**: `item_stock` is a cache and is repaired by refolding the ledger. A
nightly job asserts that each item's stored balance equals the sum of its movement deltas
and reports drift. Nonzero drift means something wrote stock directly, and names the path.

**Offline** is where the design earns its cost. Movements are append-only, commutative and
idempotent on a client-generated uuid. Two phones shopping and cooking offline both append,
both land, and the balance is correct with no merge logic. Today two devices each writing
a quantity of 3 produce a wrong number silently. The ledger converts the hardest conflict
class in this app into a non-conflict.

Conflicts remain only on genuinely mutable entities: recipe edits, plan edits, item
metadata. Those keep last-write-wins under the existing precedence contract (US-341), and
`ConflictDetector`, `PendingChangesSheet` and `SyncStatusBanner` keep their current jobs.

## Testing

- **Mirrored policy suites**, extending the `ExposureLadderPolicy` pattern to four more
  pure modules: resolver, unit converter, shortfall function, movement fold. Shared fixture
  files, both languages, drift fails CI.
- **Property test on the invariant**: for any random sequence of movements including
  reversals, folding the movements equals the stored balance.
- **Backward-compatibility suite**: an old client's read of `foods.quantity` and
  `foods.is_safe` matches what a new client computes. This gates the migration, because it
  is the suite protecting the build that is live in the App Store.
- **Dedupe tested against real-shaped data** from `Database_Backup`, not fixtures. The
  duplicates in production are the actual adversary.

## Migration and release sequencing

All additive, per the project migration rules. Nothing is dropped or renamed.

### Prerequisite

Confirm production schema state before sequencing anything. Project notes record that the
production database is behind its migrations and that `db push` is not used on self-hosted.
A ledger cannot land on a database whose current state cannot be asserted. This is a task
in the plan, not an assumption.

### Release N - server only, no app rebuild

- Create `canonical_products`, `item_aliases`, `inventory_movements`, `item_stock`, `meals`.
- Add nullable columns: `grocery_items.item_id`, `plan_entries.meal_id`,
  `foods.merged_into_id`, `foods.canonical_unit`, `foods.unit_conversions`,
  `foods.needs_review`, `kid_food_ladder.disposition`.
- RLS on every new table, following the existing household-scoped policy pattern.
- Backfill `item_stock` from current `foods.quantity` as `initial` movements; backfill
  `meals` from existing plan-entry clusters; seed `item_aliases` from existing names.
- Triggers maintaining `foods.quantity` and `foods.is_safe` from the new truth.
- Nothing user-visible.

**Highest-risk object in the plan**: during release N, shipped clients still write
`foods.quantity` directly. The trigger must translate a direct quantity write into a
`correction` movement rather than fight it, so old and new stay reconciled. It needs its
own test suite.

### Release N+1 - iOS and web

Resolver at import, ledger-backed cook and buy, meals, per-kid disposition, the new IA.
Legacy mirrors still maintained, so an older build in the wild keeps working.

### Release N+2

Once `MIN_SUPPORTED_IOS_BUILD` passes N+1, retire the legacy mirrors and the
direct-write translation trigger.

### Safety rails

- **Dark-launch**: ledger reads behind `useFeatureFlag`. Run the ledger balance alongside
  `foods.quantity` on real households, compare, and flip only when they agree.
- **Dedupe as a reviewable proposal**, per household, in-app: these 6 rows look like the
  same item, merge? Never merge silently. Merge redirects via `merged_into_id`.

## Decomposition

Too large for one implementation plan. Five slices, each getting its own plan:

1. **Catalog, resolver, aliases** including the merge review UX
2. **Ledger**: movements, canonical units, balance projection, legacy mirrors
3. **Meals**: the meal entity, the cook/eat split, per-kid disposition
4. **iOS IA**: navigation rework and the provenance thread
5. **Insight**: waste, actual-spend budget, clinician report on iOS

Slices 1 and 2 are coupled and form the foundation; they should be planned together.
Slices 3, 4 and 5 sit on top and can be sequenced independently after.

## Out of scope

- Per-batch expiry (inventory lots). Deferred; the ledger makes it additive later.
- Ingredient reservation at plan time. Plan-time coverage stays advisory, per US-348.
- Multi-currency normalisation. Prices stay per-movement with an ISO code.
- Web navigation rework.
- Automatic (non-reviewed) item merging.

## Open questions

None blocking. Two to settle during slice 1 planning:

1. Fuzzy-match confidence threshold, and whether it is tuned per household as the alias
   table grows.
2. Whether `canonical_products` ships with a seeded dataset (a barcode/product source) or
   starts empty and fills from real household confirmations.
