# Cross-Module Data-Flow Review & Workflow Improvements

**Date:** 2026-06-03 · **Scope:** holistic review of how data moves _between_ EatPal
modules (Pantry/Foods · Recipes · Meal Plan · Grocery · Household/Kids), web + iOS.
**Goal:** find places where the platform makes the user re-enter or reconcile data the
system already knows, and propose concrete fixes. All findings are grounded in code
(`file:line`) and verified.

---

## 1. How state is wired today

**Web** — `AppContext.tsx` is a facade composer over five domain contexts
(`FoodsProvider → KidsProvider → RecipesProvider → PlanProvider → GroceryProvider`,
`AppContext.tsx:379`). One array per entity (no duplication). The bulk household load
lives only in `AppContext.tsx:152-294` (one `Promise.all`, `household_id`-scoped);
mutations are federated to each context. Persistence is a single debounced localStorage
blob (`kid-meal-planner`).

**iOS** — `AppState` is the single store; cross-module work is centralized in services
/ utilities (`MealMadeStrategy`, `ShortfallCalculator`, `RecipeMatcher`,
`RestockPredictor`, `moveCheckedToPantry`).

**Scoping:** everything persists by `household_id`. `activeKidId` is a **client-side
view filter only** — grocery items carry no `kid_id`, so a list generated for one child
merges into the shared household list (`Grocery.tsx:219`).

---

## 2. The core problem: the cross-module "joins" are reimplemented, not shared

Every place two modules touch, the join logic ("do I already have this ingredient?",
"what's missing for this recipe?") is **re-coded locally and drifts**. Concrete count:

| Cross-module question | Implementations found | They disagree because |
| --- | --- | --- |
| "What's missing for this recipe?" | 3 — `recipeShortfall.ts:50` (qty+unit, structured), `RecipeDetailView.tsx:138` (presence-only, `food_ids`), `mealPlanner.ts:131` `generateGroceryList` (count-vs-stock from plan) | different inputs & math |
| "Does the pantry already have X?" | 3 — `Grocery.tsx:277` (name lowercase), `recipeShortfall.ts:74` (food_id→name), `mealPlanner.ts:135` (food_id only) | different match keys |
| "What category is this?" | 3 — `inferFoodCategory` (`GroceryContext:78`), `matchedFood?.category ?? "snack"` (`Planner.tsx:137`), `food.category` (`RecipeDetailView`) | different defaults |

The same conceptual operation has three answers, so the planner badge, the recipe-detail
"N missing" button, and "Sync from Meal Plan" can all show **different numbers for the
same recipe**. That is the user-visible symptom of an architectural seam problem.

---

## 3. Verified high-leverage gaps

1. **The unit-conversion layer is built and tested but not wired into the shortfall
   path.** `src/lib/unitNormalize.ts` (US-287: mass/volume/count/package `compare()`/
   `convert()`) is **not called** by the canonical Planner shortfall in
   `recipeShortfall.ts`, which instead uses a primitive exact-string `normalizeUnitTag`
   (`:132`) and marks any unit mismatch `comparable:false` — **treating on-hand as zero**
   (`:96-109`). Result: "2 cups flour" needed vs "1 bag flour" on hand → the user is told
   to buy flour they already have. _The fix is a single call-site swap._

2. **Recipe→Grocery provenance is written but never read.** `source_recipe_id` +
   `added_via='recipe'` are stamped on every recipe-driven grocery add (`Planner.tsx:138`,
   persisted `GroceryContext.tsx:81-84`) — but a full-repo search finds **no consumer**.
   The US-262 promise ("mark meal made → auto-check the grocery items that recipe
   generated") is only half-built. The data link exists; nothing closes the loop.

3. **"I made it" means two different things.** Planner "ate" debits pantry via
   `deduct_food_quantity` (`Planner.tsx:476-499`); `RecipeDetailView` "I made it"
   (`Recipes`/`RecipeDetailView.tsx:175`) only bumps `times_made`/`last_made_date` — **no
   pantry debit, no grocery touch.** Same user intent, divergent side effects → pantry
   silently drifts out of sync depending on where the user tapped.

4. **Quantities aren't carried on the recipe-detail add.** `Recipes.tsx:293` hardcodes
   `quantity:1`; the Planner path carries the computed shortfall quantity. The user re-edits
   amounts the system already computed.

5. **Web↔iOS parity is uneven in _both_ directions.** iOS has `RecipeMatcher`
   ("what can I make from pantry+grocery"), `RestockPredictor`, and `moveCheckedToPantry`;
   web has the structured Planner shortfall and `depletionForecast`. Neither is a superset.
   Because the cross-module semantics live in per-client code, every parity story
   (US-262/285/286/289…) re-derives behavior instead of implementing a shared spec.

---

## 4. Recommended improvements (ordered by leverage ÷ effort)

### R1 — Wire `unitNormalize` into `recipeShortfall` _(small, high impact)_
Route the comparison in `recipeShortfall.ts:96` through `unitNormalize.compare()`/
`convert()`. Stops the most common "buy what you already own" false positive. The layer
is already tested — this is plumbing, not new logic.

### R2 — One shared "resolve line → pantry food" matcher _(medium)_
Extract a single `resolvePantryFood(ingredientOrGroceryLine, foods)` (food_id → normalized
name → alias) and use it in all three sites above. Kills drift between grocery→pantry
credit, shortfall, and plan generation. Pairs naturally with a single `unit-aware`
`computeShortfall(recipe, pantry, grocery)` that the badge, recipe-detail button, and
plan-sync all call.

### R3 — Close the provenance loop: auto-check grocery on mark-made _(medium, delight)_
When a meal is marked ate/made, check off the grocery items whose `source_recipe_id`
matches (and optionally credit them to pantry). The data is already linked; this is the
missing consumer. Net effect: the grocery list **self-maintains** — the user stops manually
un-checking things they obviously just used.

### R4 — Unify "made it" through one path _(medium)_
A single `markMade({recipe | planEntry})` that (a) debits pantry by scaled
`recipe_ingredients`, (b) runs R3's auto-check, (c) writes the made-log, (d) bumps recipe
stats. Both the Planner and RecipeDetail buttons call it. Pantry stays correct regardless
of entry point. (iOS already does most of this in `AppState.markPlanEntryMade`; mirror the
web flow to it as the canonical spec.)

### R5 — Carry computed quantities on every recipe→grocery add _(small)_
Replace the hardcoded `quantity:1` (`Recipes.tsx:293`) with the shortfall quantity from R2.

### R6 — Write the cross-module contract down once, mirror to both clients _(process)_
The recurring parity churn is a symptom of behavior living in client code. Capture the
canonical semantics (shortfall math, match keys, mark-made side effects, provenance
auto-check) as a short spec both web and iOS implement against. Reduces future
"iOS parity" stories from re-derivation to a checklist.

---

## 5. Suggested PRD additions

These map cleanly to new stories (all web/TS-doable in-sandbox, unlike the remaining 41
Xcode/Gradle/prod-blocked stories):

- **US-NEW-A** Wire `unitNormalize` into `recipeShortfall` (R1) — unit-aware shortfall.
- **US-NEW-B** Shared `resolvePantryFood` + single `computeShortfall` (R2).
- **US-NEW-C** Auto-check grocery items on mark-made via `source_recipe_id` (R3) — the
  unfinished half of US-262.
- **US-NEW-D** Unify `markMade` across Planner + RecipeDetail (R4).

---

### Appendix — key file:line index
- Structured shortfall: `src/lib/recipeShortfall.ts:50,96,132,153`
- Presence-only shortfall: `src/components/recipes/RecipeDetailView.tsx:138`
- Plan→grocery generation: `src/lib/mealPlanner.ts:131`
- Mark-made debit (web): `src/pages/Planner.tsx:476-499`; RPC `deduct_food_quantity`
  (`migrations/20251008023303_*.sql:11`)
- Grocery→pantry: `src/pages/Grocery.tsx:237-328,371`
- Provenance stamp (write-only): `src/pages/Planner.tsx:138`, `src/contexts/GroceryContext.tsx:81-84`
- Unused converter: `src/lib/unitNormalize.ts`
- iOS analogues: `AppState.markPlanEntryMade`, `Utilities/{ShortfallCalculator,MealMadeStrategy,RecipeMatcher,RestockPredictor}.swift`, `moveCheckedToPantry`
