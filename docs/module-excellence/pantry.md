# Pantry / food inventory: module audit (2026-09-22)

Scope: EatPal web (`src/`), Expo (`app/`), native iOS (`ios/EatPal/EatPal`), Supabase.
Read-only research. Line numbers are from the tree as of this date.

## 0. The dual role, stated precisely

`public.foods` is one table doing two jobs:

- **Inventory**: `quantity`, `unit`, `expiry_date`, `barcode`, `price_per_unit`,
  `package_quantity`, `servings_per_container`, `aisle`, `canonical_id` (catalog link),
  `merged_into_id` (types.ts:5661-5687).
- **The child's food catalogue**: `is_safe`, `is_try_bite`, `allergens`. It's the FK
  target for `plan_entries.food_id` (ON DELETE CASCADE, migration 20251008012402:35),
  `food_attempts`, `food_chain_suggestions` (20251008150000:42,72-73), `kid_food_ladder`
  (20260801000000:24, CASCADE), `recipe_ingredients`, `recipe_components`,
  `food_aisle_mappings`.

So one row is both "we have 2 L of milk" and "Maya's ladder is on step 3 for milk".
Every inventory action that ends in `DELETE FROM foods` also deletes that child's meal
history, try-bite results and ladder progress. The UI calls it "remove from your
pantry" (PantryListItem.tsx:221, FoodCard.tsx:173-178, FoodCard.tsx:310-314 zero-qty
prompt, Expo pantry.tsx:207-214). **This is the most dangerous thing in the module.**

The free-plan cap `max_pantry_foods = 50` (20251008202537:43, enforced by trigger
20260723123300:95) counts both roles. Every auto-created food from a grocery check-off
eats into the same 50 slots as the child's safe-food list.

## 1. Inventory today

### Web (src/)
- `src/pages/Pantry.tsx` (1418 lines; US-757 wants <500). Grouped/flat/grid views,
  search, category + stock filters, sort (`filterAndSortFoods`, src/lib/pantryData.ts),
  pull-to-refresh, AI suggestions (`suggest-foods`), starter list, add-to-grocery
  (resolves the catalog name, :455-476), quantity edit through the ledger when
  `ledgerWritesEnabled` (:396-418), explicit waste action (:423-452).
- Entry paths, from the menu at :638-760: AddFoodDialog (USDA/nutrition search,
  package details, qty, unit, safe/try-bite toggles), BulkAddFoodDialog, ImportCsvDialog,
  barcode (`components/admin/BarcodeScannerDialog.tsx` with `targetTable="foods"`,
  :1232), ImageFoodCapture (`identify-food-image`), ScanReceiptDialog
  (`parse-receipt-image`), PantryQuickAdd (single line + multi-line parser, US-288).
- `FoodsContext.tsx`: CRUD plus bulk, realtime by household (:128-151), catalog
  enrichment via `grocery_product_catalog` (:88-125), client + server plan-limit check.
- `InventoryContext.tsx`: kitchen-loop ledger (`inventory_movements`, `item_stock`,
  reasons purchase/cook/waste/expire/correction/initial). Both reads and writes are
  behind flags that default off (:298-299), so production still runs on
  `foods.quantity`.
- `SmartRestockSuggestions` + `lib/depletionForecast.ts`: rendered on Grocery only
  (Grocery.tsx:1040), not on Pantry.
- Stock status: `getStockStatus` with `LOW_STOCK_THRESHOLD = 2` whatever the unit
  (pantryConstants.ts:125-139). 2 g of saffron and 2 jars of peanut butter are both "low".

### Expo (app/)
- `app/(tabs)/pantry.tsx` (579): list, +/- quantity, edit/add sheet, delete, add to
  grocery. Reads `.eq('user_id', user.id)` (:78), so a partner's foods are hidden even
  though RLS allows them. No realtime, no expiry, no ledger.
- `app/(tabs)/scan.tsx` (443): calls OpenFoodFacts directly (`queryOpenFoodFacts`, :91),
  skipping `lookup-barcode` and the shared catalog (US-797). Manual entry is still
  "the primary path until camera is fully linked" (:210).

### iOS (live in the App Store)
- `Views/Pantry/PantryView.swift` (1420): expiry chip + per-category default expiry
  (:1059-1193, :1370+), swipe safe/unsafe, restock-to-grocery (:345-384), quick-add bar,
  bulk add sheet (`FoodBulkParser`), receipt sheet with dedup (`incrementFoodQuantity`,
  ScanReceiptSheet.swift:278).
- Scanner: `UnifiedScannerView`, `DataScannerRepresentable` (VisionKit),
  `ARShelfScannerRepresentable`, `ScannedProductView` with dedup via
  `PantryDedup.match` (barcode first, then name; AppState.swift:483).
  `BarcodeService.swift:5` also calls OpenFoodFacts directly.
- `AppState.moveCheckedToPantry()` (:1872): explicit "Move checked to pantry" with unit
  conversion (US-363) and a flag for mismatched units.
- `RestockPredictor.swift` (median gap between adds from `user_product_preferences`,
  confidence = adds/8, floor 0.5) and `ExpiringRestockSuggester.swift` (expiring within
  2 days and bought before), both surfaced in GroceryView (:1420, :84).
- `FridgeRecognitionService` (`recognize-fridge-contents`), used from the meal-plan
  FridgePhotoSheet, not from Pantry.
- Dashboard "expiring foods" card (DashboardHomeView.swift:29-62).
- `BudgetService.pantryInventoryValue` (price x qty).

### Supabase
- Functions: `lookup-barcode` (pantry, then catalog, then OFF, USDA, FoodRepo; promotes
  to catalog), `enrich-barcodes`, `identify-food-image`, `parse-receipt-image`,
  `recognize-fridge-contents`, `suggest-foods`, `suggest-recipes-from-pantry`,
  `calculate-food-similarity`.
- Kitchen-loop migrations are in place (movements, item_stock, a mirror into
  `foods.quantity` for shipped clients, translation of direct writes into correction
  movements, backfill). US-672/677/680/681/683 are still open.

## 2. Bugs and half-built things (verified)

1. **Security finding S2, withheld.** Details are kept out of this public repo until the
   fix ships. See the "Fix first" section of `docs/module-excellence-2026-09.md`.
2. **Delete cascades the child's history.** See section 0. There's no soft-delete and no
   warning, and web's zero-quantity prompt steers people toward delete (FoodCard.tsx:305-320).
3. **US-803 fixed on web only.** Web routes every acquired food through
   `ACQUIRED_FOOD_IS_SAFE = false` (src/lib/foodSafetyDefault.ts:29). Still hardcoding
   `is_safe: true`: iOS `moveCheckedToPantry` (AppState.swift:1928),
   `ScanReceiptSheet.swift:256`, `PantryQuickAddBar.swift:209`; Expo `pantry.tsx:176`
   and `scan.tsx:130`. The shipped iOS build marks every purchased food as safe for an
   ARFID child. Web BulkAddFoodDialog also defaults its toggle to safe
   (BulkAddFoodDialog.tsx:40).
4. **Receipt scan duplicates on web.** `parseResponseToReviewRows` computes
   `matchedFoodId` (receiptParse.ts:86-91), then `acceptedRowsToFoods` ignores it and
   inserts every line as a new food (:101-114). iOS increments instead. `unitPrice` and
   `lineTotal` are parsed and then dropped, though `foods.price_per_unit` exists.
5. **Web grocery check-off corrupts units.** Grocery.tsx:360-364 adds the raw quantity
   and overwrites `unit` with the grocery unit (16 oz + "2 lb" gives 18 lb). iOS converts
   (US-363). Web has `unitNormalize.ts` and doesn't call it here.
6. **Cross-platform double credit.** Web credits the pantry on each check-off
   (Grocery.tsx:354-376). iOS credits only on "Move checked to pantry", which reads the
   shared `checked` flag (AppState.swift:1873). Web ticks, iOS moves: the items are
   counted twice. US-739 ("credits by item id, once") is open.
7. **Web has no expiry UI at all.** `expiry_date` exists (migration 20260425000000) and
   iOS reads and writes it, but no web file outside types.ts references it, and the web
   `Food` type (src/types/index.ts:7-33) has no `expiry_date`, `barcode` or
   `price_per_unit`. Web edits don't clear it, but web users can't see or set it.
   `nutrition_info` is in the web type but isn't a `foods` column.
8. **iOS "Expiring food" notification is a dead toggle.** The topic is defined
   (NotificationService.swift:261-304) and described as "event-driven... fire from their
   own triggers" (:406), but nothing in the iOS tree posts it.
9. **Waste only works in flat view.** `onWaste` goes to FoodCard (Pantry.tsx:1069) but
   not to `PantryCategorySection`/`PantryListItem`, and the grouped view is the default
   (:277-281).
10. **Three barcode stacks.** Web uses the edge function and catalog, iOS and Expo call
    OFF directly. Only web promotes into the catalog (US-797), and the web scanner lives
    in `components/admin/`.
11. **Dedup is name-only on web.** ImageFoodCapture matches on name + category + package
    (Pantry.tsx:510-516) and grocery on display name; there's no barcode or canonical_id
    match. iOS matches barcode first. US-730 (alias memory on every add path) and US-662
    (merge proposals) are open, and `merged_into_id` has no reader.
12. **Restock parity is inverted.** Web forecasts from depletion, iOS from purchase
    cadence. Neither appears on the web Pantry page.
13. Pantry.tsx sits at 1418 lines, and `LOW_STOCK_THRESHOLD` ignores units (see 1).

## 3. Benchmark (brief)

- **KitchenPal**: dependable barcode scan while unpacking, expiry, recipes from what's
  on hand, cross-platform. Recommended by NPR and Healthline.
- **Pantry Check**: very fast scanner, storage locations, expiry reminders, a list built
  from usage, family sync. iOS only, and the free tier stops around 200 items.
- **NoWaste**: built around expiry and waste, $7/yr. Loved for being single-purpose.
- **Fridgely**: scan, expiry, reminder. Utilitarian, one item at a time, no receipt AI.
- **Cooklist**: links 75+ US store loyalty cards, so the pantry fills itself; receipt
  scan as the fallback; recipes matched to what you have. 4.7 on iOS. The clearest
  answer to manual upkeep.
- **SuperCook**: doesn't keep a real inventory. You tick ingredients or photograph the
  fridge and get recipes. Its argument is that nobody maintains a pantry.
- **Samsung Food**: pantry is paywalled and basic. Complaints: no leftovers or
  batch-cook tracking, bugs that stay open.

The complaint every one of these shares is upkeep: one-at-a-time scanning, and counts
that drift because cooking never subtracts. The apps that do well get stock in with no
typing (loyalty cards, receipts, a photo) and take it out with no typing (cooking a
recipe deducts, expiry prompts "used or tossed?"). SuperCook shows the other route:
make exact counts optional and settle for "have / low / out".

## 4. EatPal's angle

Nobody else knows which of these foods *this child* will eat. The pantry should answer:
"Do we have Maya's safe foods for this week?", "Is tonight's try-bite in the house?",
"Which safe food is about to run out? Losing it is a meltdown, not an inconvenience."
Hence:
- **Safe-food stockout protection**: a food on a kid's safe list at low or out stock is
  a higher-priority alert than anything else, and goes straight to the grocery list.
  `SafeFoodInsuranceSection.tsx` already exists and can host it.
- **Separate "we own it" from "the child eats it"** in the UI (and eventually in the
  data), so upkeep in the pantry can never damage ladder history.
- **Presence over precision.** Parents of picky eaters want "have / low / out" for
  staples. Keep exact counts optional (SuperCook's lesson) and default to presence.
- **Waste framed around exposure.** A try-bite food bought and then thrown out is a
  signal ("bought 3 times, tossed 3 times; buy a single-serve size").

## 5. Prioritized recommendations

### P0
1. **Security finding S2** (withheld until fixed). Effort S. Edge function + web.
2. **Stop pantry delete from destroying child history.** Short term, the delete
   dialogs say what's lost ("also deletes 14 meal logs and Maya's ladder") and the
   zero-qty prompt drops "remove" for foods referenced by plan entries or ladders. Real
   fix: an "archive" of `ADD COLUMN archived_at timestamptz NULL` that clients filter
   on. Old iOS builds will show archived rows, which is harmless; nothing is dropped.
   Effort M. All three platforms. DB: additive column + index.
3. **US-803 on iOS and Expo.** Five sites listed in 2.3, plus the web bulk-add default.
   Effort S. iOS ships through a release (hotfix-worthy: this is the ARFID safety
   flag). DB: none. A trigger forcing `is_safe=false` on insert would break old builds'
   deliberate adds, so don't.
4. **Receipt dedup + price on web.** Use `matchedFoodId` to increment, and write
   `price_per_unit` from `unitPrice`. Effort S. Web. DB: none.
5. **One crediting rule for purchases.** Ship US-739: credit on "done shopping" by
   grocery item id, idempotently (ref_type `grocery_item` in movements already allows
   it). Until then, web should not credit on check-off when the household has iOS
   users, or iOS should skip items web already credited. Effort M. Web + iOS. DB:
   uses the existing ledger.

### P1
6. **Expiry on web**: add fields to the `Food` type, a date in AddFoodDialog with
   iOS's per-category defaults, a chip on cards, an "Expiring" filter, a dashboard card.
   Effort M. Web (Expo later). DB: none.
7. **Expiry that closes itself**: expiring food prompts "used / tossed / still good"
   (writing `cook`/`waste`/`expire` movements), and wire the iOS `expiringFood`
   notification (local notification scheduled from `expiryDate`). Effort M. iOS + web.
   DB: none.
8. **Safe-food stockout alerts**: join `foods` x kid safe lists / ladder x stock status;
   low or out goes to the top of Pantry and Home with one-tap add to grocery. Effort M.
   Web + iOS. DB: none (optionally a view).
9. **Unit-aware stock status**: per-unit thresholds (count <= 1, mass/volume under 20%
   of `package_quantity`) through `unitNormalize`, plus the conversion in Grocery
   check-off. Effort S-M. Web + Expo (shared `foodFilters`). DB: none.
10. **Turn on the ledger** (US-672/683) once the US-785 comparison is clean. Cooking a
    recipe deducts (`rpc_cook_meal`, US-677): the single biggest cut to upkeep.
    Effort L. All. DB: already additive.
11. **One barcode path**: iOS and Expo go through `lookup-barcode` (after P0.1) so
    every scan feeds the catalog. Move the web scanner out of `admin/`. Effort M.
    DB: none.

### P2
12. **Photo/fridge restock into Pantry**: reuse `recognize-fridge-contents` with a
    confirm sheet ("add 6 items"). Effort M. iOS first, web via ImageFoodCapture.
13. **Restock parity**: port RestockPredictor to TS next to depletionForecast; show
    both on Pantry. Effort M. DB: none (`user_product_preferences` is shared).
14. **Storage locations** (fridge / freezer / pantry), as in Pantry Check. DB: additive
    `storage_location text NULL`. Effort M.
15. **Waste report** (US-681) with try-bite framing. Effort M. Web first.
16. **Split `foods` roles in data**: a view `pantry_items` (stock columns) and a view
    `kid_food_catalog`, dual-read before any split. Plan over at least 2 iOS releases per
    CLAUDE.md. Effort L.
17. **Loyalty-card / email-receipt import** (the Cooklist move). Effort L, vendor
    dependency. Park it until receipt scan is trustworthy.
18. Split Pantry.tsx (US-757). Effort M.

## 6. Touchpoints with other modules

| Touchpoint | Where | State |
| --- | --- | --- |
| Grocery -> Pantry (bought) | web Grocery.tsx:354-412 per check-off; iOS AppState.swift:1872 explicit move | **Broken**: double credit across platforms, web unit overwrite, iOS `is_safe: true` |
| Pantry -> Grocery (restock) | web Pantry.tsx:455, iOS PantryView.swift:345, Expo pantry.tsx:237 | Works; web writes no `added_via='restock'` (iOS does) |
| Predictive restock | web SmartRestockSuggestions on Grocery; iOS RestockPredictor + ExpiringRestockSuggester in GroceryView | Different models, neither on web Pantry |
| Planner "ate" -> Pantry debit | Planner.tsx:508 `deduct_food_quantity` | Works, but RecipeDetail "I made it" doesn't debit (cross-module review s.3) |
| Recipes <- Pantry | `suggest-recipes-from-pantry` (Recipes.tsx:450), `recipeShortfall.ts`, iOS RecipeMatcher/PantryCoverage | Shortfall ignores `unitNormalize` (on-hand read as 0 on unit mismatch) |
| Plan -> Grocery pantry subtraction | US-680/736 open | **Missing** on some web paths |
| Kids / ladder / food_attempts | FKs on foods.id with CASCADE | **Dangerous**: pantry delete wipes history |
| Safe-food insurance | SafeFoodInsuranceSection.tsx | Doesn't read stock; easy P1 hook |
| Catalog (grocery_product_catalog) | FoodsContext:88, lookup-barcode promote, match_foods_to_catalog | Web only; iOS/Expo scans never promote |
| Billing / plan limit | checkFeatureLimit + trigger, 50 foods on free | Auto-created purchased foods eat the child-catalogue quota |
| Household sync | web realtime by household; iOS RealtimeService:39; Expo none, filters user_id | Expo hides a partner's foods |
| Budget | iOS BudgetService.pantryInventoryValue | Web receipt drops price, so the value is always partial |
| Notifications | iOS expiringFood topic | **Dead**: nothing fires it |
| AI coach / suggestions | `suggest-foods` receives foods + planEntries | Works; suggestions add as try-bite (right) |

## Sources
- [Fango: Pantry Check alternatives](https://fango.fi/en/blog/pantry-check-app-alternatives/)
- [mystockwell: best pantry inventory apps 2026](https://mystockwell.com/best-pantry-inventory-apps)
- [Pantry Persona: ranked by how food gets in](https://www.pantrypersona.com/blog/best-pantry-inventory-apps-2026)
- [Cooklist on the App Store](https://apps.apple.com/us/app/cooklist-pantry-to-recipes/id1352600944)
- [Recipy: pantry tracking apps tested](https://recipyapp.com/blog/best-pantry-tracking-apps-2026)
- [SuperCook review 2026](https://quickdishcookbook.com/supercook-the-best-app-for-using-up-the-ingredients-in-your-pantry/)
- [MealThinker: Samsung Food limits](https://mealthinker.com/blog/samsung-food-alternative)
- [Plan to Eat: Samsung Food pros and cons](https://www.plantoeat.com/blog/2026/01/samsung-food-review-pros-and-cons/)
