# EatPal web platform roadmap, September 2026

Survey date: 2026-09-03, from `main` at deb2c1c (PR #260). Covers the Vite/React web app
in `src/`, the edge functions it calls, and the contracts it shares with the Swift iOS
app under `ios/EatPal`. Story ids refer to `prd-household-planner.json` (US-709 to
US-759), `prd-kitchen-loop.json` (US-654 to US-689) and `prd.json`. Items marked NEW
have no story yet.

## Where the two clients stand

iOS 1.0.9 is in the App Store with tabs Home, Planner, Pantry, Grocery, More. Its
transition is written down as kitchen-loop US-682 to US-688 (shared-fixture mirrors,
ledger-backed cook and buy, resolver at import, the Today/Week/Recipes/Grocery/Kids tab
layout, the provenance thread, the clinician report) plus household-planner US-759. Every
one of those needs a Mac to verify and none has started. iOS still reads and writes
`foods.quantity` directly and knows nothing about `inventory_movements` or `item_stock`;
the DB carries trigger-maintained mirrors so it keeps working.

Web is where the model lands first. Slice 1 of the household planner epic is done
(US-709 to US-719, US-721). Everything from US-722 on is open: 36 web stories, 5 edge, 3
SQL. The kitchen-loop web half is also open past the pure modules: US-661, US-662,
US-664, US-672, US-673, US-676, US-679, US-680, US-681.

The rule that makes them fit: web ships the server-side contract (meals, eaters, slots,
aisles, resolver, ledger writes, one shortfall function) in release N, iOS adopts it in
N+1, and the mirrors retire in N+2 once `app_config.min_ios_build` moves. Nothing on web
may drop or rename what a shipped iOS build reads.

## Track 0. Unblock the pipeline (this week, before any feature work)

1. **Fix the two red CI jobs on `main`.** "Types Drift & Edge Functions" and
   "Migration Test" both die at "Start local Supabase" in under two seconds on every
   run since at least 2026-08-30. Until this passes, migrations are not tested and types
   are not regenerated. NEW.
2. **Regenerate `src/integrations/supabase/types.ts`.** About 63 tables created in
   migrations have no type entry (`funnel_events`, `apple_subscriptions`,
   `household_invite_codes`, `plan_entry_feedback`, `stripe_webhook_events`, the pSEO
   tables). This alone clears a large share of the typecheck backlog and is the first
   half of US-722 and US-755. Depends on item 1.
3. **Make the typecheck number honest.** `progress.txt` records a full `tsc -b` on main
   at 1400 against a baseline of 1165, while CI reports the ratchet green; the local
   `tsc -b` also exits 0 having checked nothing when `*.tsbuildinfo` looks current.
   US-755 owns the fix (tsconfig.node.json, ratchet asserts log length, baselines drop).
   Decide raise-with-justification vs burn the 235 in the same story.
4. **Decide whether Cloudflare deploys from CI or from the Pages Git integration.**
   The `Deploy to Cloudflare Pages` step is skipped on every run for lack of
   `CLOUDFLARE_API_TOKEN` and the job still reports green, so "did main deploy" cannot
   be read from the run list. Either add the secret and make a skipped deploy fail, or
   delete the job and document the Pages integration as the only path. NEW.
5. **Retire the Expo client (US-720).** Blocked once by the sandbox's bulk-delete guard.
   Do it from a machine: `app/`, `native-js-build/`, 7 root config files, 19 npm
   scripts, 17 dependencies, the `vite.config.ts` exclusion blocks. The unit-suggestion
   table is already ported (`src/lib/groceryAisle.ts`).
6. **Reconcile `develop` and `main`.** `develop` was last touched 2026-07-02 and every
   PR since merges to `main`, which contradicts the branching table in CLAUDE.md.
   Either fast-forward `develop` and route `claude/*` PRs there again, or rewrite the
   table to say `main` is the integration branch and `release/*` cuts from it. NEW.
7. **Wire Playwright into CI as a non-blocking job.** 28 specs under `tests/` (auth,
   payment, subscription, planner, grocery, pantry, recipes, onboarding, a11y) and no
   workflow runs any of them. Start with the auth and payment specs on the built
   `dist/` behind the existing fake-PostgREST helper. NEW (ENTERPRISE checklist row 10).

## Track 1. Contracts web must land before iOS can adopt them

These are the pieces US-759 and kitchen-loop US-682 to US-687 read from. Order matters.

8. **US-722** canonical `recipe_ingredients` columns with a transition trigger, so a
   recipe built on the phone has ingredients on web and vice versa.
9. **US-726** `household_meal_slots` table plus `src/lib/mealSlots.ts`; replaces four
   hardcoded slot lists and fixes TodayMeals reading `food_ids` instead of `food_id`.
10. **US-728** grocery aisle taxonomy in TypeScript, 32 values, walk order and
    `classify()` matching `GroceryAisle.swift`, pinned by
    `tests/fixtures/aisle-classify-cases.json` on both sides. The Swift file is the
    source; web is the port.
11. **US-724** one `planMeal` primitive. Every entry surface (Planner, mobile planner,
    Sibling Meal Finder, Tonight Mode, templates, AI week) writes through it. This is
    the function US-759's Swift MealPlanView will mirror.
12. **Kitchen-loop US-674 and US-675** `meals` table, `plan_entries.meal_id`, backfill.
    iOS validates `kid_id` and `food_id` as NOT NULL client-side, so `meal_id` is
    additive and `kid_id` stays populated until N+2.
13. **US-740** `household_eaters` and `meal_attendees`; onboarding asks "who are you
    planning for" and the planner renders with zero kids. Swift onboarding copy changes
    in the same release.
14. **Kitchen-loop US-676** one shortfall function replacing four (`recipeShortfall.ts`,
    `RecipeDetailView`, `mealPlanner.ts`, `GroceryGeneratorService.swift`). The
    2026-06-03 review notes `unitNormalize.ts` is built, tested and still not called
    from `recipeShortfall.ts`, so any unit mismatch reads on-hand stock as zero. That
    one call-site swap can ship on its own first.
15. **Kitchen-loop US-672** pantry edits and grocery checkout write movements on web,
    with US-673's backward-compatibility suite proving an old iOS build still reads a
    correct `foods.quantity`.
16. **US-758** parity fixtures: unit conversion, aisle classification, recipe scaling,
    shortfall. iOS's `Shared/UnitConverter.swift` is a third, unpinned unit
    implementation today; drift there silently corrupts pantry totals. Add the fixture
    and the XCTest even though this box cannot run it.
17. **US-754** platform map and a machine-readable `min_ios_build` (`npm run
    ios:min-build`). US-689 and the mirror retirement gate on it.
18. **US-756** one design token file generating `src/index.css` and `AppTheme.swift`.
    Sequence the 679 hardcoded Tailwind colour literals (compliance audit, US-577)
    before the hex-literal lint rule, or the rule cannot be enabled.

## Track 2. The kitchen loop on web

This is what "web needs some work" mostly means: the loop exists on iOS as
capture, plan, list, shop, stock, cook, and on web each step is a separate page with
string matching between them.

19. **US-735** core-loop analytics events plus one integration test that walks the
    loop. Half a day, do it first so the rest is measured.
20. **US-733** parse schema.org recipes directly, keep the image, review before save;
    retire `parse-recipe-grocery`.
21. **US-723** PWA share target lands in the builder. Note the share target cannot work
    at all until the service worker is registered (Track 3, item 33).
22. **Kitchen-loop US-661** resolve ingredients at import with a confirm step. Same
    confidence bands as the Swift confirm sheet in US-684; settle the fuzzy threshold
    once (spec open question 1).
23. **US-729 and US-730** auto-categorise on add, alias memory on every add path.
    Include the `ScanReceiptDialog` write path, which today goes straight to the pantry
    and bypasses list, aisle and resolver (progress.txt, US-714 deviation). NEW addition
    to US-730's AC.
24. **US-731** seed `canonical_products`. Answer spec open question 2 explicitly.
25. **Kitchen-loop US-662 and US-664** merge proposals and a merge review UI, tested
    against `Database_Backup` shapes as the spec asks. NEW addition to US-664's AC.
26. **US-732** store walk order on the web list. Seeds exist since May with no reader.
27. **US-736** recipe-aware grocery generation, scaled by servings, pantry subtracted.
28. **US-737** grocery list as a projection of the plan via `grocery_item_sources`
    (a table with zero readers or writers on web since April). This is also the web
    half of iOS US-687's provenance thread; without it iOS builds provenance alone.
29. **Consume `source_recipe_id` and `added_via='recipe'`.** Written on every
    recipe-driven grocery add, read nowhere. Auto-check sourced rows when the meal is
    cooked. Fold into US-738. NEW (2026-06-03 review R3).
30. **US-738** Cooked action through `rpc_mark_meal_made_v2` then `rpc_cook_meal`;
    Tonight Mode creates the meal through `planMeal`.
31. **US-739** checkout credits the pantry by item id once, with undo, price capture,
    and a mobile-width shopping mode with wake lock matching Swift ShoppingModeView.
32. **Kitchen-loop US-679 and US-680** split cooking from eating; every grocery path
    subtracts the pantry.

## Track 3. Web navigation and the phone-web experience

The spec left web IA rework out of scope for the kitchen loop. iOS is moving to
Today, Week, Recipes, Grocery (List and Pantry), Kids. Web should meet it there or the
two products stop looking like one. The mobile-width web app is also the only
"mobile" a household's Android members have until `android-native` ships.

33. **Register the service worker.** `public/sw.js` (407 lines) and `src/lib/pwa.ts`
    are complete and nothing calls `registerServiceWorker()`. No offline cache, no
    `offline.html`, and the manifest's POST share target has no handler, so sharing a
    URL into EatPal on Android hits a route the CDN cannot serve. One import in
    `main.tsx` plus a smoke test. NEW, do before US-723.
34. **US-741** one `NAV` array, primary sections Today, Week, Recipes, Grocery, Kids;
    kid tooling gated on a pickiness profile; Quick Actions leads with Plan a meal.
35. **Collapse the eight alias routes.** `/kids`, `/pantry`, `/recipes`, `/grocery`,
    `/food-tracker`, `/meal-builder`, `/insights`, `/sibling-meal-finder` each mount a
    second Dashboard shell with its own state, the bug US-719 fixed for `/planner`
    only. Make them `<Navigate>` redirects. NEW.
36. **One chrome, not two.** `Dashboard.tsx` renders the desktop sidebar and the
    mobile bottom nav as two separately maintained trees (`hidden md:block` and
    `md:hidden`), and `AppSidebar` omits Insights while the mobile nav has it. Fold
    into US-741's `NAV` array. NEW.
37. **Grocery page responsive pass.** `Grocery.tsx` (1392 lines) has two `md:`
    breakpoints and no mobile branch; it is the page a phone user opens in the store.
    Pair with US-739's shopping mode and the 44 px tap-target item (prd.json US-576).
38. **Settings page responsive pass.** `AccountSettings.tsx` (1401 lines) has no
    `md:` breakpoints at all. NEW.
39. **Reach billing from the UI.** `/dashboard/billing` is in no nav and its intended
    components under `src/components/billing/` (1234 lines) are never imported;
    `Billing.tsx` reimplements them. Pick one and link it from Settings. NEW.
40. **Household page.** Web has only `ManageHouseholdDialog` opened from Home; iOS has
    a full settings screen with invite codes. US-740 adds eaters there; give it a route.
41. **US-725** delete, swap and log from a meal cell; confirm and undo on week actions.
42. **US-743** range, month and agenda views; planner reads `?date=` and `?slot=` so
    reminders and shared links land on the right day.
43. **US-744** keyboard-accessible drag and drop; drop commits on drag end.
44. **US-753** one add-item sheet with type, paste, scan and photo modes.
45. **US-751** recipe detail shows real quantities, scales, wake lock in cook mode.
46. **US-750** ranked recipe search, "what can I make", cook history, per-person
    ratings. iOS already has `CookableRecipesSheet`; this is web catching up.
47. **Onboarding as a route.** `OnboardingDialog` fires only from `Auth.tsx`; iOS has a
    five-page flow with completion stored only on device (prd.json US-708 moves it to
    `profiles`). Give web the same "who are you planning for" branch from US-740 and
    write completion to the same column so the two funnels agree. NEW.
48. **Badges and streaks.** iOS keeps them in UserDefaults; web has nothing. Either
    add a table both clients write, or explicitly leave it iOS-only in PLATFORMS.md.
    NEW.
49. **Clinician ladder report parity.** iOS US-688 asserts against
    `buildClinicianLadderReport`; make sure the web report reads the same
    `kid_food_ladder` disposition path once kitchen-loop US-678 lands. NEW.

## Track 4. Dead code and dependencies

Removing these shrinks the bundle, the typecheck backlog and the surface every future
story has to grep through. All are verified unreferenced from `src/`.

50. **US-727** delete `CalendarMealPlanner`, `MealPlanningCalendar`,
    `AddMealToCalendarDialog`, `QuickSuggestionsPanel`, `MealSuggestionCard`; GSAP
    leaves the authenticated routes.
51. **US-734** delete `RecipeImporter` and `RecipeBuilder`; fix or remove the AI
    buttons that cannot succeed; mount `RecipeExportActions`.
52. **Delete the other unreferenced components.** 39 files, about 10,300 lines at the
    top of `src/components/`: `Navigation.tsx`, `AccessibleNav`, `CardNav`,
    `QuickActionsMenu`, the `Accessible*` form family, `LqipImage`,
    `GroceryDeliveryPanel`, `UserLoginHistory`, `ReferralDashboard`,
    `AICostDashboard`, `BackupSettings`, `CollaborativeShoppingMode` (or wire it per
    US-752), `StructuredIngredientsEditor`, `Card3D`, `Card3DTilt`, `OfflineIndicator`
    (or wire it once the service worker registers), and the rest. Also four of five
    files under `components/subscription/` and `pages/Index.tsx`. NEW.
53. **Delete `buildDayPlan`** in `src/lib/mealPlanner.ts`, no callers. NEW.
54. **Drop Three.js.** `three`, a beta `@react-three/fiber` and `drei` serve one
    landing hero and cost two manual chunks and a warning suppressor. Replace the hero
    with a static image or a CSS scene. NEW.
55. **Consolidate on framer-motion.** GSAP is used by six files; US-727 removes it from
    the app routes, this removes it from Landing. NEW.
56. **Lazy-load or drop `swagger-ui-react`.** One page, two chunks. NEW.
57. **Collapse the duplicate edge-function trees.** `supabase/functions/` and root
    `functions/` share 13 names including `stripe-webhook`; the split already cost a
    month of silent Stripe dedup loss. Keep the guard script until the root tree is
    gone. NEW.
58. **Audit the 18 edge functions no client calls.** `join-waitlist`,
    `identify-product`, `register-push-token` look orphaned; the cron-shaped ones need
    a documented schedule (US-747 covers reminders and the four weekly reports). NEW.
59. **Add a bundle-size budget to CI** before touching `vite.config.ts` chunking again.
    NEW.

## Track 5. Tests and type safety

60. **US-757** split Pantry, Grocery, Recipes and Planner below 500 lines each, pinned by
    the US-735 integration test, with a render test per page.
61. **US-755** derive `PlanEntry`, `GroceryItem` and `Recipe` UI types from the
    generated types; remove the `@ts-expect-error` trio in `PlanContext.copyWeekPlan`.
62. **Retire the admin blanket exclude in `tsconfig-bypass.json`** once `types.ts` is
    regenerated; `SEOManager.tsx` alone carries about 281 errors. NEW.
63. **One shared grocery row builder.** Three hand-written field allowlists in the
    insert path each drop new columns silently (US-714 learnings). NEW.
64. **Playwright a11y on authenticated pages** with a login fixture; raise the axe
    threshold from `critical` to `serious` so the ~109 nameless icon buttons fail.
    NEW (compliance audit rows 172, 180).
65. **Rendered checkout test.** Subscription and billing have three unit tests and no
    rendered test in the enforcing suite. NEW.
66. **Make the types-drift step blocking** after item 2. NEW.

## Track 6. Growth, billing, onboarding

67. **prd.json US-702 and US-707** web signup stops depending on the emailed code;
    activation events reach `funnel_events`.
68. **Entitlement gating.** Neither client gates a feature on a subscription today;
    iOS's paywall is reachable only from Settings. Decide which features gate, then
    implement on web with `useSubscription` and on iOS in the same release. NEW.
69. **US-747 and US-748** reminders that fire in the right timezone; ICS feed and a
    read-only week share, which also replaces the broken `RecipeShareButton` URL.
70. **US-749** price capture and per-store price history.
71. **prd.json US-570** prerender for AI crawlers, the last big SEO item.
72. **prd.json US-648** grocery delivery partner landing pages.

## Track 7. Ops and compliance

73. **prd.json US-556 and US-562** rotate the committed credential; move Apple signing
    material out of the repo. External, human action.
74. **Retention auto-purge job** for inactive accounts and child data; no-train flags on
    `ai-coach-chat` and `ai-meal-plan` provider calls. NEW (compliance audit rows 177,
    178).
75. **Nightly ledger drift job**: assert each `item_stock` equals its movement sum and
    name the writing path. The spec requires it; no story exists. NEW.
76. **Dark-launch comparison harness** for `foods.quantity` vs ledger balance on real
    households, with the agreement rate recorded before the flag defaults on. US-739
    mentions it; give it its own story. NEW.
77. **Uptime monitor and status page.** The runbook assumes one exists. NEW.
78. **Stale docs**: `docs/typecheck-backlog.md` and two `ci.yml` comments still say
    1257; `docs/runbook.md` says session replay is on in production (it is gated on
    consent); `docs/deployment-checklist.md` demands zero tsc errors and lists 12 of
    95 functions; `ENTERPRISE_READINESS_CHECKLIST.csv` marks CI workflows Not Started.
    One pass, one PR. NEW.
79. **`tasks/prd-agentic-os.md`**: 41 stories that live only as markdown. Promote to a
    PRD file or archive. NEW.

## Suggested order

Sprint 1 (pipeline and contracts): items 1 to 7, then 8, 9, 10, 11, 19, 33, 35.
Sprint 2 (model parity, the release iOS builds against): 12, 13, 14, 15, 16, 17, 20,
21, 22, 23, 24, 27, 28, 29, 30, 31, 34, 36, 50, 51, 52.
Sprint 3 (web catches up with the iOS layout): 37 to 49, 41 to 46, 60, 61, 64, 68, 69.
Ongoing: Track 4 deletions, Track 5 gates, Track 7 as staffing allows.

After sprint 2 ships as release N, iOS US-682 to US-687 and US-759 can be verified on a
Mac against it as N+1, and US-689 retires the mirrors at N+2.
