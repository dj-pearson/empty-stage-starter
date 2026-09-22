# EatPal module audit: Meal Planner

Surveyed 2026-09-22 from `main` at ca6debe. Read-only. Line numbers are from that commit.
Story ids refer to `prd-household-planner.json` (HP), `prd-kitchen-loop.json` (KL) and `prd.json`.
Anything already owned by an open story is marked "owned by US-xxx" and not re-proposed; items with no story are marked NEW.

## 1. What exists today

### Web (`src/`), the platform with the most open work

| Feature | Evidence | State |
|---|---|---|
| Weekly grid, desktop | `src/components/GSAPCalendarMealPlanner.tsx` (1262 lines), mounted lazily by `src/pages/Planner.tsx:40` | Live. Drag/drop via GSAP Draggable (`:264`); moves a recipe's rows together (`:836-850`) |
| Weekly grid, phone width | `src/components/meal-planner/MobileMealPlanner.tsx`, `WeekStrip.tsx`, `FamilyMealCard.tsx`, `MealQuickAddDrawer.tsx` | Live under 1024px (`Planner.tsx:66`, `:607`) |
| Plan state + realtime | `src/contexts/PlanContext.tsx` | add/addMany/update/copyWeek/deleteWeek. **No single-entry delete** (`:40-66`) |
| Quick Build | `src/lib/mealPlanner.ts:16` `buildWeekPlan`, called at `Planner.tsx:181` | Random pick from household `is_safe` foods, round-robin try bites |
| AI Generate Week | `Planner.tsx:216`, edge fn `supabase/functions/ai-meal-plan/index.ts` | Per kid, food-level only |
| Recipe into a slot | `Planner.tsx:422` via RPC `schedule_recipe_to_plan` (one row per recipe food) | Then prompts missing ingredients (`:94`, `MissingIngredientsDialog`) |
| Result logging ate/tasted/refused | `Planner.tsx:465`; "ate" calls `deduct_food_quantity` by 1 | Live |
| Copy meal to another child | `Planner.tsx:527` | Live |
| Copy / clear week | `PlanContext.tsx:163`, `:208` | Live, no confirm, no undo (owned by HP US-725) |
| Templates: save / gallery / apply | `SaveMealPlanTemplateDialog`, `MealPlanTemplateGallery`, `ApplyTemplateDialog`, edge fn `manage-meal-plan-templates` | Desktop works through the GSAP toolbar (`GSAPCalendarMealPlanner.tsx:889-901`). **Phone width broken, see bug B1** |
| Variety fatigue banner + Twist sheet | `src/lib/varietyFatigue.ts`, `VarietyFatigueBanner.tsx`, `TwistMealSheet.tsx`, `varietyTwistPicker.ts` | Live on Home and Planner. Counting bug B5, swap bug B4 |
| Tonight Mode | `TonightModeCard.tsx` (Home), `TonightSuggestionsDialog.tsx`, `TonightCookDialog.tsx`, `src/lib/tonightMode.ts`, edge fn `tonight-mode` | Ranks recipes by pantry coverage, kid fit, allergens, variety; step-by-step cook view with timer. "Cook now" writes nothing to the plan (owned by HP US-738) |
| Kid voting | `KidMealVoting.tsx` (436 lines), `MealVotingCard.tsx`, `src/lib/mealVotesStore.ts`, tables `meal_votes`, `voting_sessions` (`supabase/migrations/20251110000004_meal_voting.sql`) | **Results render in the grid (`VoteResultsDisplay`), but no mounted screen lets a child cast a vote.** `KidMealVoting` has zero importers |
| Sibling Meal Finder | `src/pages/SiblingMealFinder.tsx`, `src/lib/siblingMealFinder.ts`, `PerKidPlateBreakdown.tsx` | Live; one-pan-four-plates (US-613) only reachable here, not from the grid |
| Public generator (lead magnet) | `src/pages/MealPlanGenerator.tsx`, `MealPlanGeneratorResults.tsx`, `src/lib/mealPlanGenerator/` | Anonymous; saves a `meal_plan_generations` row and an email capture. **Nothing carries the generated week into the account after signup** |
| Grocery from plan | `src/lib/mealPlanner.ts:131` `generateGroceryList` | Food-count vs `foods.quantity`, no recipe quantities (owned by HP US-736/737, KL US-676/680) |
| Leftovers, servings, recurrence, eating out | none; `grep -ri leftover src/` hits only the budget calculator and the public generator | Missing (owned by HP US-742) |

Dead code (owned by HP US-727, roadmap item 50): `CalendarMealPlanner.tsx` (830), `SwapMealDialog.tsx` (113), `AddMealToCalendarDialog.tsx` (193), `MealSuggestionCard`/`QuickSuggestionsPanel`. `KidMealVoting.tsx` is dead too and is **not** on US-727's list.

### iOS (`ios/EatPal/EatPal`), the App Store build, ahead of web on the planner

- `Views/MealPlan/MealPlanView.swift` (1572 lines): week strip + day chips, per-slot cards, drop foods from pantry (`:615` `dropDestination`), context menu with Made it / Undo made it (`:792-810`), delete with "restore ingredients" choice (`:888-901`), duplicate to dates / across week (`:1014-1026`), repeat weekly 1-8 weeks with undo (`:1065-1104`), copy week to another kid with allergen conflict preview (`:1412-1549`), empty-week template prompt (`:123-147`), save as template (`:398`), post-result 1-5 feedback (`MealFeedbackSheet.swift`, `AppState.swift:1267`), inline ladder rung logging (`:697-751`, US-608).
- `AIMealPlanView.swift`: suggestion list you accept one by one or all, budget-aware, adds missing to grocery (`:348-400`).
- `FridgePhotoSheet.swift`: plan from a fridge photo. `StarterTemplatesSheet.swift` + `Resources/StarterMealPlans.json` with allergen conflict check (`:115`).
- `AppState.swift:839` `addPlanEntry` queues to `OfflineStore` on network failure (US-492). Web has no plan queue.
- Tonight Mode: `Views/Dashboard/TonightModeCard.swift`, `Services/TonightModeService.swift`.
- Widget (`EatPalWidget/EatPalWidget.swift:6`) and Watch `TodayView.swift` show today's meals.
- Missing on iOS: variety fatigue / Twist (no Swift hits for "fatigue"), kid voting (no Swift hits for `meal_votes`), month/agenda views, Sibling Meal Finder.

### Expo (`app/(tabs)/meals.tsx`, 993 lines)
Retired by decision 2026-09-01; deletion is HP US-720 (blocked on the sandbox bulk-delete guard). Do not invest.

## 2. Bugs and half-built things seen in code (not covered by an existing story unless noted)

- **B1. Template apply throws on phone-width web.** `Planner.tsx:662-670` renders `MealPlanTemplateGallery` with an `onApply` prop; the component's required prop is `onSelectTemplate` (`MealPlanTemplateGallery.tsx:47`) and it calls it unguarded at `:209`. Tapping any template on a phone throws `onSelectTemplate is not a function`; nothing applies, and the page's own toast "Template applied to planner" never fires either. The desktop copy of the same block (`Planner.tsx:883-892`) is unreachable since US-719 removed its buttons. NEW, S.
- **B2. Quick Build and the food picker ignore the child's allergens.** `buildWeekPlan` (`mealPlanner.ts:24-25`) picks from every household food with `is_safe`, with no check against `Kid.allergens` or `disliked_foods` (`src/types/index.ts:41,55`). `FoodSelectorDialog`, drag/drop in the GSAP grid and `varietyTwistPicker.ts` have no allergen reference either. Only Tonight Mode and the AI edge fn filter. iOS checks at copy-to-kid and starter templates. In a two-kid house where one child has a peanut allergy and the other eats peanut butter, Quick Build can schedule it for the allergic child. NEW, S, **P0 safety**.
- **B3. AI Generate Week can still land an allergen, and drops recipes.** `ai-meal-plan/index.ts:33-40` filters the prompt list, but the name-to-id mapping at `:136-146` searches the unfiltered `foods`, so a model reply naming a sibling's food resolves. A recipe the model picks is collapsed to `recipe.food_ids[0]` (`:142-144`) and `recipe_id` is lost, so an AI week of recipes shows single ingredients. NEW, S. (Household-level generation itself is HP US-745.)
- **B4. Twist swaps one row of a multi-row recipe.** `schedule_recipe_to_plan` writes one row per recipe food; `TwistMealSheet` `onSwap` updates only `recipe_id` on the clicked entry (`GSAPCalendarMealPlanner.tsx:1254-1257`). The other rows keep the old recipe, and the swapped row keeps the old recipe's `food_id`, which is what grocery and shortfall read. Fold into HP US-724/725 acceptance criteria; the `meals` table (KL US-674) is the real fix.
- **B5. Variety fatigue inflates for multi-kid, multi-ingredient meals.** `varietyFatigue.ts:168-190` counts every plan row. One taco night = 4 ingredient rows x 2 kids = 8 recipe hits on one day, which crosses the 5-in-7-days "high" tier (`:160`) after a single dinner. Count distinct (recipe, date, slot). NEW, S.
- **B6. Family-mode copy/clear week does nothing.** With "all children" selected (`activeKidId === null`, `Planner.tsx:773`), each kid grid gets `onCopyWeek`/`onClearWeek`, and both handlers start with `if (!activeKidId) return` (`:383`, `:397`). The button silently no-ops. Pass the grid's `kidId`. NEW, S.
- **B7. Recipe drag moves every kid's copy.** The filter at `GSAPCalendarMealPlanner.tsx:838-842` has no `kid_id` test, so dragging Maya's pasta to Thursday also moves her brother's. Could be intended ("family meal") but it contradicts the per-kid grid it is rendered in. NEW, S (decide, then test).
- **B8. Scheduling a recipe reloads the whole plan table.** `Planner.tsx:350-357` and `:443-450` `select("*")` with no date window or household filter, then wholesale `setPlanEntries`, bypassing the US-538 window merge (`src/lib/planWindow.ts`). Also recipes with only structured ingredients and empty `food_ids` are silently refused (`:333`, `:431`). Owned in spirit by HP US-724; add both to its AC.
- **B9. "Ate" debits 1 unit per child.** `Planner.tsx:477-499`. Two kids eating the same dinner debit twice; "Made it" on iOS debits by recipe. Owned by HP US-738 / KL US-677, US-679.
- **B10. Week regenerate is delete-then-insert with no transaction.** `Planner.tsx:200-201`, `:283-284`. If the insert fails the week is gone; rollback restores only the insert. Owned by HP US-725 (confirm + undo); suggest a single RPC.
- **B11. `copyWeekPlan` duplicates.** `PlanContext.tsx:163-199` appends without checking the destination week; copying twice doubles every meal. It also carries three `@ts-expect-error` (roadmap item 61). NEW AC for HP US-743.
- **B12. `meal_votes` realtime channel is unfiltered** (`mealVotesStore.ts:176-180`): every vote event the user can see triggers a refetch. Minor, S.
- Quick Build ignores the ladder: `buildWeekPlan` round-robins `is_try_bite` foods (`mealPlanner.ts:71-78`) while `src/lib/ladderScheduler.ts` (US-599) already places due exposures beside a safe anchor, but only `useFoodLadder` calls it. See P1-1.

## 3. Benchmark

| App | What users value | Known complaints |
|---|---|---|
| Mealime | Tight "dinner this week + list" loop; 4.8 on iOS, 35k+ reviews | **Shutting down 21 Oct 2026**, moving users to Albertsons Meals Hub; no export |
| Plan to Eat | Drag-and-drop calendar of your own recipes, leftover scheduling, list from plan | No nutrition, no auto-planning; $49/yr |
| Paprika | Day/week/month views, notes like "double for leftovers", offline, one-time price | Planner is not connected to the list |
| Samsung Food (Whisk) | Free, big recipe graph, shared planner | Manual drag only, no autofill; servings changes don't reach the list; lost multi-device family sign-in after Samsung took over |
| Eat This Much | Autopilot: goals + budget + schedule produce a week, emailed with list | Adult macro focus, not family taste |
| Ollie | Family-first AI planning, "tell it what they won't eat", swap by chat | Repetition: users report the same few cuisines every week; shallow kid library |

What this means for EatPal: the category expects (a) a list that follows the plan, (b) leftovers and servings, (c) autofill you can edit, (d) shared household view. Ollie is the only direct competitor on picky eaters and its top complaint is repetition, which EatPal's variety-fatigue and food-chaining code already addresses on paper. Mealime's shutdown puts a large, loop-oriented audience in the market for about four weeks.

## 4. EatPal's angle

Every competitor plans *one* menu and treats a picky child as a filter. EatPal's data model already knows per-kid safe foods, try bites, ladders (`exposureLadder.ts`, `ladderScheduler.ts`), chains (`chainNetwork.ts`), texture preferences (`Kid.texture_preferences`) and per-kid plating (`platePlanner.ts`). The planner should be the place those become a dinner: **one cook, one pan, a plate per child, one exposure a day scheduled next to a safe food, and a weekly record of what moved.** Today those modules are reachable from the Food Chaining, Ladder and Sibling Meal Finder pages but not from the grid, and Quick Build uses none of them.

## 5. Prioritized list

Effort S < 1 day, M 2-5 days, L > 1 week. Platforms: W web, I iOS.

### P0: table stakes and safety

| # | What | Why / evidence | Effort | Platforms | DB |
|---|---|---|---|---|---|
| P0-1 | Allergen and disliked-food guard in one `canServe(kid, food)` used by Quick Build, food picker, drag/drop, Twist, templates, AI mapping | B2, B3. Allergy is the one mistake a family planner cannot make | S | W, edge; I already partial | none |
| P0-2 | Fix phone-width template apply | B1 | S | W | none |
| P0-3 | Fix family-mode copy/clear and fatigue counting | B6, B5 | S | W | none |
| P0-4 | Single-meal delete, swap, log from a cell with undo | Web has no single delete (`PlanContext.tsx:40-66`); iOS has it | M | W | owned by HP US-725 |
| P0-5 | List follows the plan: recipe quantities x servings minus pantry, auto-update on swap/remove | Paprika and Samsung Food's top complaint; `mealPlanner.ts:131` counts foods | L | W then I | owned by HP US-736/737, KL US-676/680 |
| P0-6 | Leftovers, servings, recurrence, eating out | Plan to Eat's differentiator; zero code today | M | W, I | owned by HP US-742 (additive columns on `plan_entries` or `meals`) |
| P0-7 | One `planMeal` primitive + household `meals` row | Fixes B4, B8, B9 at the source | L | W then I | owned by HP US-724, KL US-674/675 (additive `plan_entries.meal_id`) |
| P0-8 | Carry the public generator's week into the account at signup | `MealPlanGeneratorResults.tsx:64-72` saves an anonymous row; nothing imports it. Mealime refugees land here | M | W | read `meal_plan_generations` by `session_id`; no schema change |
| P0-9 | Web offline queue for plan writes | iOS queues (`AppState.swift:849`); web queues grocery only (CLAUDE.md step 5) | M | W | needs client uuid on insert, same pattern as `buildGroceryRow`; `plan_entries.id` default stays |

### P1: best in class for families with picky eaters

| # | What | Why / evidence | Effort | Platforms | DB |
|---|---|---|---|---|---|
| P1-1 | Quick Build v2 = "family dinner + per-kid plates": pick one household recipe, run `platePlanner` per child, place one due ladder exposure per child via `ladderScheduler` | All three libs exist and are tested but none feed `buildWeekPlan` (`mealPlanner.ts:16`). This is the thing no competitor can copy quickly | M | W, then I | none beyond P0-7 |
| P1-2 | Kid voting that works: a kid-mode screen (big pictures, 3 choices per dinner) on web and iOS, results feed Quick Build weights | `KidMealVoting.tsx` unreachable; iOS has none; results already render (`VoteResultsDisplay`) | M | W, I | tables exist; check RLS lets a household member write for a kid |
| P1-3 | Variety fatigue on iOS + fatigue-aware autofill | Ollie's top complaint is repetition; iOS has no fatigue code | M | I | none |
| P1-4 | Tonight Mode closes the loop: Cook now writes the meal, results sheet after dinner per child, missing items go in with real quantity/aisle | `TonightSuggestionsDialog.tsx:62-94` records nothing and adds items as qty 1 "snack" | S-M | W, I | owned partly by HP US-738; add the per-child result step NEW |
| P1-5 | Weekly "what moved" recap in the planner: exposures tried, new foods accepted, meals refused twice | Ladder weekly text exists (`ladderWeekly.ts`, `ladderWeeklyText.ts`); planner shows none | S | W, I | none |
| P1-6 | Range/month/agenda views, copy from any week without duplicates | Paprika has day/week/month; B11 | M | W | owned by HP US-743; add B11 dedupe |
| P1-7 | Shared household view + partner notifications, ICS feed | Samsung Food lost multi-device family sign-in; opening for a shared plan | M | W, I, edge | owned by HP US-747/748 |
| P1-8 | Keyboard drag and drop, replace GSAP | a11y and bundle size | M | W | owned by HP US-744/727 |
| P1-9 | Mealime import (CSV/URL paste of saved recipes) and a comparison landing page before 21 Oct | Mealime has no export; competitors already publish switch guides | S-M | W | none |

### P2: moonshots

| # | What | Why | Effort | Platforms | DB |
|---|---|---|---|---|---|
| P2-1 | Chat edits to the week ("no fish this week, Leo has soccer Tue/Thu") that produce a diff to accept | Ollie and Eat This Much autopilot, but grounded in per-kid safety data | L | W, I, edge | none; log accepted diffs for evaluation |
| P2-2 | Food-chaining route planner: pick a target food, planner schedules a 3-4 week chain from `chainNetwork.ts` into real dinners | Clinical feeding-therapy method no consumer app automates | L | W, I | additive `plan_entries.chain_target_food_id` or a join table |
| P2-3 | Clinician share of the plan + outcomes | KL US-688 covers the ladder report; extend to plan adherence | M | W, I | read-only share token table with RLS |
| P2-4 | Live Activity / Watch "tonight" with per-child plate cards | Widget and Watch already show today's meals | M | I | none |
| P2-5 | Budget-aware autofill using captured prices | HP US-749 captures prices; planner can then target a weekly spend | L | W, I | depends on US-749 |

## 6. Touchpoints with other modules

| Module | Handoff | State |
|---|---|---|
| Recipes | Schedule recipe into slot (`schedule_recipe_to_plan`) | Works; expands to N rows (B4); `food_ids`-empty recipes refused (B8). Structured-ingredient canon owned by HP US-722 |
| Recipes | Twist / swap picks another recipe | Broken for multi-row recipes (B4) |
| Recipes | Cook mode from the plan | Web: only from Tonight Mode (`TonightCookDialog.tsx`); no "cook" button on a planned meal. MISSING |
| Grocery | Sync from plan (`mealPlanner.ts:131`) | Food counts, not recipe quantities; owned by HP US-736/737 |
| Grocery | Missing ingredients on schedule (`Planner.tsx:94-139`) | Works, stamps `source_recipe_id` / `added_via` which nothing reads (roadmap item 29) |
| Grocery | Tonight missing items (`TonightSuggestionsDialog.tsx:78-94`) | qty 1, category "snack", bypasses `addGroceryItemsMerged`. BROKEN (duplicates) |
| Pantry | "Ate" debits 1 per kid (`Planner.tsx:477`) vs iOS "Made it" by recipe | Inconsistent; owned by HP US-738, KL US-677/679 |
| Pantry | Stock warning on Quick Build (`Planner.tsx:141-170`) | Toast only; `depletionForecast.ts` exists but only `SmartRestockSuggestions` uses it. Owned by HP US-746 |
| Kids / food tracking | Result logging -> `food_attempt_id` | Web writes result; iOS adds 1-5 feedback + ladder log. Web has no feedback sheet. MISSING on web |
| Kids / ladder | Due exposures into plan (`ladderScheduler.ts`) | Wired in `useFoodLadder` only, not Quick Build or AI week. MISSING (P1-1) |
| Kids / allergens | Guard on every add path | Only Tonight Mode and iOS copy/templates. BROKEN (P0-1) |
| AI coach | Coach suggestions -> plan | `AIMealCoach.tsx` and `AICoachService.swift` exist; no "add to plan" handoff found in the planner. MISSING |
| Nutrition | GSAP grid loads `nutrition` table per mount (`GSAPCalendarMealPlanner.tsx:731-750`) for kid age/weight | Shown in the grid only; not used by any generator |
| Home | TodayMeals, Tonight card, MostRepeatedMeals, fatigue banner | TodayMeals reads `food_ids` not `food_id` (owned by HP US-726) |
| Household | Realtime per household (`PlanContext.tsx:84`) | Works. Adults cannot be planned for (owned by HP US-740) |
| Notifications | `schedule-meal-reminders` edge fn | Owned by HP US-747 |
| Onboarding / public generator | Generated week -> account | MISSING (P0-8) |

## Sources
- [Mealime is shutting down on October 21 (All Things AI)](https://allthingsn.com/blogs/mealime-shutting-down-no-export-what-to-use-instead/)
- [Mealime is Moving (Plan to Eat)](https://www.plantoeat.com/blog/2026/09/mealime-is-moving-heres-your-best-meal-planning-alternative/)
- [Mealime Review 2026 (Sunrise Digest)](https://thesunrisedigest.com/eat/mealime-review-2026/)
- [Paprika vs Plan to Eat (FoodiePrep)](https://www.foodieprep.ai/blog/paprika-vs-plan-to-eat)
- [Paprika App Review (Plan to Eat)](https://www.plantoeat.com/blog/2023/07/paprika-app-review-pros-and-cons/)
- [Samsung Food alternative (MealThinker)](https://mealthinker.com/blog/samsung-food-alternative)
- [Samsung Food Review (Plan to Eat)](https://www.plantoeat.com/blog/2026/01/samsung-food-review-pros-and-cons/)
- [Ollie review (MealThinker)](https://mealthinker.com/blog/ollie-meal-planner-review)
- [Ollie on the App Store](https://apps.apple.com/us/app/ollie-ai-family-meal-planner/id6480014476)
- [Eat This Much on the App Store](https://apps.apple.com/app/id981637806)
