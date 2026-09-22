# EatPal module audit: Recipes / recipe keeper

Audited 2026-09-22 against the working tree of `empty-stage-starter`. Read-only. Line numbers are from the current tree.

**Short version.** iOS has the most complete recipe keeper of the three surfaces (URL import that keeps quantities, share extension, live scaling, cook mode, cookable-now). Web has the most features on paper (collections, hide-veggies variants, per-kid plates, schema markup, AI suggestions), but several of them are cosmetic or never reach the database. Expo is read-only. Import quality is the biggest weakness on every surface: `parse-recipe` sends even perfect schema.org JSON-LD through an LLM and truncates it at 8,000 chars, and the web importer throws away the structured quantities its own parser returns. Most of P0 is already specified as US-721..751 in `prd-household-planner.json`. The gaps below that are **not** in any PRD are marked NEW.

## 1. Inventory

### Data model (Supabase)
- `recipes`: name, description, instructions (text; web stores a JSON array of steps), `food_ids uuid[]`, prep/cook time as free text, `servings` text plus `servings_min/max/default_servings` (`20251110000003_recipe_scaling.sql:5-8`), image/source url, `source_type` CHECK (`20260427000000_extend_recipes_source_type.sql:13`), tags, rating (scalar), times_made, last_made_date, difficulty, `kid_friendly_score`, `nutrition_info jsonb`, `is_favorite`, `parent_recipe_id`/`variant_kind` (`20260513000001_hidden_veggies.sql:70-74`).
- `recipe_ingredients` (structured rows, household RLS per US-711), `recipe_components` (deconstructed plates, `20260806000000_recipe_components.sql:26`), `recipe_collections` + `recipe_collection_items`, `hidden_veggie_techniques`.
- **Orphan tables**: `recipe_photos` and `recipe_attempts` (`20251014000003_grocery_recipe_phase1_complete.sql:108,129`) have zero readers or writers on web, Expo, iOS or edge functions. `servings_min/max/default_servings` are decoded on iOS only and written by nobody.

### Feature matrix

| Feature | Web | iOS (live) | Expo |
|---|---|---|---|
| List/search/filter/sort | Yes, virtualized (`Recipes.tsx`, `recipeFilters.ts:181`) | Yes (`RecipesView.swift`, `Utilities/RecipeFilters.swift`) | Yes, read-only (`app/(tabs)/recipes.tsx:126`) |
| Create/edit with structured ingredients | Yes (`EnhancedRecipeBuilder.tsx`, US-721) | Yes (`EditRecipeView.swift`, rows derived from text by legacy parser) | No |
| URL import | Yes, via `parse-recipe-grocery` (`ImportRecipeDialog.tsx:159`) | Yes, via `parse-recipe` (`RecipeImportService.swift`, `RecipesView.swift:1532`) | No |
| Photo/OCR import | Yes (`ImportRecipeDialog.tsx:126`, vision model) | No (the "Recipe Photo" section at `RecipesView.swift:1416` is a cover image) | No |
| Paste text / JSON import | Yes (`ImportRecipeDialog.tsx:192,216`) | Share-sheet text goes to grocery, recipe option disabled (`ShareViewController.swift:15-17`) | No |
| Share sheet / Shortcuts | PWA share target not wired (US-723) | Share extension + App Intent + deep link (`EatPalShare/`, `Intents/RecipeAppIntents.swift:48`, `AppState.swift:93`) | No |
| Scaling | **Cosmetic**: multiplier changes the "Servings" label only (`RecipeDetailView.tsx:476-491`) | Live, persisted per recipe (`RecipesView.swift:685-835`) | No |
| Ingredient display with quantities | **No**: checklist lists pantry `food.name` + stock (`RecipeDetailView.tsx:509-530`); `additionalIngredients` shown raw | Yes (`RecipesView.swift:721`) | Text only |
| Cook mode | Steps, regex timer, wake lock (`CookMode.tsx:34,60`) | Steps, idle-timer off (`CookModeView.swift:42`), no timers | No |
| Collections | Yes (web-only; `Recipes.tsx:239-256`) | No | No |
| Favorites | UI only, **not persisted** (see bugs) | Yes (`Recipe.swift:53`, `RecipeUpdate.isFavorite`) | No |
| Rating / "I made it" | Scalar rating; made-count bump on button (`RecipeDetailView.tsx:171,176`) | Rating field; never bumps `times_made` | No |
| Nutrition | Manual or auto-summed from pantry foods, one-of-each (`RecipeDetailView.tsx:148-157`) | Displays stored `nutrition_info` (`RecipesView.swift:1222`) | No |
| Hide-veggies variants | Yes (`HideVeggiesDialog.tsx:112,272`) | No (`Recipe.swift` has no `parent_recipe_id`/`variant_kind`) | No |
| Per-kid plating (components) | Sibling Meal Finder only (`useRecipePlates.ts:76`, `SiblingMealFinder.tsx:134`) | No | No |
| Cookable now | "Ready to cook" filter | `CookableRecipesSheet.swift` | Filter chip |
| Share / export | Share button to `/recipes/:id`, a route that does not exist (`RecipeShareButton.tsx:21`); `RecipeExportActions` built but never mounted | None found | No |
| Schema.org JSON-LD | `RecipeSchemaMarkup` rendered inside authenticated cards (`EnhancedRecipeCard.tsx:113`), so no crawler sees it | n/a | n/a |
| AI suggest | `suggest-recipe`, `suggest-recipes-from-pantry` (US-734 says the builder button sends the wrong payload) | `AIMealService` | No |

### Bugs and half-built things (evidence)
1. **Web favorites never persist.** `handleToggleFavorite` calls `onUpdateRecipe(id, {is_favorite})` (`RecipeDetailView.tsx:189`), but `updateRecipe` maps no `is_favorite` into `dbUpdates` (`RecipesContext.tsx:439-463`) and `addRecipe` omits it too (`:334-359`). The heart flips optimistically, then the next server load resets it. iOS writes it correctly, so a web user's unfavorite is also invisible to iOS. NEW.
2. **Kid assignment is fiction.** The builder collects `assigned_kid_ids` (`EnhancedRecipeBuilder.tsx:120,313`) and the detail view renders them (`RecipeDetailView.tsx:687-693`), but there is no such column (not in `types.ts` recipes Row) and neither insert nor update sends it. Same for the import dialog's family/kid/meal-slot "designation" (`ImportRecipeDialog.tsx:318-322`), silently dropped. NEW.
3. **`kid_friendly_score` is never computed.** Only copied (`HideVeggiesDialog.tsx:272`, `RecipesContext.tsx:352`). The "Kid approved" filter (`recipeFilters.ts:118`, threshold 70) and the Expo chip (`recipes.tsx:80`) therefore always return nothing unless a row was seeded. NEW.
4. **Web import drops structured ingredients.** `parse-recipe-grocery` returns `{name, quantity, unit, notes}` objects (`parse-recipe-grocery/index.ts:157`); `mapRecipeToFormat` flattens unmatched ones into a comma-joined string and reduces matched ones to a `food_id` (`ImportRecipeDialog.tsx:250-285`), with no `recipe_ingredient_rows`. iOS fixed exactly this in US-584/585 by newline-joining; web still comma-joins, so "1 onion, diced" splits. Substring matching also links "egg" to "eggplant" and "oil" to "boiled". Partly covered by US-733/US-661.
5. **`parse-recipe` always calls the LLM**, even when JSON-LD was found, and truncates to 8,000 chars (`parse-recipe/index.ts:95-121`). Long recipes lose their final steps; nutrition, yield, keywords and HowToSection groupings in the schema are discarded. On parse failure it fabricates "Imported Recipe" (`:235`). Covered by US-733.
6. **Web and iOS use different parsers** for the same URL (`parse-recipe-grocery` vs `parse-recipe`), so the same link imports differently per device. US-733 retires one.
7. **Web add-to-planner explodes a recipe into N plan entries per kid**, one per `food_id` (`AddToPlannerPopover.tsx:71-79`), and refuses recipes with no linked foods (`:62`), which is every web URL import with no pantry match. iOS writes one entry per kid (`RecipesView.swift:1158-1185`). Also the `onAddToPlan` type omits `recipe_id` (`AddToPlannerPopover.tsx:19`). NEW (partly US-742 territory).
8. **`times_made`/`last_made_date` only bump from the web "I made it" button.** `rpc_mark_meal_made_v2` does not touch them (no reference in `20260614000001_mark_meal_made_v2.sql`), and iOS never writes them. Cook history is therefore wrong everywhere. Covered by US-750 (`recipe_cook_events`).
9. `addRecipe` writes `instructions: recipe.instructions ?? recipe.tips` (`RecipesContext.tsx:340`), so a tips-only recipe gets its tips duplicated into instructions. NEW, small.
10. Dead code: `RecipeImporter.tsx` calls a non-existent `import-recipe` function with `any` props (`RecipeImporter.tsx:9,22`); `RecipeBuilder.tsx` is unreferenced (US-734).
11. `RecipeDetailView` early-returns into `CookMode` (`:220`) with hooks below; web nutrition sums one unit of each food (US-751).
12. iOS cook mode has no timers; web cook mode has no ingredient drawer (US-751 web only; iOS NEW).

## 2. Benchmark

| App | Loved for | Complaints / gaps |
|---|---|---|
| Paprika | Buy-once, offline-first, reliable web clipper, grocery from recipes, pantry | Dated UI, separate purchase per platform, no social-video import, no nutrition out of the box |
| Mela | Beautiful cook mode, Live Text scan from photos/cookbooks, iCloud sync | Apple-only, no sharing with non-Apple family |
| Crouton | Share-sheet speed, ingredient quantities highlighted inside each step, Watch timers, hands-free | Apple-only, small ecosystem |
| Pestle | Social import, hands-free voice cook mode, SharePlay cook-along | iOS-only, tiny free tier |
| Recipe Keeper | Cross-platform, OCR from cookbooks, generous free tier | Plain UI, weak planner |
| Samsung Food | Huge catalog, per-recipe nutrition, smart appliance hooks, AI plans | Heavy, upsell-first, ads; your library feels secondary |
| AnyList | Best shared grocery list, recipe-to-list with aisle sorting | Recipe features are secondary, dated editor |
| Plan to Eat | Browser clipper, recipe-first planner, household sharing | Subscription only, no free tier |
| ReciMe / Honeydew | Import from TikTok/Instagram/YouTube: caption, then audio transcript, then source-site fallback; Instacart | $9.99/mo, 5-recipe free cap; import quality depends on captions |

The pattern: the category is won on **import that works on the first try** (including social video), **a cook mode you trust with messy hands**, and **a library that never loses a recipe**. Nobody in the list knows who is eating. That is EatPal's opening.

## 3. EatPal's angle: a recipe keeper that knows the kids

Every competitor stores a recipe. EatPal can tell a parent *which version of it each child will eat*. Concretely:
- **Per-kid verdict on every recipe.** Roll up `plan_entries.result` (recipe_id is already on the row, `types.ts:9545`) and `meal_votes` into "Ava ate it 3/4 times, Leo refused twice". This replaces the dead `kid_friendly_score` with a derived, per-kid number. US-750's `recipe_ratings(eater_id)` is the storage; the derivation is NEW.
- **Safe-food coverage badge.** For each kid, the share of a recipe's `recipe_ingredients.food_id`s that are on that kid's safe/tried list (`kid_food_ladder`). Filter "recipes Leo can eat tonight".
- **Import → "make it work for my kids".** After import, offer the hide-veggies twist, a deconstructed plate split (`recipe_components`), and allergen flags against kid profiles, in the review step. Competitors stop at saving.
- **Food chaining from recipes.** When a kid accepts a recipe, suggest the next-step recipe that changes one ingredient (`FoodChainingRecommendations.tsx` exists for foods only).
- **Kid cook mode.** A step list with pictures and "kid job" tags (wash, stir, sprinkle); exposure through cooking is standard feeding-therapy advice.

## 4. Prioritized backlog

Effort S = under 2 days, M = a week, L = multi-week. All DB changes are additive.

### P0: table stakes (a recipe keeper that does not lose or mangle recipes)
| # | What | Why / evidence | Effort | Platforms | DB |
|---|---|---|---|---|---|
| P0-1 | Persist `is_favorite` in web `addRecipe`/`updateRecipe` | Bug 1; favorites lost on reload, diverge from iOS | S | Web | None |
| P0-2 | Add `assigned_kid_ids uuid[]` (nullable) to recipes and persist it; or remove the picker until then | Bug 2; UI promises assignment it never saves | S | Web, then iOS | `ADD COLUMN assigned_kid_ids uuid[] NULL`; old iOS ignores it |
| P0-3 | One schema.org-first parser; LLM only as fallback; return structured ingredient objects; review-before-save in the builder; duplicate-URL warning | Bugs 4-6; US-733 + US-661 | M | Edge fn, Web, iOS | None (keep `parse-recipe` response shape backward compatible: add fields, keep `ingredients: string[]` alongside a new `ingredient_objects`) |
| P0-4 | Web detail renders `recipe_ingredients` with quantities and real scaling | Bug in `RecipeDetailView.tsx:476-530`; US-751 | M | Web | None |
| P0-5 | Scaling and structured ingredients on Expo; Expo create/edit/import | Expo is read-only today | M | Expo | None |
| P0-6 | Plan a recipe as one entry per kid with `recipe_id`, even with zero linked foods | Bug 7 | S | Web | None (plan_entries.recipe_id exists) |
| P0-7 | Cook history written by the Cooked action on every client | Bug 8; US-738/US-750 `recipe_cook_events` | M | All + RPC | New table (US-750); keep `times_made` as rollup |
| P0-8 | Real public share link (read-only recipe page) or remove the button; mount `RecipeExportActions` (print, copy, email) | `RecipeShareButton.tsx:21` 404s; US-734/US-748 | M | Web, iOS `ShareLink` | New `recipe_shares(token, recipe_id, household_id, revoked_at)` with RLS; public read via SECURITY DEFINER RPC granted to anon only for a valid token |
| P0-9 | PWA share target and iOS share of plain text → recipe | US-723; `ShareViewController.swift:15-17` disables text | S-M | Web, iOS | None |
| P0-10 | Collections on iOS | Web-only today; iOS is the live app | M | iOS | None |
| P0-11 | Timers on iOS cook mode; ingredient drawer on both | Bug 12 | S | iOS, Web | None |

### P1: best-in-class
| # | What | Why / evidence | Effort | Platforms | DB |
|---|---|---|---|---|---|
| P1-1 | Social video import (TikTok/Instagram/YouTube): caption → transcript → linked-site fallback | The ReciMe/Honeydew moat; share extension already receives URLs | L | Edge fn, iOS share ext, Web | Add `source_type` value `social` via new CHECK that is a superset (drop+add in one transaction keeps all existing labels) |
| P1-2 | Photo/cookbook OCR import on iOS using on-device Vision (`ImageTextRecognizer.swift` exists) then text parse | Mela/Recipe Keeper parity; no iOS photo import today | M | iOS | None |
| P1-3 | Per-kid verdict and safe-food coverage on every card; replace `kid_friendly_score` with a derived value | Section 3; bug 3 | M | All | View or RPC over plan_entries/meal_votes/kid_food_ladder; write the rollup into `kid_friendly_score` for old clients |
| P1-4 | Step-inline quantities (Crouton-style) and linked timers | Needs ingredient↔step link | M | All | Nullable `recipe_ingredients.step_index int` |
| P1-5 | Nutrition from quantities via canonical units, per serving, scales with servings; mark "unknown" rather than guess | US-751; current one-of-each sum is wrong | M | All | None (reuse `nutrition_info` shape, add `computed_at`) |
| P1-6 | Recipe notes and cook-photos per attempt | `recipe_attempts`/`recipe_photos` already exist unused | S-M | All | Reuse existing tables; verify RLS is household-scoped before first reader |
| P1-7 | Ranked search incl. ingredients, cuisine/course, cursor pagination | US-750; 200-recipe load cap history (US-819) | M | All | tsvector + GIN (US-750) |
| P1-8 | Hide-veggies variants and per-kid plates on iOS | Web-only today | M | iOS | Add `parentRecipeId`/`variantKind` to `Recipe.swift` (columns exist) |
| P1-9 | Offline library reads on web (service worker snapshot) | US-751; Paprika's core promise | M | Web | None |
| P1-10 | Bulk import from Paprika (.paprikarecipes), Mela, CSV/JSON; full export | Switching cost is the #1 barrier from Paprika users | M | Web, edge fn | None |

### P2: moonshots
- **Hands-free cook mode**: voice "next step", timers by voice (`VoiceInputService.swift` exists), Watch step mirroring (Watch target exists). M-L, iOS first.
- **Kid cook mode** with picture steps and "kid job" tags; logs an exposure event on the kid's food ladder. L. Nullable `recipe_steps` table or JSON on recipes.
- **Food-chain recipe paths**: "Leo eats plain pasta → try this buttered orzo → this mac with hidden squash", generated from accepted recipes plus `hidden_veggie_techniques`. L, AI.
- **Cookbook library scan** (whole book, batch OCR) and household recipe inbox where grandparents email recipes in. L.
- **Public recipe pages as SEO**: the share route from P0-8 prerendered with `RecipeSchemaMarkup` (today rendered only inside the authenticated app, so no crawler sees it). M, depends on US-570.

## 5. Touchpoints with other modules

| Handoff | State | Evidence |
|---|---|---|
| Recipe → Planner | **Broken on web**: N entries per kid, refuses unlinked recipes. iOS/Expo OK (one entry with recipe_id; Expo writes `food_id: null` when unlinked, `RecipeAddToPlannerModal.tsx:111`) | `AddToPlannerPopover.tsx:62-79` |
| Recipe → Grocery | Works with provenance (`source_recipe_id`, `added_via='recipe'`), but "add missing" hardcodes quantity 1 and uses pantry presence, not recipe quantities | `Recipes.tsx:344-358`; review doc R5; US-736 |
| Grocery provenance → mark made | Written, never read; no auto-check of sourced rows | cross-module review R3; roadmap item 29 |
| Recipe ↔ Pantry shortfall | Four implementations disagree (web detail presence-only, `recipeShortfall.ts`, `mealPlanner.ts`, Swift `GroceryGeneratorService`) | review doc lines 33-43; US-676 |
| Cook → Pantry debit | Not on web; iOS pending ledger work | US-677/679/683 |
| Recipe ↔ Kids/food tracking | Missing: no per-kid outcome shown on a recipe; kid assignment not persisted; `kid_friendly_score` never computed | Bugs 2-3 |
| Recipe ↔ Food ladder / chaining | Only in Sibling Meal Finder plates; nothing on the recipe page | `useRecipePlates.ts:100` |
| Recipe ↔ AI | Import (two parsers), suggestions, hide-veggies. Builder "Generate with AI" payload mismatch; pantry suggestions save without structured rows | US-734 |
| Recipe ↔ Nutrition | Web auto-sum ignores quantities; iOS shows stored only; nothing writes `nutrition_info` from import | `RecipeDetailView.tsx:148-157` |
| Recipe ↔ Realtime | `recipes` subscribed per household; `recipe_ingredients` edits from another device not folded in | `RecipesContext.tsx:314`; US-751 |
| Recipe ingredient columns across clients | Two column sets (`name` vs `ingredient_name`, etc.) | US-722 |

## Recommended order
P0-1, P0-2, P0-6 and bug 9 are each under a day and fix things users already believe work. Then P0-3 (one parser, structured rows, review step), since every downstream module (grocery quantities, shortfall, nutrition, scaling) is only as good as the ingredient rows import produces. Then P0-4/P0-7, then the per-kid verdict (P1-3), which is the feature no competitor can copy.

Sources for benchmark: [Swoodie 2026 comparison](https://swoodie.app/blog/best-recipe-manager-apps-2026), [Pluck comparison](https://pluckrecipes.com/blog/best-recipe-apps-compared/), [mise: Paprika vs Mela](https://trymise.app/blog/paprika-vs-mela), [ReciMe TikTok import help](https://recime.app/help/en/articles/11661452-import-from-tiktok), [Honeydew social import](https://honeydew-news.ghost.io/best-apps-saving-recipes-social-media/), [Plan to Eat on Samsung Food](https://www.plantoeat.com/blog/2026/01/samsung-food-review-pros-and-cons/), [RecipeOne list](https://www.recipeone.app/blog/best-recipe-manager-apps). Complaint columns combine these with general market knowledge; they were not verified against app-store reviews.
