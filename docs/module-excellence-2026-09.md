# Module excellence and cross-functionality plan (2026-09-22)

Eight read-only audits of `main` at ca6debe, one per module plus one on how the
modules work together. The full reports, with `file:line` evidence, competitor
benchmarks and complete P0/P1/P2 backlogs, are in `docs/module-excellence/`. This
page is the decision layer: what to fix first, what "best" means for each module, and
the architecture that makes the modules one product instead of seven.

Items already owned by open stories in `prd-household-planner.json` (HP),
`prd-kitchen-loop.json` (KL) or `prd.json` are cited, not re-proposed.

## The one-paragraph version

EatPal's engine is ahead of its product. The exposure ladder, ladder scheduler,
per-kid plate planner, food-chain network, inventory ledger, shared catalog and
mark-made RPCs all exist and are tested. Almost none of them are wired into the
places parents actually tap. "Safe" is still one household flag rather than a fact
about each child, so every module treats one child's safe food as every child's. Web
calls little of the server loop that iOS uses, and the joins between modules
("is this the same food?", "do I have enough?") are re-implemented in at least 15
places across TS, Swift and SQL. The fastest route to "best in class" is not new
features. It is connecting what is already built, per child, through one set of
shared rules.

## 1. Fix first: safety and trust

Found by the audits, then re-read in code for this page. None needs a feature
decision. S1 and S2 are security findings and are described only by reference here,
because this repository is public; details are with the repository owner.

| # | Problem | Where | Confirmed | Needs migration |
|---|---|---|---|---|
| F1 | Re-saving the web intake questionnaire erases a child's allergens, severity, dislikes and textures: the form never loads the saved profile and writes its blank state over it | `src/components/ChildIntakeQuestionnaire.tsx:43`, `:207`; opened without a `key` at `src/pages/Kids.tsx:179` | yes, read | no |
| F2 | Web Quick Build never checks the child's allergens; it picks from every household food marked safe | `src/lib/mealPlanner.ts:24` via `src/pages/Planner.tsx:189` | yes, read | no |
| F3 | AI Generate Week filters allergens out of the prompt, then maps the reply against the unfiltered food list; allergen match is case-sensitive | `supabase/functions/ai-meal-plan/index.ts:35`, `:139` | yes, read | no |
| S1 | Security finding in a pantry RPC | withheld | yes, read | function replace, same signature |
| S2 | Security finding in an edge function | withheld | yes, read | no |
| F4 | Removing a food from the pantry cascades into that child's meal logs, try-bite attempts and ladder progress | FKs with `ON DELETE CASCADE` on `foods.id`, e.g. `20260801000000_kid_food_ladder.sql:24` | FKs yes; UI delete paths per `pantry.md` | additive `foods.archived_at` |
| F5 | Accepting a co-parent invite leaves the joiner in two households; `get_user_household_id` picks one with `LIMIT 1` and no order, so the joiner may see an empty household and write rows the partner never sees | `20260909000000_household_seat_limit.sql:174`, `20251008035900_*.sql:9-12` | SQL read; not yet reproduced | function replace (+ optional nullable column) |
| F6 | Live iOS app marks every purchased food as safe for the child (fixed on web by US-803) | `AppState.swift:1928`, `ScanReceiptSheet.swift:256`, `PantryQuickAddBar.swift:209` | per `pantry.md` | no, iOS release |
| F7 | Weekly report shows a hardcoded "up from 65% last week" | `src/components/WeeklyProgressReport.tsx:124`, `:136` | per `kids-progress.md` | no |
| F8 | Kid calorie targets on the planner macros panel contradict our own standing AI safety limits | `src/components/DailyMacrosSummary.tsx:21-41` | per `ai-insights.md` | no |

Proposed grouping: F1-F3 + S2 on one branch (web and edge only, no migration). S1,
F4 and F5 each get their own migration branch, run through
`scripts/dev/local-sql-suite.sh` with a `has_function_privilege` or behaviour
assertion. F6 rides the next iOS release.

## 2. Two dated market windows

- **Mealime shuts down on 21 Oct 2026 with no export** (per coverage cited in
  `meal-planner.md`). Its users want a plan-to-list loop. A Mealime import path and a
  comparison page before that date, plus carrying the public `/meal-plan` generator's
  week into the account at signup (nothing does today), is the cheapest acquisition
  on this page.
- **Food Hopper says its practitioner version ships late 2026**, with per-client
  exposure tracking. That is the therapist angle. The clinician ladder report exists
  on web only; shipping it on iOS (KL US-688) is the answer.

## 3. What "best" means, module by module

Each block: the bar to clear, where EatPal stands, and the few moves that matter most.
Everything else is in the module report.

### Meal Planner: `module-excellence/meal-planner.md`

**Bar:** Plan to Eat's calendar and leftovers, Paprika's month view, a list that follows
the plan (the top complaint about Paprika and Samsung Food), editable autofill. Ollie is
the only direct picky-eater rival, and its top complaint is repetition.
**Standing:** iOS is ahead of web (single-meal delete, Made it with undo, repeat weekly,
feedback sheet, offline queue). Web bugs: phone-width template apply throws
(`Planner.tsx:662` passes `onApply`, the gallery calls `onSelectTemplate`); family-mode
copy/clear week silently no-op; variety fatigue counts every row, so one taco night for
two kids reads as "high" fatigue; Twist swaps one row of a multi-row recipe; kid voting
has no mounted screen.
**Moves:** (1) one `canServe(kid, food)` guard on every add path (F2/F3). (2) Quick
Build v2: one household dinner, `platePlanner` per child, one due ladder exposure per
child beside a safe food via `ladderScheduler`. All three libraries exist; nothing calls
them from a generator. Nobody else can ship this quickly. (3) The `meals` row and one
`planMeal` primitive (HP US-724, KL US-674) that fix the row-per-ingredient bugs at the
source. (4) Leftovers, servings, recurrence (HP US-742).

### Recipes: `module-excellence/recipes.md`

**Bar:** import that works first time, including TikTok/Instagram (ReciMe, Honeydew);
a cook mode you trust with messy hands (Crouton, Mela); a library that never loses a
recipe (Paprika). None of them knows who is eating.
**Standing:** iOS is the better keeper (quantities kept on import, live scaling, share
extension). Web favorites never save (`is_favorite` missing in `RecipesContext.tsx:334-359`,
`:439-463`); kid assignment is collected and dropped (no `assigned_kid_ids` column);
`kid_friendly_score` is never computed so "Kid approved" is always empty; the web
importer flattens structured quantities into a string; web detail shows no quantities and
the scaler only changes a label; web add-to-planner writes one row per ingredient per
kid and refuses recipes with no linked foods.
**Moves:** (1) the half-day fixes: favorites, planner add as one entry per kid with
`recipe_id`. (2) One schema.org-first parser returning structured ingredient rows, LLM
as fallback only (HP US-733); every downstream module is only as good as these rows.
(3) Per-kid verdict on every recipe, derived from `plan_entries.result`, votes and the
ladder, replacing the dead score. (4) Social video import.

### Grocery: `module-excellence/grocery.md`

**Bar:** OurGroceries' sync speed, AnyList's auto-categorise and recipe-to-list merge,
Kroger's aisle order, one-tap retailer handoff.
**Standing:** iOS already has walk order, shopping mode with a Live Activity, Watch,
Siri, voice/photo add. Web never selects a store (`selectedStoreLayoutId` set nowhere,
`Grocery.tsx:132`), so aisles sort by insertion order; quantities cannot go below 1; the
Instacart dialog cannot work (`instacart.ts:427` reads `process.env` in the browser) and
the delivery function is a simulation. iOS has no list picker, so a household's separate
web lists merge on the phone (`DataService.swift:502`).
**Moves:** (1) web store + walk order, auto-categorise, fractional quantities, hide the
dead Instacart button; iOS list picker. (2) Recipe-aware list from the plan with pantry
subtraction, as a projection that updates when the plan changes (HP US-736/737). (3)
The picky-eater layer nobody else has: safe foods that never run out, a per-kid
exact-product lock with substitution rules, allergen warnings at add and at scan.
(4) Instacart via its server-side `products_link` endpoint.

### Pantry: `module-excellence/pantry.md`

**Bar:** every app in the category loses users to manual upkeep. Winners get stock in
without typing (Cooklist's loyalty cards and receipts) and out without typing (cooking
deducts, expiry prompts "used or tossed?"). SuperCook skips exact counts entirely.
**Standing:** `foods` is both the inventory and the child's food catalogue, which is
where F4 comes from, and the free plan's 50-food cap counts both. Web receipt scan
ignores its own match and inserts duplicates, dropping prices; web has no expiry UI; low
stock is `<= 2` whatever the unit; three separate barcode stacks.
**Moves:** (1) archive instead of delete (F4). (2) One purchase-crediting rule by item
id, once (HP US-739). (3) Default to have/low/out, exact counts optional. (4) Safe-food
stockout alerts: a kid's safe food running low outranks everything else.

### Kids and picky-eater progress: `module-excellence/kids-progress.md`

**Bar:** what feeding therapists and parents want: exposures offered and foods accepted
(Division of Responsibility), not "% of meals eaten"; brand and prep matter (food
chaining); a clinician report readable in two minutes; a caregiver card for grandparents
and school (Pitaya); a screener at onboarding (Kids Eat in Color).
**Standing:** the ladder policy is pure, tested and mirrored in Swift. But per-kid
"safe" does not exist yet (KL US-678 open), the web ladder sits behind an
`exposure_ladder` flag no migration seeds (check prod), achievements live in three stores
that never meet, and detailed tracker logs never move the ladder.
**Moves:** (1) F1, F7, seed the flag. (2) KL US-678 per-kid disposition, keeping
`foods.is_safe` as a trigger-maintained rollup for shipped iOS builds. This one change
unblocks most of section 4. (3) Every attempt goes through the ladder policy. (4)
Clinician report on iOS before Food Hopper's practitioner launch.

### AI Coach and insights: `module-excellence/ai-insights.md`

**Bar:** every competitor's AI stops at text and forgets the household. None combines
per-child exposure history with feeding guardrails.
**Standing:** the Pantry "suggest foods" and Recipes "from pantry" buttons always fail
(`suggest-foods/index.ts:92`, `suggest-recipes-from-pantry/index.ts:149` call
`generateContent` with the wrong signature). InsightsDashboard crashes with "All kids"
selected (`InsightsDashboard.tsx:76`). The coach receives name, age, allergens and two
counts; the client builds a richer context and saves it where nothing reads it. No usage
logging, no prompt caching.
**Moves:** (1) fix the two generators and the family-mode crash. (2) Build coach
context on the server from `auth.uid()`. (3) A coach that proposes plan, list and pantry
changes as confirm cards, applied through the same write paths as manual edits. (4)
Allergen filtering in code after every model answer, never prompt-only.

### Household and ambient surfaces: `module-excellence/household-platform.md`

**Bar:** the second parent is in within a minute of signup and the list syncs in
seconds (OurGroceries). Cozi's 2025-26 reviews punish exactly our F5 and widget bugs.
**Standing:** native Swift is the product (1.0.9 in the store, 32 commits to `ios/`
since June vs 3 to `app/`, HP US-720 retires Expo); put no effort into Expo. Server push
sends only through Expo's service, which does not accept the raw APNs tokens the live
app registers, and no cron runs the schedulers (HP US-747). The widget shows yesterday if
the app was not opened after midnight; its streak is hardcoded to 0.
**Moves:** (1) F5. (2) An APNs sender plus cron. (3) Siri and Watch writes through the
offline queue. (4) Invite the partner during onboarding, and collect safe foods and
allergens there.

## 4. Cross-functionality: one loop

The loop EatPal should run, and no competitor runs for picky eaters:

kid preferences -> plan -> recipe -> shortfall vs pantry -> list -> shop -> pantry
restock -> cook -> pantry debit + per-kid outcome -> ladder progress -> better
suggestions

Today, per `module-excellence/cross-functionality.md` section 1: of 15 handoffs, web runs
about 4 automatically and correctly. The server has most of the parts; web calls few of
them (ledger writes behind flags that default off, `InventoryContext.tsx:298-299`; web
never calls `rpc_mark_meal_made`; only iOS writes `grocery_item_sources`). All five core
findings of the June review (`docs/cross-module-data-flow-review-2026-06-03.md`) are
still open.

### Seam bugs

- Web check-off overwrites the pantry unit: 2 lb plus 1 pack becomes "3 pack"
  (`Grocery.tsx:359-364`, `:480-485`).
- A second parent's "cooked" debits nothing the first parent added: both mark-made RPCs
  scope by `user_id`, not `household_id` (`20260614000001_mark_meal_made_v2.sql:75,83,100`),
  and the idempotency check is per user, so two parents can debit one meal twice.
- "Made it" means four different things on web (Planner "ate", RecipeDetail, Tonight
  cook, quick-log).
- A planner "tasted" writes `food_attempts` but never moves the ladder
  (`useFoodLadder.ts:304-329`).
- Shortfall compares units as exact strings, so any unit mismatch reads as "none on
  hand" (`recipeShortfall.ts:96`, and the Swift `ShortfallCalculator.swift:96`).

### Three rules that stop the drift

1. **Pure arithmetic lives in one shared TS module with a Swift mirror pinned by JSON
   fixtures**: matching, units, shortfall, category/aisle. This is how
   `exposureLadder.ts` / `ExposureLadderPolicy.swift` already work. A vitest guard fails
   any page that compares food names inline.
2. **Anything that writes two modules' tables is one household-scoped, idempotent
   Postgres RPC**: cook, purchase, plate outcome. Atomic, and identical for iOS builds
   already in the store.
3. **Kid acceptance has one source of truth**: per-kid disposition (KL US-678), read
   through a `kid_food_acceptance` view by the planner, AI, grocery and pantry, never
   `foods.is_safe` directly.

### One identity per food (additive)

The id columns exist (`foods.canonical_id`, `grocery_items.item_id`,
`recipe_ingredients.food_id`) but nothing fills them at write time, and brand has no link.
Release N, server only: a `food_aliases` table; `BEFORE INSERT` triggers that fill
`grocery_items.item_id` and `recipe_ingredients.food_id` when null (old iOS inserts get
linked with no app change); `kid_food_preferences(kid_id, food_id, catalog_id, stance)`
backfilled from the `kids.*_foods` arrays, which stay and are mirrored for shipped
clients; the `kid_food_acceptance` view. N+1: clients write the ids and read the view.
N+2, after `MIN_SUPPORTED_IOS_BUILD` moves: stop mirroring.

### Events instead of hand-wiring

One `domain_events` outbox table, written only inside the action RPCs: `meal_planned`,
`item_purchased`, `meal_cooked`, `plate_outcome_logged`, `food_accepted`, `stock_low`,
`item_resolved`. Each has named subscribers (full table in the report), plus one generic
reverse-by-ref undo. No module writes another module's table except as a listed
subscriber.

### Top 10 connected moments, by value over effort

| # | Moment | Effort |
|---|---|---|
| 1 | "You already have it" is true: unit-aware shortfall, reusing `groceryMerge.requiredAfterStock` | S |
| 2 | Checking off groceries restocks the pantry correctly on every device | S |
| 3 | Either parent taps "cooked" and the pantry updates: household-scoped mark-made v3, with the S1 fix | S |
| 4 | One web "Cooked it" button that does what iOS does (port `MealMadeStrategy`) | M |
| 5 | Plan to an aisle-sorted list minus the pantry in one tap, kept in sync with the plan | M-L |
| 6 | Logging "tasted" in the planner moves that child's ladder | S-M |
| 7 | The list carries each kid's exact safe-food brand ("Maya's Annie's"), checked at scan | M |
| 8 | Safe-food runway: "dino nuggets run out Thursday; Leo has no other safe protein" | M |
| 9 | "What can I make tonight", ranked by which kids will eat it | M |
| 10 | Suggestions improve as progress lands: AI and Quick Build read per-kid acceptance and pair a due exposure with that child's safe food | M |

The ambient version of 1+5, "Tonight: tacos, missing tortillas [Add both]" on the
widget, a 4pm push and Siri, reuses `ShortfallCalculator.swift`, which no ambient surface
calls today.

### Testing the loop

Shared JSON fixtures run by Vitest and XCTest (KL US-682); one SQL walk of the whole loop
with two parents in one household, including undo and a replay of what 1.0.9 writes;
privilege assertions on every loop RPC; one web integration walk with the ledger flags
both off and on; one Playwright happy path. Details in the report, section 6.

## 5. Proposed order

| Wave | Contents | Why this order |
|---|---|---|
| 0, now | Section 1: F1-F3 + S2 (one branch), then S1, F4, F5 (one migration each); F6 in the next iOS build | Safety and trust before growth |
| 1, before 21 Oct | Mealime import + comparison page; public generator week carried into the account; recipe favorites and planner add; web store/aisle order and fractional quantities; fix the two AI generators; seed the ladder flag | Cheap, visible, and lands while Mealime users are choosing |
| 2 | Moments 1-4; purchase crediting by item id (HP US-739); KL US-678 per-kid disposition; the identity triggers | The loop's foundations; per-kid truth unblocks everything after |
| 3 | Moments 5-6 and 10; Quick Build v2; one parser with structured rows; server-built coach context | The differentiator: one dinner, a plate per child |
| 4 | Moments 7-9; clinician report on iOS; coach proposals; APNs push; widget "tonight + missing" | Retention and the therapist channel |

## 6. Decisions for the owner

1. **Seats.** Free and Pro get one household seat, so co-parent sharing needs Family
   Plus. The household audit argues Pro should include two; AnyList prices sharing per
   household. Pricing call.
2. **Recipe drag in the planner** moves every child's copy (`GSAPCalendarMealPlanner.tsx:838-842`).
   Intended "family meal", or a bug? It decides a test.
3. **Production flags.** Is `exposure_ladder` on in the prod `feature_flags` table? If
   not, the web ladder and Safe Food Insurance are invisible to every user.
4. **External cron.** Does anything outside the repo (Coolify) run the notification
   schedulers? The repo shows nothing.

## Not verified

Everything here comes from reading code. Nothing was run against a live database or on a
device, and no Mac build was made. F1-F3, S1, S2 and the F4 foreign keys were re-read for
this page; F5 needs a repro in `local-sql-suite.sh` before a fix. Competitor claims come
from the review and comparison articles linked in each report, not from our own testing.
