# EatPal module audit: AI Coach, insights & nutrition

Surveyed 2026-09-22 from the working tree at /home/user/empty-stage-starter. Read-only. Line
numbers are from this tree; items marked "verify" were read, not run.

## 1. Inventory

### LLM plumbing (one provider path)
- `supabase/functions/_shared/ai-service-v2.ts:79-87`: provider from env `AI_DEFAULT_PROVIDER`
  (default Claude). Standard = `DEFAULT_AI_MODEL` (fallback `claude-sonnet-4-5-20250929`),
  lightweight = `LIGHTWEIGHT_AI_MODEL` (fallback `claude-haiku-4-5-20251001`). OpenAI/Gemini
  branches exist. Non-streaming, no tool use, 3 retries with backoff.
- `AI_ENABLE_CACHING` is read (:86) and never used: no prompt caching. No per-call usage row is
  written anywhere (`ai_usage_logs` has zero writers in `supabase/functions`), although
  `20251010235000_ai_cost_tracking.sql` built the tables. Token cost is invisible per user.
- `_shared/ai-gate.ts`: auth + per-user rate limit (US-618). `_shared/safety.ts`: crisis block
  (`withSafetyRules`, coach only) and standing limits (`withStandingLimits`, generators).

### AI surfaces and the context each actually receives
| Surface | Client | Edge fn | Context the model sees |
|---|---|---|---|
| AI Coach chat | web `src/components/AIMealCoach.tsx`, iOS `Services/AICoachService.swift` | `ai-coach-chat` (Sonnet) | kid name, age, allergens, **counts** of safe/try-bite foods (`ai-coach-chat/index.ts:69-76`). Nothing else. |
| AI Generate Week | web `src/pages/Planner.tsx:216-290` | `ai-meal-plan` (Sonnet) | kid (whole object shipped from client), safe/try-bite foods with quantity>0, first 20 recipes, favorite_foods |
| Per-day suggestions | iOS `AIMealService.swift:124-230`, Android | `generate-meal-suggestions` (Sonnet) | richest prompt in the repo: pickiness, textures, flavors, recent meals w/ result, loved/refused ratings, expiring, on-hand, budget flag |
| Suggest foods | web `src/pages/Pantry.tsx:298` | `suggest-foods` (Haiku) | full kid profile incl. texture dislikes, disliked foods |
| Recipe from foods | web `EnhancedRecipeBuilder.tsx:212`, `RecipeBuilder.tsx:89` | `suggest-recipe` (Sonnet) | selected food names + kid profile |
| Recipes from pantry | web `src/pages/Recipes.tsx:450` | `suggest-recipes-from-pantry` (Haiku) | pantry foods + kid profile |
| Tonight Mode | web `TonightModeCard.tsx:82`, iOS `TonightModeService.swift` | `tonight-mode` (no LLM) | server reads foods/recipes/kids/plan itself, deterministic score |
| Weekly report | cron | `generate-weekly-report` (no LLM) | server aggregates plan/grocery/recipes |

Non-LLM "insights": `SmartInsights.tsx` (rules over plan results, on `/analytics`),
`InsightsDashboard.tsx` + `src/lib/insights.ts` (category coverage), `MotivationalMessage.tsx`
(random canned strings, :38/:80/:93), `MostRepeatedMealsCard`, `TodayMeals`,
`DailyMacrosSummary.tsx` (inside `GSAPCalendarMealPlanner`, catalog-backed via
`grocery_product_catalog`, GSAP:745). `MealIdeasPage.tsx` is static SEO content from
`src/lib/meal-ideas-content.ts`. `Nutrition.csv` (120 rows) is not imported by any code; it is
a legacy seed file. Expo (`app/`) has no AI surface at all. The `AI/` folder is Coolify
deployment docs only.

### Bugs and half-built things (ordered by user impact)
1. **`suggest-foods` and `suggest-recipes-from-pantry` call the AI service with the wrong
   signature.** `suggest-foods/index.ts:92` and `suggest-recipes-from-pantry/index.ts:149`
   pass `generateContent(promptString, {systemPrompt, taskType})`; the method takes
   `(AIRequest, taskType)` and dereferences `request.messages` (`ai-service-v2.ts:252,315`).
   That is a TypeError on every call, retried 3x, then a 500. The pantry fn also 500s first if
   no `ai_settings` row is active (:58-69). Both web buttons (Pantry "suggest foods", Recipes
   "from pantry") can never succeed. US-734 names the second; the first is not tracked. Verify
   with one invoke.
2. **InsightsDashboard crashes in family mode.** `isFamilyMode = !activeKidId` (:31) but the
   render reads `activeKid.name` (:76), `activeKid.allergens` (:184),
   `activeKid.profile_last_reviewed` (:296) unguarded. With kids >0 and "All kids" selected,
   `activeKid` is undefined and the page throws.
3. **AI Coach is context-blind.** The web client builds safe food names, try-bite names and
   recent meals (`AIMealCoach.tsx:245-259`) then sends only counts (:265-271); the full object
   goes into `ai_coach_messages.context_snapshot` (:326) for nobody to read. `recent_meals`
   carries date+slot but no food and no result. The kid's `disliked_foods`, `texture_dislikes`,
   `helpful_strategies`, `always_eats_foods`, `food_attempts`, `kid_food_ladder` never reach
   the model. iOS sends `pickinessLevel` (AICoachService.swift:64); the server ignores it.
   Result: "what should I make tonight?" gets generic advice.
4. **AI Generate Week loses recipes and wipes the week without review.** `ai-meal-plan/index.ts:144`
   maps a chosen recipe to its *first ingredient's* food id, so the plan shows "chicken" not
   "Chicken nuggets & rice" and `recipe_id` is never set. Unmatched names are silently dropped.
   Dates come from the model (`"date": "YYYY-MM-DD"`, :83) and are not validated against
   `startDate`. `Planner.tsx:281` deletes the kid's week before inserting, no preview, no undo.
   Foods with no tracked quantity are excluded (:34), so households that don't count pantry
   stock get a plan built from almost nothing. Allergen filter is a case-sensitive exact match
   (:35). US-745 (open) specifies the fix.
5. **Web QuickSuggestionsPanel is dead code against a changed contract.** It sends
   `{householdId, mealSlot, count}` and expects `{suggestions}` (`QuickSuggestionsPanel.tsx:95`);
   the fn requires `safe_foods` and returns a bare array. Not imported anywhere; US-727 deletes it.
6. **Coach history does not cross devices.** Web persists to `ai_coach_conversations/messages`;
   iOS keeps `messages` in memory only (no reference to those tables in `ios/`). A parent who
   asks on the phone and reopens on the laptop starts over.
7. **Macros panel.** `DailyMacrosSummary.tsx:21-41` shows kid calorie targets (1000+100*age), the
   weight branch (:31-34) computes the same number, and refused meals count toward intake. It
   contradicts `STANDING_LIMITS_BLOCK` ("never set calorie targets ... for a child") and is a
   poor fit for ARFID families. It also lives only in the GSAP planner US-727 removes.
8. `generate-weekly-report/index.ts:359` queries table `grocery_list`, which does not exist
   (tables are `grocery_items`/`grocery_lists`); grocery metrics are always 0. No web or iOS
   screen reads `weekly_reports`.
9. `generate-meal-suggestions/index.ts:165` sends its system prompt without
   `withStandingLimits`; every other generator wraps it. `weekly_budget` is reduced to a
   boolean (:157).
10. `AIMealCoach.tsx:327` records `claude-3-5-sonnet-20241022` as `model_used` when the fn
    omits a model. Wrong provenance in analytics.
11. `is_safe`/`is_try_bite` are household-level flags on `foods`, not per kid. Every AI prompt
    therefore treats one child's safe food as every child's.
12. No Siri/App Intent reaches the AI. `WhatsForDinnerIntent` (GroceryAppIntents.swift:170)
    reads the plan only; there is no "ask the coach" or "suggest dinner" intent.

## 2. Benchmark (brief)
- **Samsung Food**: saves recipes from anywhere, AI plans + lists, Vision AI calorie photos (Galaxy
  only). Complaints: planning is mostly manual drag-to-calendar, serving changes don't carry to
  the list, edits don't save, "Health Score" criticised for diet-culture language.
- **Ollie**: family-first; parents state loves/avoids per member, 10-minute Sunday plan, one-tap
  swap for busy nights, servings rescale the list. Top complaint: variety collapses to the same
  handful of meals.
- **Eat This Much**: hits macro targets closely; complaints are repetition, huge lists, and
  pantry items still appearing on the list.
- **Mealime**: fast, clean, curated not AI; doesn't know what's in the kitchen.
- **MyFitnessPal / Cronometer**: photo and voice logging; MFP's AI coach answers from the user's
  own diary; Cronometer wins on micronutrient depth. Photo logging is a convenience, not trusted.
- **ChatGPT-style / DishGen**: great at free-form recipe invention, but don't remember the
  household, don't write to a calendar or list, and happily invent ingredients nobody owns.

What EatPal can own that none of them do: a coach that knows each child's exposure history
(ladder, try-bites, refusals) and acts on the plan, list and pantry the family already uses,
with feeding-therapy guardrails instead of calorie goals.

## 3. Prioritized work

### P0 (broken or unsafe today)
- **P0-1 Fix the two broken generators.** Rewrite `suggest-foods` and
  `suggest-recipes-from-pantry` to `generateContent({messages}, 'lightweight')`, drop the
  `ai_settings` fetch, add a Deno unit test that calls each handler with a stubbed
  AIServiceV2. Evidence: bug 1. Effort S. Web. DB: none.
- **P0-2 Guard InsightsDashboard family mode.** Render family aggregate or prompt to pick a
  child; add a test with `activeKidId=null`. Bug 2. S. Web. DB: none.
- **P0-3 Give the coach real context, assembled server-side.** New `_shared/household-context.ts`
  that, from the gated user id, reads kids (full profile), per-kid ladder and last 14 days of
  `plan_entries` with food/recipe name and result, `food_attempts`, pantry (in-stock, expiring),
  recent recipes. Coach prompt receives it as a compact block; client stops shipping
  `kidContext`/`foods` (keep accepting it for shipped iOS builds, ignore when server context
  resolves). Evidence: bug 3; MFP's coach answers from the diary. M. Web + iOS (no client change
  needed for iOS to benefit). DB: none (reads).
- **P0-4 Make AI Generate Week reviewable and recipe-aware.** Return `{recipe_id|food_id|title}`
  per slot, validate dates server-side, show a draft diff before commit, keep the old week for
  undo. This is US-745's AC; do the review+recipe_id part first. Bug 4. M. Web now, iOS later.
  DB: none; `plan_entries.recipe_id` already exists.
- **P0-5 Retire kid calorie targets.** Replace targets in `DailyMacrosSummary` with food-group
  coverage (what InsightsDashboard already computes) and only count `ate`/`tasted`. Bug 7,
  safety policy. S. Web. DB: none.

### P1 (makes it the best family assistant)
- **P1-1 Tool-using coach ("act, don't advise").** Give `ai-coach-chat` Claude tool use with
  server-executed, RLS-scoped tools: `get_plan(range)`, `propose_plan_changes`,
  `add_to_grocery(items)`, `suggest_recipe(from_pantry)`, `log_try_bite`, `update_kid_note`.
  Writes return as *proposals* the client renders as confirm cards; nothing mutates without a
  tap. Evidence: every competitor's AI stops at text; Samsung/Ollie users complain planning
  stays manual. L. Web + iOS. DB additive: `ai_coach_actions(id, conversation_id, household_id,
  kind, payload jsonb, status, created_at, applied_at)` with RLS by household.
- **P1-2 Streaming + persistence parity.** SSE streaming from the coach; iOS reads/writes
  `ai_coach_conversations/messages` so history syncs. Bug 6. M. iOS + web. DB: none (add
  `household_id`, `kid_id` nullable columns to conversations if absent, additive).
- **P1-3 Variety guard in every generator.** Feed `MostRepeatedMeals` and last-21-day history
  into `ai-meal-plan` and `generate-meal-suggestions`; reject a draft that repeats a dinner
  within N days. Evidence: Ollie's and Eat This Much's #1 complaint is repetition. S-M. All.
  DB: none.
- **P1-4 Pantry-aware grocery handoff.** After a plan is accepted, the AI computes the shortfall
  against pantry and proposes list items tagged `added_via='ai_plan'`, `source_plan_entry_id`.
  Evidence: Eat This Much / Mealime lists ignore the pantry. M. Web + iOS. DB: none (columns
  exist on `grocery_items`).
- **P1-5 Weekly AI digest in-app.** Fix `grocery_list` -> `grocery_items`; add a Haiku
  summary paragraph ("Maya tasted 3 new foods; dinners repeated pasta 4x") on Home and in the
  email; surface `weekly_reports` on web Insights and iOS Progress. Bug 8. M. All. DB: additive
  `weekly_reports.ai_summary text NULL`.
- **P1-6 Siri / App Intents.** `AskCoachIntent` (spoken question -> dialog answer),
  `SuggestDinnerIntent` (Tonight Mode top pick, "add to plan?" confirmation). S-M. iOS. DB: none.
- **P1-7 Usage metering + prompt caching.** Write one row per call (endpoint, model, tokens,
  user, household) and enable Anthropic prompt caching on the static system + household block.
  Makes the Pro tier priceable and cuts coach cost on long threads. S. Backend. DB: existing
  cost-tracking tables; verify columns before use.

### P2
- **P2-1 Per-kid safe/try-bite status.** Additive `kid_food_status(kid_id, food_id, status,
  updated_at)` fed by the ladder; generators read it, `foods.is_safe` stays dual-written for old
  iOS builds. Bug 11. L. All.
- **P2-2 Photo "what did they eat" logging.** Reuse `FridgeRecognitionService` vision path to log
  plate results (ate/tasted/refused) rather than calories. M. iOS first.
- **P2-3 Proactive nudges.** Rules engine (SmartInsights) triggers a coach message: "try-bite
  success rate dropped this week, want a softer plan?" delivered as a notification. M.
- **P2-4 Retire `Nutrition.csv`** or import into the catalog; delete canned
  `MotivationalMessage` randomness in favour of data-driven messages. S.
- **P2-5 Expo parity** only if Expo stays a shipping surface; today it has no AI entry point.

## 4. AI as the glue across modules

Today each AI call is a silo: the client gathers a slice, the model answers once, and only
Generate Week writes anything back (destructively). Tonight Mode is the right pattern already:
the server reads its own context and scores deterministically.

Target contract, one shared context builder plus proposal-based writes:

| Module | AI reads | AI writes (always as a confirmable proposal) | Silo today |
|---|---|---|---|
| Kids | full profile, ladder rung, try-bite history, refusal notes | profile notes ("prefers crunchy"), next ladder step | coach sees name/age/allergens only |
| Planner | last 21 days w/ results, upcoming week, templates | draft week, single-slot swap, move/lock | only Generate Week writes; wipes week; no recipe_id |
| Recipes | household recipes, ratings, times_made, tags | new recipe from pantry, scale, save | suggest-* return JSON the user retypes; 2 of 3 fns broken |
| Pantry | in-stock items, expiring soon, depletion forecast | "use up" priorities, mark used after cook | web generators ignore expiring; Generate Week requires quantity>0 |
| Grocery | open list, recently bought | shortfall items tagged `added_via='ai_*'` | no AI write path to the list at all |
| Insights | rule-based insights, weekly_reports | narrative summary, nudges | insights never reach the coach; coach never produces insights |

Rules for the glue: server builds context from `auth.uid()` (never trust client-shipped
foods/kids); every write is a row in `ai_coach_actions` with `status=proposed` until the parent
taps apply; applied writes go through the same paths as manual edits (`addPlanEntries`,
`buildGroceryRow` with client uuid, so the web offline queue still works); no calorie or weight
targets for children anywhere; allergen filtering is enforced in code after the model
answers, not trusted to the prompt.

Sources: plantoeat.com/blog/2026/01/samsung-food-review-pros-and-cons,
mealthinker.com/blog/samsung-food-alternative, mealthinker.com/blog/ollie-meal-planner-review,
apps.apple.com/us/app/ollie-ai-family-meal-planner/id6480014476,
newyorkstreetfood.com/blog/eat-this-much-vs-mealime-which-meal-planner-wins-in-2026,
mealthinker.com/blog/eat-this-much-alternative, welling.ai/articles/myfitnesspal-vs-cronometer-2026,
nutrola.app/en/blog/can-myfitnesspal-scan-food-from-photos.
