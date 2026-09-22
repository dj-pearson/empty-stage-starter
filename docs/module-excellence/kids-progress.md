# Module audit: Kids & picky-eater progress (EatPal)

Audited 2026-09-22, read-only. Surfaces: web (`src/`), Expo (`app/`, which has no kid screens at all: tabs are index/lists/meals/pantry/profile/recipes/scan), native iOS (`ios/EatPal/EatPal`).

## Verdict

The engine is further along than the product. `src/lib/exposureLadder.ts` (8 SOS-style rungs, refusal steps down, auto-pause after 2 refusals, 7-day rest after distress), `ladderScheduler.ts`, `safeFoodRisk.ts`, `platePlanner.ts` and `clinicianLadderReport.ts` are pure, tested, and mirrored in Swift (`Ladder/ExposureLadderPolicy.swift`). What stops it being the best feeding-therapy companion is that **"safe" is still a household flag, not a per-child fact** (`foods.is_safe`, `src/types/index.ts:11`). The ladder knows per-kid truth (`kid_food_ladder`), but the planner, AI coach, grocery, pantry, achievements and the Kids page all read the household boolean. Second problem: on web the ladder is behind a flag no migration seeds. Third: several progress surfaces show numbers that are invented or wrong.

## 1. Inventory today

| Area | Web | iOS (live) | Data |
|---|---|---|---|
| Kid profile + realtime | `KidsContext.tsx` (optimistic CRUD, plan-limit gate :93, photo cleanup :160) | `Views/Kids/KidsView.swift`, `KidProfileEditorView.swift` | `kids` (+ `kid_allergen_change_log`, `kid_growth_events`) |
| Intake questionnaire | `ChildIntakeQuestionnaire.tsx` (7 steps, auto pickiness/texture scores) | Fields edited in `KidProfileEditorView`, no questionnaire | writes `allergen_severity`, `cross_contamination_sensitive`, `preferred_preparations`... |
| Food tracker (detailed attempts) | `FoodSuccessTracker.tsx` (stage, outcome, moods, bites), `DetailedTrackingDialog.tsx:92` | none (no mood/stage sheet) | `food_attempts`, trigger `check_and_unlock_achievements` -> `kid_achievements` |
| Exposure ladder | `FoodLadderBoard.tsx`, `useFoodLadder.ts` (788 lines, quick-log, scheduler :620-740), `LadderQuickLogControls.tsx` | `FoodLadderView.swift`, `LadderQuickLogControls.swift`, offline queue (`LadderSyncOps.swift`) | `kid_food_ladder` (20260801000000), cap of 3 due exposures by trigger |
| Food chaining | `FoodChainingRecommendations.tsx` (rpc `get_food_chain_suggestions`, `calculate_food_similarity`) | `FoodChainingView.swift` | `food_properties`, `food_chain_suggestions` |
| Safe Food Insurance (slipping safe food) | `SafeFoodInsuranceSection/Card.tsx`, `useSafeFoodInsurance.ts` | **none** | localStorage dismissals |
| Win Network (anon community wins) | `WinNetworkPanel.tsx`, flag `picky_win_network` seeded false | none | `chain_network_*` |
| Achievements | `AchievementsView.tsx` (computed client-side), `kid_achievements` read in FoodSuccessTracker:185, written by KidMealBuilder:128 | `BadgeService.swift` -> `kid_badges` | **three badge stores** |
| Weekly report | `WeeklyProgressReport.tsx` + ladder narrative (US-604) | `ProgressDashboardView.swift` WeeklyReportsTab, `JoyScoreChart.swift` | plan_entries |
| Clinician ladder report | `LadderReportDialog.tsx`, `clinicianLadderPdf.ts` | **none** (US-688 open) | food_attempts + ladder |
| Sibling meal finder / per-kid plating | `SiblingMealFinder.tsx`, `siblingConstraintSolver.ts`, `PerKidPlateBreakdown.tsx`, `platePlanner.ts` | none | kid string arrays |
| Kid meal builder | `KidMealBuilder.tsx` | none | `kid_meal_creations` |

## 2. Bugs and half-built things (verified in code)

1. **Intake questionnaire wipes existing data (safety).** `ChildIntakeQuestionnaire.tsx:42-60` initialises every field empty and never loads the kid (no fetch, no `useEffect`). `handleSubmit` (:163-200) writes `allergens: formData.allergens` etc. A parent who set allergens in ManageKidsDialog, then clicks "Complete Profile" (`ChildProfileCard.tsx:128`, shown whenever completion < 80%) and saves without re-ticking, erases the child's allergens. It is also rendered without a `key` (`Kids.tsx:179`), so opening it for a second child shows the first child's answers and step. It writes Supabase directly instead of `updateKid`, so it depends on realtime to refresh.
2. **Fabricated trend in the weekly report.** `WeeklyProgressReport.tsx:124` `const previousWeekRate = 65; // This would come from previous week's data`, then :136 tells the parent "up from 65% last week". Made-up clinical-looking data.
3. **"New foods accepted" never fires.** `WeeklyProgressReport.tsx:87` reads `e.food_ids?.includes(...)`; `PlanEntry` has `food_id` (`types/index.ts:66`). The milestone message is dead.
4. **Achievements show fake dates and wrong counts.** `AchievementsView.tsx` sets `unlockedDate` to today for every threshold badge (:77, :90, :101...); "Try 25 new foods" counts try-bite *entries*, not distinct foods (:99); "Rainbow Eater" uses household `is_safe` foods, so every sibling gets the same badge (:52-53); `tryBiteEntries[0]` for "first bite" date is not sorted.
5. **Three achievement systems that never meet.** Web computes on the fly, DB trigger writes `kid_achievements`, iOS writes `kid_badges` (20260919000001). A badge earned on the phone never appears on web and vice versa. US-781 fixed streak rules only.
6. **Detailed tracker logs don't move the ladder.** `FoodSuccessTracker.tsx:228` and `DetailedTrackingDialog.tsx:92` insert `food_attempts` with a `stage` and `outcome` but never call `applyAttemptOutcome`, so a "tiny taste, success" logged there leaves the ladder row where it was. Only `useFoodLadder` quick-log advances rungs.
7. **Tracker stats are wrong under a filter.** Success rate/unique foods (`FoodSuccessTracker.tsx:336-340`) are computed from the last 50 rows *after* the outcome filter (:159-166): filter to "success" and the rate reads 100%.
8. **Web ladder is effectively dark.** `FoodChaining.tsx:16` and `SafeFoodInsuranceSection.tsx:26` gate on `exposure_ladder` default false; no migration seeds that flag (only `picky_win_network`, seeded false). Unless someone inserted it in the dashboard, web users never see the ladder board or Safe Food Insurance. Verify in prod `feature_flags`.
9. **Web `Kid` type drops fields iOS and the intake write.** `allergen_severity`, `cross_contamination_sensitive`, `behavioral_notes`, `texture_sensitivity_level`, `preferred_preparations`, `nutrition_concerns` exist on `Kid.swift:13-31` but not `types/index.ts:35-59`, so nothing on web reads severity.
10. **Profile fields collected and then ignored.** `flavor_preferences`, `helpful_strategies`, `new_food_willingness` are read only by ChildProfileCard/intake (grep across `src/`). The intake promises "personalized meal planning"; nothing plans with them.
11. **Tone.** Outcome `tantrum` (FoodSuccessTracker:97), "Refused", "Success rate", "ate X% of planned meals" are compliance metrics. SOS and Division of Responsibility both say the child decides whether and how much; scoring meals eaten is the pressure the ladder header (`exposureLadder.ts:12-16`) says it avoids.
12. **Expo has no kid module.** Either declare it out of scope or it will drift further.

## 3. Benchmark (brief)

- **SOS Approach**: 32 steps in 6 groups (tolerate, interact, smell, touch, taste, eat), child-led, no demands, systematic desensitization. EatPal's 8 rungs are a fair compression; missing the "tolerates in room / on table / on plate" rungs that most ARFID kids start at.
- **Food chaining (Fraker)**: small property changes from an accepted food; brand, shape, colour and temperature matter. EatPal chains on texture/flavour but has no brand or prep dimension on `foods`.
- **Division of Responsibility (Satter)**: parent owns what/when/where; child owns whether/how much. Implies metrics about *exposures offered* and *foods accepted*, not % eaten.
- **Food Hopper**: finds foods from accepted ones, 1,500+ ideas, sensory + nutrition; a **Practitioner version for late 2026** with per-client food lists and exposures. That is the direct threat to the therapist angle.
- **RISE (BeatARFID)**: FBT companion, meal timing, variety, exposures, caregiver support. **Recovery Record**: HIPAA, clinician-linked, web+iOS+Android. **Pitaya**: food checklist shared with others (grandparents, school). **Kids Eat in Color**: PSA-Eat picky-eating vs ARFID screener, 1-5 program of daily small steps.

What parents want: fewer decisions at 5pm, a plan that always has a safe food on the plate, proof of progress when it feels like none, not running out of the one accepted brand, shareable "how to feed my kid" card for other caregivers. What therapists want: exposure counts per food per rung between sessions, accepted-food inventory by food group (the ARFID "< 20 foods" line), distress/gag/vomit events, weight/growth trend, and the parent's notes, in a report they can read in 2 minutes.

Sources: [SOS Approach](https://sosapproachtofeeding.com/introduction-to-the-sos-approach-to-feeding-program/), [SOS feasibility study](https://pmc.ncbi.nlm.nih.gov/articles/PMC11940901/), [Food Hopper](https://www.foodhopper.co/), [RISE](https://beatarfid.com/tools/), [Recovery Record ARFID](https://www.recoveryrecord.com/clinicians_treating_arfid), [Pitaya](https://arfid.app/), [Kids Eat in Color PSA-Eat](https://kidseatincolor.com/qsm_quiz/screener/), [Penn CTSA ARFID exposure](https://www.med.upenn.edu/ctsa/Avoidant/Restrictive_Food_Intake_Disorder_(ARFID)_An_Introduction_to_An_Exposure_Based_Treatment_for_Picky_Eating.html).

## 4. Prioritised backlog

### P0 (correctness and trust)

| # | What | Why / evidence | Effort | Platforms | DB |
|---|---|---|---|---|---|
| P0-1 | Intake loads the kid before editing, keyed by kid id, saves via `updateKid` | Allergen erasure, bug 1 | S | web | none |
| P0-2 | Remove the hardcoded 65%; compute last week from `planEntries`, or drop the comparison. Fix `food_ids` -> `food_id` | Bugs 2-3; fabricated numbers on a clinical surface | S | web | none |
| P0-3 | Seed `exposure_ladder` flag (or remove the gate) so the ladder and Safe Food Insurance reach web users | Bug 8; the flagship feature is invisible on web | S | web | additive `INSERT ... ON CONFLICT DO NOTHING` into flags |
| P0-4 | Per-kid disposition becomes truth (kitchen-loop **US-678**): `kid_food_ladder.disposition` + trigger-maintained `foods.is_safe`/`is_try_bite` rollups | Two kids share one "safe" list (`Kids.tsx:28` shows identical safe counts for every child). Everything in section 5 depends on this | M | all | additive column + trigger; keep both booleans (old iOS reads them). Needs "safe but not on a ladder" rows: allow `current_rung='full_portion', status='mastered'` insert for declared safe foods |
| P0-5 | Every attempt insert goes through the ladder policy (FoodSuccessTracker, DetailedTrackingDialog) | Bug 6; two logs of the same bite disagree | S | web | none (or a DB trigger on `food_attempts` so iOS and web can't diverge; M) |
| P0-6 | Deterministic allergen guard on every AI output (recipe-from-pantry, suggest-foods, meal plan), not prompt-only | `suggest-recipes-from-pantry/index.ts:83,114` only asks the model to avoid allergens | S | edge fns | none |

### P1 (make it the best companion)

| # | What | Why | Effort | Platforms | DB |
|---|---|---|---|---|---|
| P1-1 | One badge store: web reads/writes `kid_badges`; retire client-computed dates; `kid_achievements` trigger dual-writes into `kid_badges` | Bugs 4-5 | M | web+iOS | additive trigger |
| P1-2 | Reframe metrics to Division of Responsibility: "exposures offered", "foods accepted (count by group)", "rungs climbed", "calm meals"; rename `tantrum` label to "Big feelings / needed a break" (keep stored value) | Bug 11; SOS/DoR | S | web+iOS | none (label only) |
| P1-3 | Clinician report on iOS (US-688) + add accepted-food inventory by food group, distress events, growth trend from `kid_growth_events`, and parent notes | iOS is where tracking happens; Food Hopper practitioner launch late 2026 | M | iOS, web | none |
| P1-4 | Pre-ladder rungs: "on the table", "on my plate", "helped cook" before `looking` | ARFID kids start below looking | M | all | **can't** widen the CHECK in place safely for old clients? Widening is safe (old clients never send new values) but old iOS decoders may choke on unknown rung. Add `pre_rung text null` column instead, or ship decoder tolerance one release first |
| P1-5 | Safe Food Insurance and detailed tracker on iOS | iOS has neither (grep of `ios/` for safeFoodRisk/mood_before: nothing) | M | iOS | none |
| P1-6 | Brand/prep-exact safe foods: `foods.brand`, `foods.preferred_prep`, link `canonical_id` to catalog; a safe food shows "Kraft Original, cut in triangles" | Chaining literature: brand and prep are the property that breaks acceptance | M | all | additive nullable columns |
| P1-7 | Caregiver card: one-page shareable "How to feed Sam" (safe foods with brand, what helps from `helpful_strategies`, allergens with severity, what not to say) | Pitaya's share; grandparents/school/daycare | S | web+iOS | none |
| P1-8 | Screener at onboarding (PSA-Eat-like, non-diagnostic) that seeds pickiness and routes red flags (weight loss, gagging, <15 foods) to "talk to your pediatrician" | KEIC does this; feeds the gating in US-741 | M | all | additive `kids.screener_result jsonb` |

### P2

- Pattern insights with minimum samples (current "Pattern detected" fires on one 100% day, `WeeklyProgressReport.tsx:167-175`). S.
- Therapist read-only share link (time-boxed, first name only, reuses report identifier policy). M, new table with RLS.
- Mood/sensory context on quick-log (tired, sick, new place) so a refusal on a sick day doesn't auto-pause. S, additive `food_attempts.context text[]`.
- Unify Expo: declare kid features out of scope in Expo or port quick-log only. S.
- Win Network on by default once k-anonymity checks are proven. S.

## 5. How kid data should drive every other module

Principle: one function, `kidFoodStatus(kidId, foodId) -> safe | trying(rung) | refused | allergen | untried`, fed by `kid_food_ladder` (+ allergens), shared web/Swift like the ladder policy. Every module asks it instead of `food.is_safe`.

| Module | Should do | Today | Where kid data is ignored |
|---|---|---|---|
| Planner "Build week" | Per slot: at least one safe food **for that kid**; try-bite slot = ladder's due exposures at their rung, paired with `paired_safe_food_id`; skip allergens and disliked textures | `mealPlanner.ts:24-25` uses household `is_safe`/`is_try_bite`; :49-51 repeat-avoidance reads **all kids'** history (Planner.tsx:189-194 passes unfiltered `planEntries`), unsorted; :71 rotates try-bites `d % length` ignoring ladder due dates; no allergen check at all | Yes: allergens, ladder, texture, per-kid safe |
| Ladder scheduler | Already allergen/texture aware (`ladderScheduler.ts:118-129`) | Only runs from FoodLadderBoard (flagged off on web) | Wire into Build week |
| Recipes | Filter/badge per active kid: "safe for Sam", "one twist from a safe food" (chain distance), per-kid plating (`platePlanner.ts`) in list view | `EnhancedRecipeCard.tsx:75-89` warns on union of all kids' allergens; no filter; recipe list ignores activeKid except the AI tab | Mostly |
| Recipe twists / hidden veggies | Twist = chain step from a safe food, using the kid's accepted brand/prep | `hiddenVeggieRewriter.ts` reads allergens/dislikes only | Ladder and chain ignored |
| Grocery | Safe foods carry brand onto the list (`grocery_items.brand_preference` exists, `types/index.ts:87`); safe items flagged "do not substitute" for delivery | No brand on `foods`; safe status not propagated | Yes |
| Pantry "safe food insurance" stock | Alert when a kid's safe food is forecast to run out before next shop (depletion forecast weighted by safe status) | `depletionForecast.ts` has no safe-food notion; "Safe Food Insurance" today means acceptance slipping, not stock | Yes |
| AI coach | Send ladder state (current rungs, recent refusals, paused foods), texture dislikes, helpful strategies, severity, last 2 weeks of attempts | `AIMealCoach.tsx:264-270` sends name, age, allergens, and **counts** of household safe/try foods; `recent_meals` is `planEntries.slice(0,7)` across all kids with no results. iOS `AICoachService.swift:60-63` same | Almost entirely |
| Tonight mode | Already excludes kid allergens (`tonightModeRanking.ts:119-148`) and reads dislikes | Uses household safe | Per-kid safe |
| Sibling finder | Should use per-kid dispositions by food id | `siblingMealFinder.ts:49-51` matches free-text name arrays | Ladder ignored |
| Home / Today | "Tonight's try bite for Sam: strawberry, rung Touching, beside his safe crackers" | Home reads plan entries | Ladder not surfaced |

## 6. Recommended order

P0-1, P0-2, P0-3 (a day, all web, no schema). Then P0-4 (US-678) because every row in section 5 is blocked on per-kid truth, then planner + AI coach rewiring (biggest parent-visible payoff), then P1-3 clinician report on iOS before Food Hopper's practitioner app ships.
