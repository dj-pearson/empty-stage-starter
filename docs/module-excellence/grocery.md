# EatPal grocery / shopping helper: module audit (2026-09-22)

Read-only audit of `/home/user/empty-stage-starter` at `ca6debe`. Web = `src/`, Expo = `app/` (slated for deletion by US-720), iOS = `ios/EatPal` (live, 1.0.9).

## Verdict

iOS already has most of what a top-tier list app needs: store walk order, shopping mode with keep-awake and a Live Activity, a Watch list, Siri intents, voice/photo/text add, an AR shelf finder, restock suggestions, and plan provenance via `grocery_item_sources`. The web has multiple lists and an offline queue but little else from that set. It groups aisles in insertion order, never picks a store, credits the pantry by lowercased name, and has a dead Instacart button. EatPal's real edge is per-kid knowledge (safe foods, allergens, brand loyalty), and no platform uses it at the moment someone is shopping. Most of the web gap is already written up as open PRD stories (US-729/730/732/736/737/739/749/752/753). The job is mostly to ship those, plus the kid-aware layer that nothing plans yet.

## 1. Inventory today

### Web (`src/pages/Grocery.tsx`, 1664 lines)
| Feature | Evidence | State |
|---|---|---|
| Multiple lists, per-list filter, default list | `Grocery.tsx:120-184` `filterItemsByList`; `GroceryListSelector.tsx`, `Create/ManageGroceryListsDialog.tsx` | Works (US-714, US-857, US-864) |
| Group by aisle/category, phone-width folding | `Grocery.tsx:752-800`, `src/lib/groceryData.ts:131` `groupItems` | Groups come out in **insertion order**, with no walk order |
| Store layouts / aisles | `Create/ManageStoreLayoutsDialog`, `ManageStoreAislesDialog` mounted `Grocery.tsx:1581-1625` | **Half-built**: `selectedStoreLayoutId` is declared at `:132` and `setSelectedStoreLayoutId` is never called, so it is always null |
| Aisle crowd-sourcing | `Grocery.tsx:319-345` queries `user_store_contributions` + `food_aisle_mappings` and shows the prompt when `Math.random() < 0.5` | **Dead** (gated on the null store id above). US-729 AC removes the random prompt |
| Generate from plan | `Grocery.tsx:263-308` -> `mealPlanner.ts:131` `generateGroceryList` | Persists (US-713) but counts **foods per meal** and ignores recipe ingredients and servings (comment `:261`; US-736 open) |
| Check-off -> pantry | `Grocery.tsx:310-413` | Flag off: credits the pantry per tap by **lowercased name** (`:249`). The undo closure at `:384` reads the stale `foods`. Flag on: credits once at checkout (`:462`), with a `wasSkipped` double-credit branch (US-739 open) |
| Quantity stepper | `Grocery.tsx:443` `Math.max(1, ...)` | Floors at 1, so 0.5 lb can't be entered (US-752 open) |
| Smart restock | `SmartRestockSuggestions.tsx:156` RPC `detect_restock_needs` + depletion forecast | Works; per-kid param; daily cap test |
| Receipt scan | `ScanReceiptDialog.tsx:199` `addFoods` | Writes **straight to the pantry**: no list check-off, aisle, resolver or price (roadmap item 23) |
| Import recipe to list | `ImportRecipeToGroceryDialog.tsx` | Works; stamps `source_recipe_id`, which nothing reads |
| Export: print, CSV, text, "AnyList CSV", Web Share, copy | `Grocery.tsx:669-750` | CSV at `:677` does not escape embedded quotes |
| Offline queue (insert/toggle/update/delete) | `src/lib/webSyncQueue.ts`, `applyPendingOpsToGroceryItems:252` | Solid, tested (US-823) |
| Realtime | `GroceryContext.tsx:88` one `grocery_items` channel | Works; no presence, and lists/stores are not realtime |
| Collaborative shopping mode | `CollaborativeShoppingMode.tsx` (306 lines, uses `shopping_sessions`) | **Orphan**, no importer; allowlisted in `scripts/ci/check-orphan-components.mjs:42` pending US-752 |
| Order ingredients (Instacart) | `OrderIngredientsDialog.tsx`, mounted only from `Recipes.tsx:994` | **Cannot work**: `lib/integrations/instacart.ts:427` reads `process.env.INSTACART_API_KEY` in the browser, which throws, so the key is `''` -> "not configured" at `:89`. It would also put a partner key in the client. The edge function `process-delivery-order` is a documented simulation (`index.ts:21`, mock order id `:353`) |
| Priority, who-added, photo, brand | Columns exist (`20260416000000_grocery_priority.sql`, `20251014000003...:171-191`) | Written through `groceryRow.ts`; priority and `added_by_user_id` are never rendered on web |
| Shopping mode / wake lock / price totals | none | US-739, US-749 open |

### iOS (`ios/EatPal/EatPal`)
- `Views/Grocery/GroceryView.swift` (2021 lines): swipe to check or delete, multi-select, filters, walk-order sections (`:194` `storeLayouts.walkOrder`), pin a store to the default list (`:1466`), generate from the week plan with kid ids (`:1501`), "Suggested for you" restock and expiring-restock pills (`:400-477`), move to pantry, a spend link to Budget (`:733`).
- `ShoppingModeView.swift`: idle timer off (`:151`), haptics, "N left", and it drives `GroceryTripActivityService` + `EatPalWidget/GroceryTripLiveActivity.swift` (Lock Screen / Dynamic Island).
- Add paths: `QuickAddGrocerySheet`, `VoiceAddGrocerySheet`, `TextImportGrocerySheet`, `PhotoImportGrocerySheet`; `GroceryAppIntents.swift` (Siri "add X", bulk add); a share extension (`EatPalShare`).
- `ARShelfFinderView.swift` (US-277): a live barcode overlay that checks off listed items or adds saved products from `user_product_preferences` (`SmartProductService.swift`, which learns brand and aisle on edit).
- Receipt: `Views/Pantry/ScanReceiptSheet.swift` + `ReceiptScanService.swift:60` -> `parse-receipt-image`.
- Watch: `EatPalWatch Watch App/Views/GroceryWatchView.swift` (remaining count, check-off via the WC session).
- Provenance: `GroceryGeneratorService.swift` writes `grocery_item_sources` (`DataService.swift:220-241`); web never reads it.
- **Gap:** iOS has **no list picker**. `fetchGroceryItems` (`DataService.swift:502`) loads every row and GroceryView never filters by `grocery_list_id`, so a web household's "Costco" and "Weekly" lists merge on the phone. The store pin always targets the default list (`:1467`).

### Expo (`app/(tabs)/lists.tsx` 752, `scan.tsx` 443)
Its own list with the durable `syncQueue` (`lists.tsx:151`) and an OpenFoodFacts barcode lookup. It's retiring (US-720), so invest nothing. The one thing to port first is the name->unit table in `app/mobile/lib/unit-suggestions.ts` (US-720 AC).

### Backend
Tables: `grocery_items` (+ list, aisle, aisle_section, priority, brand_preference, barcode, photo_url, price_per_unit, currency, source_recipe_id, source_plan_entry_id, added_via, added_by_user_id), `grocery_lists` (+ `store_layout_id`), `store_layouts` (+ `aisle_overrides` jsonb), `user_store_layout_overrides`, `store_aisles`, `food_aisle_mappings`, `user_store_contributions`, `grocery_item_sources`, `shopping_sessions`, `grocery_purchase_history`, `restock_history`, household auto-restock prefs, and 7 delivery tables (`20251110000007_grocery_delivery.sql`). `inventory_movements.unit_price` exists (`20260901000006`). RPC `bump_grocery_item_quantities` (`20260613000002`). Functions: `parse-receipt-image`, `lookup-barcode`, `enrich-barcodes`, `parse-recipe-grocery` (to retire, US-733), `process-delivery-order` (simulation).

## 2. Benchmark

| App | Loved | Complaints / gaps |
|---|---|---|
| AnyList | Recipe->list, auto-categorise, fast sync (~1.7 s in one test), Siri, web app, household plan $14.99/yr | iOS-first, dated Android, weak price tracking |
| OurGroceries | Near-instant shared sync, free core, aisle sort, barcode, Alexa/Siri/Google voice | Plain UI, no pantry or plan intelligence |
| Bring! | Icon grid, fast tapping, store deals, shared lists | Ads and deals clutter; weak quantities |
| Listonic | Smart aisle sort, guest sharing with no account, learned suggestions | Ads, third-party data sharing, no prices |
| Out of Milk | List + pantry + to-do | US/CA only, suggestions only after typing |
| Paprika | Recipe clipper, scale, merge ingredients into list, pantry | Per-platform purchase, sync hiccups, no sharing model |
| Instacart / Kroger / Walmart | Real prices, aisle location (Kroger sorts by aisle per store), substitutions, reorder "buy it again" | Locked to one retailer; lists are a sales funnel |

Table stakes that EatPal web misses: auto-categorise as you type, walk-order sort, sub-second shared sync with who-added visible, voice add, recurring "staples", fractional quantities, and one-tap retailer handoff. Instacart's Developer Platform offers `/idp/v1/products/products_link` and `/products/recipe`, which return a hosted shoppable page. It's server-side, needs no cart API, and NYT Cooking uses it. That's the realistic delivery path; the per-provider simulation isn't.

Sources: [Homsy](https://gethomsy.com/blog/meal-planning/shared-grocery-list-app), [BuyBye](https://getbuybye.com/blog/best-shopping-list-apps/), [Groceries Tracker](https://groceriestracker.com/blog/best-grocery-list-apps-2026), [Fond](https://fond.kitchen/guides/best-grocery-list-apps/), [SmartCart Family](https://smartcartfamily.com/en/blog/grocery-apps-comparison), [Listonic vs Out of Milk](https://listonic.com/compare-apps/listonic-vs-out-of-milk), [Instacart IDP intro](https://docs.instacart.com/developer_platform_api), [Instacart recipe page](https://docs.instacart.com/developer_platform_api/guide/concepts/recipe/), [Kroger list](https://www.kroger.com/shopping/list).

## 3. EatPal's angle: shopping for the kid who eats six things

No generic list knows that Maya only eats the Annie's bunny mac and that the store brand is a meltdown. EatPal does, or could. The data is there: `grocery_items.brand_preference`, `user_product_preferences` (iOS), `foods.is_safe/is_try_bite`, kid allergens (`kids.allergens`), `kid_food_success_stats`, and the plan per kid. Where grocery should lean in:
1. **Safe-food never-run-out.** Safe foods are load-bearing; running out of one ruins dinner. Restock should rank a safe food below its threshold above everything else and label it "Maya's safe food". Today `detect_restock_needs` takes `p_kid_id` but the UI doesn't say why an item matters.
2. **Exact-product lock.** Brand + size + barcode per item per kid ("only this one"), shown in-store as a badge and in the AR finder. If the scanned barcode doesn't match the lock, warn "not Maya's usual". Substitution rules ("OK: Kraft shapes; never: store brand") carry over to Instacart handoff notes.
3. **Allergen guard at add and at scan.** Warn when an item or scanned barcode conflicts with any household kid's allergens. Web only appends allergen text to notes (`AddGroceryItemDialog.tsx:128-131`); nothing blocks or flags it.
4. **Try-bite budget.** One "try this week" item per kid, sized small (single-serve), sourced from food chaining. It turns the list into part of the feeding plan instead of a chore.
5. **Plan-driven, per-plate quantities.** One pan, four plates (US-613) means the list should buy one recipe plus each kid's side, not N recipes. That needs recipe-aware generation (US-736) and a projection (US-737), with a "for whom" chip on each row.

## 4. Prioritised backlog

Effort: S <= 2 days, M <= 1 week, L > 1 week. Every DB change listed is additive: new nullable columns or new tables with RLS. No renames or drops.

### P0: broken or table stakes
| # | What | Why / evidence | Effort | Platforms | DB |
|---|---|---|---|---|---|
| 1 | Wire store choice on web: the list's `store_layout_id` drives `selectedStoreLayoutId`, groups sort by ported `walkOrder` (US-732) | Setter never called (`Grocery.tsx:132`); aisles show in insertion order (`groceryData.ts:131`); iOS already does this (`GroceryView.swift:194`) | M | Web | none (columns exist) |
| 2 | Auto-categorise + aisle on add, correction learns (US-729/730); drop `Math.random` prompt | Table stakes (AnyList/OurGroceries); `Grocery.tsx:340` | M | Web, iOS parity via fixtures (US-758) | reuse `foods.aisle`/`food_aisle_mappings` |
| 3 | iOS list picker + filter by `grocery_list_id`; store pin follows the selected list | iOS merges all web lists (`DataService.swift:502`, pin at `GroceryView.swift:1467`) | M | iOS | none |
| 4 | Checkout by item id, once, undo from current state (US-739) | Name-match crediting `Grocery.tsx:249`, stale undo `:384`, `wasSkipped` branch `:482` | M | Web | uses `inventory_movements` |
| 5 | Fractional quantities + delta bumps (US-752 part) | `Math.max(1, ...)` at `:443`; concurrent edits overwrite | S | Web | RPC exists (`bump_grocery_item_quantities`) |
| 6 | Remove or replace the Instacart dialog | Cannot succeed (`instacart.ts:427`); client-side key design is unsafe; delivery function is a simulation | S (hide) | Web | none |
| 7 | Receipt scan checks off matching list rows, keeps prices, and goes through the resolver | `ScanReceiptDialog.tsx:199` bypasses the list; US-749 AC1 | M | Web, iOS | `inventory_movements.unit_price` exists |

### P1: make it the best
| # | What | Why | Effort | Platforms | DB |
|---|---|---|---|---|---|
| 8 | Recipe-aware generation with servings and pantry subtraction (US-736), then list-as-projection via `grocery_item_sources` (US-737) with a "By meal" view | Web counts foods and ignores recipes (`mealPlanner.ts:131`); iOS writes sources that web ignores | L | Web (iOS already partial) | table exists; add nullable `grocery_item_sources.kid_id` for "for whom" |
| 9 | Auto-check sourced rows when the meal is cooked (review R3) | `source_recipe_id` written, read nowhere | S | Web, iOS | none |
| 10 | Web shopping mode: wake lock, big tap targets, swipe-check, running total (US-739/749) | Parity with `ShoppingModeView.swift`; in-store use is phone-web | M | Web | none |
| 11 | Presence + "who added / who ticked" (US-752): wire `CollaborativeShoppingMode` to the household channel or delete it | OurGroceries/AnyList's main draw; orphan at `check-orphan-components.mjs:42` | M | Web, iOS | render existing `added_by_user_id`; add nullable `checked_by_user_id` |
| 12 | Safe-food never-run-out + kid badges on rows | EatPal's differentiator; restock RPC already per kid | M | Web, iOS | view joining foods.is_safe + stock; no new table |
| 13 | Exact-product lock and substitution rules per kid | Picky-eater brand loyalty; `brand_preference` exists but is free text | M | iOS first (AR finder, SmartProductService), web | new `kid_product_preferences(kid_id, food_id, barcode, brand, size, rule enum 'only'/'ok'/'never')` with RLS |
| 14 | Allergen conflict warning at add and scan | Only a notes append today (`AddGroceryItemDialog.tsx:128`) | S | Web, iOS | none (reads `kids.allergens`, `foods.allergens`) |
| 15 | Instacart handoff via IDP `products_link` from an edge function (key server-side), carrying brand locks as line notes; retire the simulation tables' UI | Realistic "order it" path; roadmap US-648 landing pages need a working product | M | Web, iOS | reuse `grocery_delivery_orders` or a small `delivery_handoffs` log |
| 16 | One add sheet with type/paste/voice/scan/photo (US-753) | Web has one text dialog; iOS has five sheets | L | Web | none |

### P2: delight and money
| # | What | Why | Effort | Platforms | DB |
|---|---|---|---|---|---|
| 17 | Price history + "cheaper at X" + weekly actual spend feeding Budget (US-749) | Groceries Tracker's selling point; Budget uses estimates | M | Web, iOS | new `item_price_history` view over movements |
| 18 | Recurring staples ("every week: milk, bananas") with one-tap re-add | Listonic/Kroger "buy it again" | S | Web, iOS | new nullable `grocery_items.recurrence` or a `staples` table |
| 19 | Try-bite item per kid per week, single-serve sizing | Ties grocery to the feeding program | S | Web, iOS | none (added_via value 'try_bite'; the check was dropped in `20260509000000`) |
| 20 | Web voice add (Web Speech API) + PWA share target to the list | AnyList/OurGroceries voice parity | S | Web | none |
| 21 | Shopping reminders and "partner ticked items" digest (US-747) | Shared-household value | M | Web, iOS | `profiles.timezone` (planned) |
| 22 | Watch: check-off by aisle section, complication for "N left" | Already partial | S | iOS | none |
| 23 | CSV export escaping + real AnyList/OurGroceries import | `Grocery.tsx:677`; switching cost | S | Web | none |

## 5. Touchpoints with other modules

| Module | Handoff | State |
|---|---|---|
| Planner -> Grocery | Generate from plan (`Grocery.tsx:263`, `GroceryGeneratorService.swift`) | Web: food counts only, no recipes or servings (US-736). iOS: recipe-aware plus sources. **Broken parity** |
| Planner -> Grocery (live) | Add, swap or remove a meal updates the list | **Missing** on web (US-737); `grocery_item_sources` has no web reader or writer |
| Planner "made" -> Grocery | Auto-check items for a cooked meal | **Missing** everywhere; `source_recipe_id` is write-only (cross-module review R3) |
| Recipes -> Grocery | `ImportRecipeToGroceryDialog`, `MissingIngredientsSheet.swift`, `recipeShortfall.ts` | Three shortfall implementations disagree (review table rows 37-39; US-676 open) |
| Recipes -> Delivery | `OrderIngredientsDialog` from `Recipes.tsx:994` | **Broken** (no key, simulation backend) |
| Grocery -> Pantry | Check-off / checkout credit | Name match on web (`:249`) vs ledger behind a flag; receipt scan skips the list. `is_safe` default fixed (US-803) |
| Pantry -> Grocery | Restock suggestions, depletion forecast (`depletionForecast.ts`, `RestockPredictor.swift`) | Works; web refetch not household-filtered (US-752 AC) |
| Kids -> Grocery | Kid filter on generation; allergens; safe foods | Items carry no `kid_id` (review line 25); allergens only as note text; safe foods get no priority. **Missing** |
| Budget -> Grocery | Spend link (`GroceryView.swift:733`); `price_per_unit` columns | Web Budget uses estimates; prices from receipts are dropped (US-749) |
| Household -> Grocery | RLS by household (`20260531000001`), realtime channel | Works; no presence, and web doesn't show who-added |
| Catalog / barcode | `lookup-barcode`, `enrich-barcodes`, catalog promotion (US-797) | iOS AR + Expo scan use it; web has no barcode entry |

## Suggested sequencing
Weeks 1-2: P0 items 1, 2, 5, 6 on web and 3 on iOS (ships in the next TestFlight; no migration). Weeks 3-5: items 4, 7, 8, 9, which close the plan->list->pantry loop, the one thing no competitor has. Then 12-14 as the picky-eater layer to market, and 15 as the monetisable handoff.
