#!/usr/bin/env node
/**
 * One-shot: append US-302..US-315 to prd.json for the recipe -> plan ->
 * grocery -> pantry loop. Native iOS Swift + Native Android Kotlin only -
 * the Expo `app/mobile/` codebase is being retired (see US-222).
 *
 * Themes:
 *   1. Canonical ingredient_id + aliases catalog  (US-302..US-306)
 *   2. Week-aggregate shortfall view              (US-307..US-308)
 *   3. 'Plan the Week' rollover surface           (US-309..US-310)
 *   4. Native offline grocery check-off queue     (US-311..US-312)
 *   5. Native Android parity for themes 1-3       (US-313..US-315)
 *
 * Rerunnable: skips any IDs that already exist.
 */
const fs = require('fs');
const path = require('path');

const PRD = path.resolve(__dirname, '..', 'prd.json');
const prd = JSON.parse(fs.readFileSync(PRD, 'utf8'));

const newStories = [
  // === Theme 1: Canonical ingredient identity (US-302..US-306) ===
  {
    id: 'US-302',
    title: 'DB foundation: canonical ingredients catalog + aliases + nullable ingredient_id FKs',
    description: "Today recipe ingredients, pantry foods, grocery items, and receipt-scan results are joined by lowercased name strings ('tomato' != 'Roma tomato 6-pack'). Introduce a shared `ingredients` catalog (canonical name + slug + default unit + category) and an `ingredient_aliases` table (free-text -> ingredient_id with confidence + source). Add a NULLABLE `ingredient_id` FK to `foods`, `recipe_ingredients`, and `grocery_items`. Strictly additive per CLAUDE.md migration rules - older shipped iOS builds (and any older Android builds) ignore unknown columns and continue to work unchanged.",
    acceptanceCriteria: [
      'New migration creates `public.ingredients` (id uuid pk, name text, slug text unique, category text, default_unit text, created_at timestamptz default now()) with RLS enabled, public SELECT, admin-only INSERT/UPDATE/DELETE',
      'New migration creates `public.ingredient_aliases` (id uuid pk, ingredient_id uuid fk nullable, alias text, source text [user|system|import], confidence numeric, created_at) with RLS allowing user INSERT for `source=user` and public SELECT',
      'Add nullable `ingredient_id uuid REFERENCES public.ingredients(id) ON DELETE SET NULL` to `foods`, `recipe_ingredients`, and `grocery_items`',
      'Zero NOT NULL constraints added, zero columns/tables renamed or dropped - backward compat preserved for every shipped native iOS build',
      '`supabase gen types typescript --local > src/integrations/supabase/types.ts` regenerated; typecheck passes; existing 176+ vitest tests still pass',
      'Seed migration loads 200-400 common ingredients from a static JSON keyed by USDA-aligned slugs (separate file under supabase/seed/ingredients.json)',
    ],
    priority: 80,
    passes: false,
    notes: 'First piece of the canonical-identity loop. No client behavior changes until US-303/US-304. Legacy name-match fallback stays for >=2 native releases past MIN_SUPPORTED_IOS_BUILD - removal is a later cleanup story.',
  },
  {
    id: 'US-303',
    title: 'Web: dual-write ingredient_id on every food / recipe_ingredient / grocery write',
    description: 'With US-302 schema in place, every web write that creates/updates a `foods`, `recipe_ingredients`, or `grocery_items` row resolves a canonical `ingredient_id` from the input name and persists both legacy name AND FK. Resolution order: exact slug -> alias match -> fuzzy match above confidence floor -> null. Unresolved rows still write with `ingredient_id = NULL` and the raw name is queued as a candidate alias for admin curation (US-306).',
    acceptanceCriteria: [
      'New util `src/lib/ingredientResolver.ts` exports `resolveIngredient(name: string, opts?): Promise<{id, confidence, source} | null>` with the documented resolution order and a configurable confidence floor (default 0.7)',
      'AppContext food/recipe-ingredient/grocery-item create+update paths call the resolver and persist `ingredient_id` alongside `name`',
      'PantryQuickAdd (US-288), recipe importer, manual grocery dialogs, CSV/import flows all route through the resolver',
      'On null-resolve, the raw name is inserted into `ingredient_aliases` with `source=user, confidence=0, ingredient_id=NULL` (pending admin assignment)',
      'Vitest coverage: canonical names, aliases, plural variations, capitalization, whitespace, unicode, ambiguous (multiple high-confidence matches) - the ambiguous case returns null, not an arbitrary winner',
      'Telemetry: `ingredientResolverHit(source, confidence)`, `ingredientResolverMiss(rawName)`',
    ],
    priority: 81,
    passes: false,
    notes: 'Depends on US-302. Native iOS still writes legacy-name-only until US-304; mixed-mode is expected and shortfall must keep falling back to name match during this window.',
  },
  {
    id: 'US-304',
    title: 'iOS: dual-write ingredient_id parity (foods, recipe ingredients, grocery, receipt-scan)',
    description: 'Mirror US-303 on native iOS Swift. New `IngredientResolver` Swift service backed by the same `ingredients` and `ingredient_aliases` tables. Every iOS create/update path for foods, recipe ingredients, grocery items, and receipt-scan parsed lines tags rows with `ingredient_id` when above the confidence floor.',
    acceptanceCriteria: [
      'New `IngredientResolver.swift` service with the identical resolution order (slug -> alias -> fuzzy -> null) as US-303',
      'All food/recipe/grocery write paths populate `ingredient_id` alongside the legacy name field',
      'Receipt-scan flow (ReceiptScanService.swift) tags each parsed line with `ingredient_id` when confidence >= floor; unresolved lines still parse but queue an alias candidate',
      'XCTest parity coverage with the Vitest fixtures from US-303 (shared fixture JSON checked into repo)',
      'Telemetry parity with US-303',
    ],
    priority: 82,
    passes: false,
    notes: 'Depends on US-302, US-303. Targets the next native iOS release after the US-302 migration lands. Older clients keep writing `ingredient_id = NULL` and the system tolerates that indefinitely.',
  },
  {
    id: 'US-305',
    title: 'Matcher upgrade: prefer ingredient_id across shortfall, receipt reconcile, grocery->pantry',
    description: 'Once US-303 + US-304 have shipped and rows are accumulating `ingredient_id`, update the matchers in `recipeShortfall.ts`, the receipt-scan reconcile flow, and the grocery -> pantry move logic to prefer `ingredient_id` joins. Name match remains the fallback for rows where either side is still NULL. Includes a one-shot backfill for high-confidence historical rows.',
    acceptanceCriteria: [
      '`computeRecipeShortfall` (web) and the iOS equivalent match by `food_id` (existing) -> `ingredient_id` (new) -> case-insensitive name (fallback)',
      'Receipt reconcile uses `ingredient_id` as primary join key for grocery check-off + pantry upsert; name match only when one side is NULL',
      'Grocery -> pantry move (US-282/US-283) uses `ingredient_id` when both sides have one, falls back to name',
      'One-shot backfill script under `supabase/scripts/backfill-ingredient-id.sql` populates `ingredient_id` on rows older than the dual-write deploy where the resolver matches with confidence >= 0.9; lower-confidence matches go to the US-306 admin queue',
      'Vitest + XCTest integration tests covering recipe-with-id + pantry-with-name-only, both-with-id, both-without-id (legacy fallback)',
      'No regressions in existing recipeShortfall test suite',
    ],
    priority: 83,
    passes: false,
    notes: 'Depends on US-303, US-304. Do NOT remove the name fallback in this story - removal is gated on MIN_SUPPORTED_IOS_BUILD passing the dual-write release.',
  },
  {
    id: 'US-306',
    title: 'Admin tooling: alias review queue + ingredient merge/split + targeted backfill',
    description: "US-303/US-304 generate a queue of unresolved or low-confidence aliases that need human curation. Build an admin-only screen to review pending aliases, approve them (assign to an existing ingredient or create a new one), merge near-duplicate ingredient rows ('scallion' <-> 'green onion'), and trigger targeted backfills against historical rows.",
    acceptanceCriteria: [
      'New admin route `/admin/ingredients` gated by the existing admin RLS / role check',
      'Lists pending aliases ordered by occurrence frequency with one-tap actions: approve+assign, create new ingredient, dismiss as garbage',
      'Merge action collapses two ingredient rows into one, re-pointing all FK references (`foods.ingredient_id`, `recipe_ingredients.ingredient_id`, `grocery_items.ingredient_id`, `ingredient_aliases.ingredient_id`) in a single transaction',
      'Split action reassigns rows that were wrongly aliased to a different ingredient',
      "'Backfill matched rows' CTA finds NULL `ingredient_id` rows matching the approved alias and updates them; logs counts and surfaces them in the audit view",
      'New audit-log table `ingredient_admin_actions` (id uuid, actor uuid, action text, before jsonb, after jsonb, created_at) with admin-only RLS',
    ],
    priority: 84,
    passes: false,
    notes: 'Depends on US-302. Can be built in parallel with US-303/US-304 but is most useful once the alias queue starts filling.',
  },

  // === Theme 2: Week-aggregate shortfall (US-307..US-308) ===
  {
    id: 'US-307',
    title: 'Web: week-aggregate shortfall view (dedup + servings scale + unit normalize)',
    description: "US-284 / US-290 compute shortfalls per recipe / per plan entry. Users planning a full week end up with duplicated grocery rows (3 recipes need flour -> 3 flour lines) and no servings scaling. Build a week-level aggregate: for a given week's plan, compute one consolidated 'this week needs' list - deduplicated by `ingredient_id` (or name fallback), servings-scaled per plan entry, unit-normalized via `unitNormalize.ts`, with each line showing which planned meals contribute.",
    acceptanceCriteria: [
      'New util `src/lib/weeklyShortfall.ts` exports `computeWeeklyShortfall(planEntries, recipes, foods, weekStart): WeeklyShortfallRow[]`',
      'Each `WeeklyShortfallRow` contains: ingredientId|nameKey, totalNeeded, canonicalUnit, family, onHand, gap, contributingPlanEntries[] (planEntryId + recipeName + scaledQty)',
      'Servings scaling: each ingredient quantity multiplied by `(planEntry.servings ?? recipe.default_servings) / recipe.default_servings`',
      'Aggregation: rows with same `ingredient_id` merge; rows with NULL `ingredient_id` fall back to lowercased+trimmed name as the merge key',
      'Unit normalization: mixed-family rows (e.g. 1 cup + 200g flour) emit as separate rows with `incomparable: true` flag - never silently sum across families',
      "New Planner CTA 'Add this week's missing to grocery (N)' bulk-inserts the deduped rows",
      'Vitest: servings scaling, dedup with and without ingredient_id, mixed-unit, partial-pantry-coverage, leftovers carryover',
      'Telemetry: `weeklyShortfallShown(itemCount, weekStart)`, `weeklyShortfallAddedToGrocery(itemCount)`',
    ],
    priority: 85,
    passes: false,
    notes: 'Depends on US-281 (structured ingredients, done) and US-287 (unit normalize, done). Strongly complements US-305 once ingredient_id is populated but works on name fallback alone until then.',
  },
  {
    id: 'US-308',
    title: 'iOS: week-aggregate shortfall parity',
    description: "Swift port of US-307 with identical scaling, dedup, and unit-normalization semantics. Adds a 'this week's gap list' CTA in the iOS planner that funnels into the existing iOS bulk-add-to-grocery path.",
    acceptanceCriteria: [
      '`WeeklyShortfallService.swift` mirrors the web util with the same return shape',
      'Servings scaling formula identical to US-307',
      'Reuses `UnitInference.swift` for normalization; cross-family rows flagged `incomparable: true`',
      "Planner UI shows 'Add week's missing (N)' button when shortfall > 0; opens a confirm sheet listing the rows",
      'XCTest parity with the Vitest cases from US-307 (shared fixture JSON)',
      'Telemetry parity with US-307',
    ],
    priority: 86,
    passes: false,
    notes: 'Depends on US-307 for API contract alignment, US-287 (done) for unit normalization, US-281 (done) for structured ingredients.',
  },

  // === Theme 3: Plan-the-Week rollover (US-309..US-310) ===
  {
    id: 'US-309',
    title: "Web: 'Plan the Week' rollover surface (cooked summary -> pantry decrement -> next plan -> gap list)",
    description: "The grocery-pantry loop is currently invisible - users never see a single moment where last week wraps and next week starts. Add a 'Plan the Week' guided surface (Sunday default, configurable) that walks the user through: (1) what was cooked vs planned last week, (2) confirm pantry decrements for cooked meals with editable 'what did you actually use', (3) preview next week's plan (carryover + suggested), (4) week-aggregate gap list (US-307) with one tap to add to grocery.",
    acceptanceCriteria: [
      'New page `src/pages/PlanTheWeek.tsx` at route `/plan/week-rollover`, lazy-loaded via `<Suspense>` per CLAUDE.md page recipe',
      "Step 1: last week's plan entries listed with status pills (cooked / skipped / leftover); tap cycles status",
      "Step 2: derived pantry-decrement preview from cooked entries' recipe_ingredients with editable per-row 'actually used' quantity (defaults to recipe qty * servings scale)",
      "Step 3: shows existing next-week entries plus CTAs to copy-forward unfinished meals or apply a meal_plan_template",
      'Step 4: embeds the US-307 week-aggregate shortfall list with primary CTA `Add all missing to grocery`',
      "Soft reminder: dashboard banner Friday-Sunday if rollover hasn't run this week; dismissable; persisted dismissal per week",
      'Telemetry: `planTheWeekStepCompleted(step)`, `planTheWeekRolloverFinished(decrementedCount, addedToGroceryCount)`',
      'No new tables - composes existing plan/pantry/grocery state and writes through existing AppContext mutators',
    ],
    priority: 87,
    passes: false,
    notes: 'Depends on US-307. The user-visible anchor of the whole loop - makes the cycle feel intentional instead of implicit.',
  },
  {
    id: 'US-310',
    title: "iOS: 'Plan the Week' rollover parity",
    description: "Native iOS sibling of US-309 - a single guided 'Plan the Week' flow with the same four steps. Native feel (sheets + haptics + UNUserNotificationCenter local notifications) driven by the same data and producing the same Supabase writes as web.",
    acceptanceCriteria: [
      '`PlanTheWeekFlow.swift` view with 4 steps mirroring US-309',
      'Step 2 reuses the iOS pantry-decrement logic from US-286',
      'Step 4 reuses the US-308 week-aggregate shortfall computation',
      "iOS-only: 'remind me Sunday' local notification scheduler (UNUserNotificationCenter)",
      'XCTest coverage on step transitions, data flow, and decrement correctness',
      'Telemetry parity with US-309',
    ],
    priority: 88,
    passes: false,
    notes: 'Depends on US-286, US-308, US-309.',
  },

  // === Theme 4: Native offline grocery check-off queue (US-311..US-312) ===
  {
    id: 'US-311',
    title: 'iOS: native Swift OfflineWriteQueue for grocery check-off + pantry upserts',
    description: "In-store native iOS shoppers routinely lose cellular signal. Today, grocery check-off and 'move to pantry' require a live connection and either lag visibly or fail silently. Build an offline-first queue in pure Swift (no shared code with the retiring Expo `app/mobile/lib/syncQueue.ts`): tapping grocery check-off applies optimistically to local state, persists the Supabase write (check-off + pantry upsert) to an on-disk queue that survives app restart, and reconciles on reconnect using idempotent operations with server-side additive merges for pantry quantity (sum, not replace).",
    acceptanceCriteria: [
      'New `OfflineWriteQueue.swift` service backed by Core Data (or SQLite via GRDB) - survives app restart and force-quit',
      'Each queued operation carries a client-generated UUID; replaying the same op is a no-op (server-side idempotency table keyed on op id)',
      'Pantry quantity merges are additive server-side: `UPDATE foods SET quantity = quantity + $delta WHERE id = $id` via a new RPC `pantry_delta_apply`, never `SET quantity = $snapshot`',
      "UI: subtle 'Will sync (N)' badge in the iOS grocery header when queue depth > 0; tapping shows queue detail with retry/discard per op",
      'Reconcile runs in the background on `NWPathMonitor` unsatisfied -> satisfied; exponential backoff retry; per-op failure surfaces a toast and a retry CTA',
      'XCTest: airplane-mode check-off, restart-mid-queue, network-flap-during-reconcile, duplicate-replay, concurrent web+iOS reconcile',
      'Telemetry: `groceryOfflineQueueDepth(n)`, `groceryOfflineReconcileSucceeded(opCount)`, `groceryOfflineReconcileFailed(reason)`',
      'Queue carries `ingredient_id` when known (compatible with US-305 matchers)',
    ],
    priority: 89,
    passes: false,
    notes: 'Native iOS Swift only - the Expo `app/mobile/lib/syncQueue.ts` (US-127) is being retired per US-222 and the directive to move to fully native apps. Android parity is US-312.',
  },
  {
    id: 'US-312',
    title: 'Android Native: Kotlin OfflineWriteQueue parity for grocery + pantry',
    description: 'Native Android Kotlin parity of US-311. The Expo `app/mobile/` codebase is being retired per US-222, so the native Android app needs its own first-class offline queue rather than relying on the retiring RN implementation. Local persistence via Room, network observation via `ConnectivityManager.NetworkCallback`, additive pantry merge via the shared `pantry_delta_apply` RPC introduced in US-311.',
    acceptanceCriteria: [
      '`OfflineWriteQueue.kt` service backed by a Room database - survives process death and app reinstall (via `android:allowBackup` defaults)',
      'Operation idempotency uses the same UUID + server-side idempotency table from US-311',
      'Pantry quantity merges call the shared `pantry_delta_apply` RPC; web/iOS/Android all converge on additive deltas',
      "UI: 'Will sync (N)' chip in the Android grocery toolbar; tapping opens queue detail composable",
      'Reconcile runs on `WorkManager` constraint `NetworkType.CONNECTED` with exponential backoff; per-op failure surfaces a Snackbar with retry',
      'Instrumented test coverage on the cases from US-311 (airplane-mode, restart-mid-queue, flap, duplicate replay, multi-platform reconcile)',
      'Telemetry parity with US-311',
      'Queue carries `ingredient_id` when known (compatible with US-305 matchers)',
    ],
    priority: 90,
    passes: false,
    notes: 'Depends on US-311 for the shared `pantry_delta_apply` RPC and idempotency table. Part of the native-Android push tracked by US-213/US-214/US-222.',
  },

  // === Native Android parity for Themes 1-3 (US-313..US-315) ===
  {
    id: 'US-313',
    title: 'Android Native: dual-write ingredient_id parity (Kotlin IngredientResolver)',
    description: "Native Android parity for US-303 / US-304. New Kotlin `IngredientResolver` service backed by the same `ingredients` and `ingredient_aliases` tables. Every Android create/update path for foods, recipe ingredients, and grocery items tags rows with `ingredient_id` when above the confidence floor. Receipt-scan is N/A on Android until that feature ships natively - flagged as an extension.",
    acceptanceCriteria: [
      'New `IngredientResolver.kt` service with identical resolution order (slug -> alias -> fuzzy -> null) as US-303',
      'All Android food/recipe/grocery write paths populate `ingredient_id` alongside the legacy name field',
      'Instrumented test parity with the Vitest fixtures from US-303 (shared fixture JSON)',
      'Telemetry parity with US-303',
      'Receipt-scan tagging stub-returns NULL until native Android receipt-scan ships (separate future story)',
    ],
    priority: 91,
    passes: false,
    notes: 'Depends on US-302, US-303. Part of the native-Android push tracked by US-213/US-214/US-222.',
  },
  {
    id: 'US-314',
    title: 'Android Native: week-aggregate shortfall parity',
    description: 'Kotlin port of US-307 / US-308 - week-level aggregate shortfall with identical scaling, dedup, and unit-normalization semantics. Adds a "this week\'s gap list" CTA in the native Android planner that funnels into the native bulk-add-to-grocery path.',
    acceptanceCriteria: [
      '`WeeklyShortfallService.kt` mirrors the web/iOS service with the same return shape',
      'Servings scaling formula identical to US-307',
      'New `UnitInference.kt` (or reuse a shared KMM module if available) for normalization',
      "Planner UI shows 'Add week's missing (N)' button when shortfall > 0; opens a bottom sheet listing rows",
      'Instrumented test parity with the Vitest/XCTest cases (shared fixture JSON)',
      'Telemetry parity with US-307',
    ],
    priority: 92,
    passes: false,
    notes: 'Depends on US-307 for the API contract. Part of the native-Android push.',
  },
  {
    id: 'US-315',
    title: "Android Native: 'Plan the Week' rollover parity",
    description: "Native Android Kotlin sibling of US-309 / US-310 - a single guided 'Plan the Week' Compose flow with the same four steps. Uses Material 3 bottom sheets + WorkManager-scheduled local notifications for the Sunday reminder.",
    acceptanceCriteria: [
      '`PlanTheWeekFlow.kt` composable with 4 steps mirroring US-309',
      'Step 2 reuses the Android pantry-decrement logic (built alongside Android parity of US-286 - flagged as a dependency)',
      'Step 4 reuses US-314 week-aggregate shortfall computation',
      "Android-only: 'remind me Sunday' local notification scheduled via WorkManager",
      'Instrumented coverage on step transitions, data flow, and decrement correctness',
      'Telemetry parity with US-309/US-310',
    ],
    priority: 93,
    passes: false,
    notes: 'Depends on US-314, US-309, and on a future Android parity story for US-286 (mark-made pantry decrement). Should be sequenced after the Android baseline parity (US-213/US-214) ships.',
  },
];

const existingIds = new Set(prd.userStories.map(s => s.id));
const toAdd = newStories.filter(s => !existingIds.has(s.id));
const skipped = newStories.filter(s => existingIds.has(s.id));

if (skipped.length > 0) {
  console.error('Skipping already-present IDs:', skipped.map(s => s.id).join(', '));
}

prd.userStories.push(...toAdd);

fs.writeFileSync(PRD, JSON.stringify(prd, null, 2) + '\n');

console.log(`Added ${toAdd.length} stories. Total now: ${prd.userStories.length}.`);
console.log('New entries:');
for (const s of toAdd) {
  console.log(`  ${s.id} | prio ${s.priority} | ${s.title}`);
}
