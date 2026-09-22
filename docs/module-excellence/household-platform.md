# Household, onboarding and ambient surfaces (EatPal)

Audit date 2026-09-22. Read-only. Paths are repo-relative; `ios/` means `ios/EatPal/`.

## 0. Which surface is the product

Native Swift. Evidence:

- `ios/project.yml:26` ships MARKETING_VERSION 1.0.9 under bundle `com.eatpal.app` (`:90`); the Expo config claims the same bundle id at 1.0.0 (`app.config.js:15,31`). Only one can be the App Store binary, and the roadmap says it is Swift (`docs/web-platform-roadmap-2026-09.md:9-12`).
- US-720 "Retire the Expo client" is an open, agreed story (`prd-household-planner.json`; roadmap `:50`). US-852 records that Expo push "has never been able to work".
- Commits since 2026-06-01: `ios/` 32, `app/` 3, `src/` 53. All three `app/` commits were fixes or a11y.
- Only the Swift targets have a widget, Watch app, App Intents, share extension and Live Activity. Expo has none of them.

So: put no feature work into `app/`. Web is where the contracts land (release N) and Swift adopts them (N+1), per the roadmap. Every ambient surface below is Swift work that needs a Mac to verify.

## 1. Inventory today

### Household / co-parents
- Web: `/dashboard/household` (`src/pages/dashboard/Household.tsx`, 267 lines) handles members, rename, invite codes and remove. `ManageHouseholdDialog.tsx:25` is now a link to it. Data comes from `src/hooks/useHousehold.ts`. Invite acceptance is `src/pages/Join.tsx:41-49` via `accept_household_invite`.
- iOS: `Views/Settings/HouseholdSettingsView.swift` has members, a share sheet for the code (`:233`), join by code (`:283`, `:344`) and a `/join?code=` universal link (`Utilities/DeepLink*.swift:46-50,300`, US-851).
- DB: `household_members.role` is CHECK `('parent','guardian')` (`migrations/20251008035758...sql:14`) and both roles have identical rights. Seats: US-840, `20260909000000_household_seat_limit.sql`. Free and Pro get 1 seat, so sharing needs Family Plus (`docs/entitlements.md` agreed table).
- `grocery_items.added_by_user_id` exists (`types.ts:6098`) but no UI renders it. The only check-off state is `checked`: nothing records who ticked an item or when.
- Expo: nothing.

### Onboarding
- Web: `src/pages/Onboarding.tsx`, 1-2 steps. It asks "just me / me and a partner / my family" (`:47-65`), and only the family branch asks for a child's first name (`:193-230`). iOS mirrors this in `Services/OnboardingFlow.swift:10-55` (US-704/708/810).
- Home checklist: `OnboardingProgressBar.tsx:17-21` (child, 5 safe foods, plan, grocery list). `OnboardingReengagement.tsx:33-54` nudges after 3 days and sends the user to `/dashboard/kids`, not `/onboarding`.
- Picky-eater quiz: `src/pages/PickyEaterQuiz.tsx` and `PickyEaterQuizResults.tsx`. It is a marketing funnel, and none of its answers seed the account.

### Notifications
- Web: `NotificationPreferencesDialog.tsx:33-61` has 8 topic toggles, quiet hours and a daily cap, stored in `notification_preferences`. The web client has no push subscription at all; nothing calls `pushManager` or `register-push-token`.
- Server: `functions/process-notification-queue/index.ts:5,205-240` sends only through the Expo Push API. `schedule-meal-reminders` and `schedule-weekly-reports` enqueue. No `cron.schedule` in `supabase/migrations` invokes either scheduler or the queue processor (the only cron jobs are auth-rate-limit, revenue, interventions, churn). US-747 is open for exactly this.
- iOS: `Services/NotificationService.swift`. It registers APNs and upserts the raw hex token into `push_tokens` with platform `ios` (`:63-105`). Daily topics are local `UNCalendarNotificationTrigger`s with static copy (`:394-400`: "Time to plan or log a meal.").
- Expo: `app/mobile/lib/notifications.ts` gets an Expo push token (US-852 open).

### Widgets, Live Activity, Watch, Siri, share extension (iOS only)
- Widget `EatPalWidget/EatPalWidget.swift`: small, medium and three lock-screen families (`:279-285`). It reads App Group keys written by `Services/WidgetSnapshot.swift` and refreshes hourly (`:45-47`). Deep links at `:318-325`.
- Live Activity for a grocery trip: `EatPalWidget/GroceryTripLiveActivity.swift`, started from `Views/Grocery/GroceryView.swift:1081`.
- Watch: `EatPalWatch Watch App/`. Today view is read-only (`Views/TodayView.swift:6-7`). Grocery check-off goes through WCSession to the phone (`WatchSessionStore.swift:46-84`), plus complications. The Watch has no network path of its own.
- Siri / App Intents (`EatPal/Intents/`, in the main app target; there is no separate Intents extension): add grocery, bulk add, what's for dinner, log meal result, mark safe, mark try-bite, today's plan, import recipe URL (`EatPalAppShortcuts.swift:7-107`).
- Share extension `EatPalShare/`: grocery text and recipe URL import via App Group pending files (`Shared/PendingGroceryImport.swift`, `PendingRecipeImport.swift`).

### Web platform
- `CommandPalette.tsx`: navigation, generic "add" actions and theme (`:97-309`). It has no data entry: typing "milk" cannot add milk.
- Offline: `OfflineIndicator.tsx`, a durable queue for grocery only (`src/lib/webSyncQueue.ts`, US-823), a service worker and `share_target` (`public/manifest.json:81`).
- Gating: `FeatureGate.tsx` wraps 3 pages (MealBuilder, FoodChaining, AICoach). `UpgradeDialog.tsx:24` goes to `/pricing`. iOS enforces nothing locally (`docs/entitlements.md` item 4: `StoreKitService.isSubscribed` has no callers).

### Parity table

| Capability | Web | Expo | iOS native |
|---|---|---|---|
| Household page, invite, join | yes | no | yes |
| Leave household | no | no | no |
| Roles with different rights | no | no | no |
| "Who added / who ticked" | no (column unused) | no | no |
| Onboarding branches on who you plan for | yes | no | yes |
| Invite partner during onboarding | no | no | no |
| Remote push that reaches the device | no | no (US-852) | no (see P0-2) |
| Local reminders | no | partial | yes, static copy |
| Home/lock widget | n/a | no | yes |
| Live Activity (shopping trip) | n/a | no | yes |
| Watch | n/a | no | yes, phone-tethered |
| Voice add to list | no | no | yes (Siri) |
| Share into app | share_target | no | extension |
| Offline writes | grocery only | syncQueue | OfflineStore (not used by Siri) |
| Local plan gating | FeatureGate x3 | no | none |

## 2. Bugs and half-built things (evidence)

1. **Joining a household leaves the joiner in two households.** Every signup gets a household (`handle_new_user -> ensure_user_household`, `20260415000000_fix_household_rls.sql:55-90`). `accept_household_invite` inserts a second membership and never retires the first (`20260909000000_household_seat_limit.sql:174-175`). `get_user_household_id` is `LIMIT 1` with no ORDER BY (`20251008035900...sql:9-12`), and the us840 test fixture already tripped on this (`supabase/tests/us840_household_seats.test.sql:56-63`). What follows, per client:
   - Web `useHousehold.ts:90-94` calls `.maybeSingle()` on the membership query, which errors on 2 rows, so the household page renders empty for the joiner.
   - `AuthContext.tsx:30` resolves one household nondeterministically.
   - iOS `HouseholdService.currentHousehold()` (`:23-27`) picks `households ... limit(1)`. Realtime filters on that one (`RealtimeService.swift:28-30`), while REST fetches return the RLS union of both.
   - The insert trigger stamps new rows with whichever household `LIMIT 1` returns, so the joiner's grocery adds can land in their old, empty household, invisible to the co-parent.

   This is the core co-parent flow. Tests pass because they never model the pre-existing household. Worth reproducing against `local-sql-suite.sh` before fixing.
2. **Server push cannot reach the shipped iOS app.** iOS stores raw APNs hex tokens (`NotificationService.swift:63-100`). The sender posts every token to `exp.host` (`process-notification-queue/index.ts:218-237`), which accepts only `ExponentPushToken[...]`. Even if the cron existed, no partner or event push would arrive on iPhone.
3. **Dead toggles.** Web `partner_updates`, `food_success_updates` and `template_suggestions` are read by nothing outside the dialog (grep of `supabase/functions`, `src`, `ios`). iOS topics `tryBite`, `expiringFood` and `streakMilestone` have settings rows but nothing schedules them (`NotificationService.swift:304`; no callers). `scheduleGroceryReminder` has no callers.
4. **The widget shows yesterday.** `buildPayload` bakes "today" in at write time (`WidgetSnapshot.swift:69-72`), and the widget re-reads the same keys hourly without checking `widget_last_updated_at` (`EatPalWidget.swift:52-84`). If the app isn't opened after midnight, "Today's Meals" is the previous day's. A partner's changes also never reach the widget unless this phone's app is running.
5. **The widget streak is hardcoded to 0** (`WidgetSnapshot.swift:116`). The circular accessory's streak branch (`EatPalWidget.swift:321`) can never run.
6. **Siri add is online-only and not deduped.** `AddGroceryItemIntent` calls `DataService.insertGroceryItem` directly (`GroceryAppIntents.swift:58`). It bypasses OfflineStore, so "add milk" in a basement store fails, and it doesn't merge with an existing unchecked "Milk".
7. **Watch is read-only for meals** and can't add items. Check-off depends on the phone being reachable or `transferUserInfo` later (`WatchSessionStore.swift:66-83`).
8. **Onboarding doesn't act on "me and a partner"**: there's no invite step, and the progress bar still demands a child profile (`OnboardingProgressBar.tsx:18`) for adult-only households.
9. **Free/Pro can't share at all** (1 seat), yet sharing is the retention loop. The upgrade copy lives in an exception string (`household_seat_limit.sql:167-169`).
10. **No leave-household action anywhere.** Removing yourself goes through the generic member delete.

## 3. Benchmark (brief)

- **OurGroceries**: fastest cross-device tick-off (seconds). Free sharing, Watch + Siri/Alexa/Google. The lesson is that sync speed *is* the product ([lystbot](https://lystbot.com/blog/best-grocery-list-apps/), [groceriestracker](https://groceriestracker.com/blog/best-grocery-list-apps-2026)).
- **AnyList**: Siri add works from the Watch and syncs in the background ([AnyList help](https://help.anylist.com/articles/siri/)). Recipe-to-list merging and aisle sorting. The household plan is $14.99/yr, so sharing is priced per household, not per seat.
- **Cozi**: loved for a persistent shared list. Complaints from late 2025 to 2026 are disappearing items, events not syncing to other members, blank widgets, login loops, and an aggressive paywall rated a "bait and switch" ([usecalendara](https://www.usecalendara.com/blog/cozi-review-2026), [ourcal](https://ourcal.com/blog/cozi-app-review-2025)). Our bugs 1 and 4 are exactly the ones Cozi is punished for.
- **Paprika**: sharing is all-or-nothing, one account's data for everyone, with no per-person control ([Paprika support](https://paprikaapp.zendesk.com/hc/en-us/articles/41906231216023-How-does-family-sharing-work)). That leaves room for scoped caregiver access.
- **Mealime**: onboarding collects diet, allergies (12) and dislikes (124) up front and filters recipes from then on; reviewers praise it ([Plan to Eat](https://www.plantoeat.com/blog/2023/04/mealime-app-review-pros-and-cons/), [Mealime docs](https://support.mealime.com/article/59-choose-your-allergies-and-restrictions)). EatPal asks only a first name.
- **Apple Reminders (iOS 17+)**: a Groceries list type auto-sorts items into aisles, and the list shares in real time ([MacRumors](https://www.macrumors.com/2023/06/07/ios-17-reminders-grocery-sorting/)). This is the free default we compete with, so import from it (US-296 bulk intent) should be one tap.
- **Instacart**: household/shared carts. Not verified in this pass; treat as an export target, not a benchmark.

What "best in class" means for a picky-eater family: the list syncs in seconds and never loses a tick; the second parent is in the household within a minute of signup; the phone tells you tonight's dinner and what's missing without opening the app; and a babysitter can see what the kid will actually eat without seeing everything.

## 4. Prioritized work

P0: correctness of the shared household. Nothing ambient matters while the two parents aren't looking at the same data.

- **P0-1 One household per user after join.** What: make `accept_household_invite` move the joiner. If their old household holds no kids, foods, plan entries or grocery items besides defaults, delete that membership. Otherwise offer "bring my data" (reassign `household_id` on their rows) or "start fresh". Pin `get_user_household_id` to `ORDER BY joined_at DESC` (or add a `profiles.active_household_id NULL` column) so resolution is deterministic. Change `useHousehold` to stop using `maybeSingle` on memberships, and iOS `currentHousehold()` to call the RPC instead of `households.limit(1)`. Why: bug 1. Effort M. Platforms: SQL, web, iOS. DB: additive (a function replace and a nullable column). Old iOS builds keep calling the same RPC and simply get a deterministic answer. Add a `supabase/tests` case that starts from a signed-up joiner.
- **P0-2 Push that reaches iPhones.** What: add an APNs sender (token-based .p8 auth, key stored as a secret reference) branching on `push_tokens.platform = 'ios'`. Keep Expo for `expo` tokens until US-720 lands. Schedule `schedule-meal-reminders` and `process-notification-queue` via pg_cron (US-747). Effort M. Platforms: edge, SQL. DB: none beyond cron rows.
- **P0-3 The widget never lies about the day.** What: store a date alongside the meals and have the widget show "Open EatPal to refresh" (or tomorrow's slot) when stale. Wire `tryBiteStreak` to `BadgeService`'s rule. Add `BGAppRefreshTask` so a partner's edits reach the widget without opening the app. Effort S. Platform: iOS.
- **P0-4 Siri/Watch writes survive no signal.** What: route `AddGroceryItemIntent`, bulk add and Watch check-off through OfflineStore with a client uuid (same invariant as web `buildGroceryRow`), and merge into an existing unchecked item of the same name. Effort S-M. Platform: iOS. DB: none.

P1: make the household feel shared.

- **P1-1 Invite the partner in onboarding.** The "me and a partner" and "my family" branches end with a "Share with your co-parent" step (link + QR via the existing invite RPC). Add "Invite co-parent" to `OnboardingProgressBar`, and drop the child requirement for adult branches. Effort S. Web + iOS.
- **P1-2 Attribution and presence.** Render `added_by_user_id` (avatar/initial) on grocery rows. Add `grocery_items.checked_by_user_id NULL` and `checked_at NULL` (additive) and a "Dad is shopping" presence badge on the household realtime channel (US-752). Effort M. Web + iOS.
- **P1-3 Partner notifications that mean something.** `partner_checked_items` digest (max 1/hour), `partner_planned_meal`, `dinner_tonight` naming the dish, `shopping_day` when the list is non-empty. Delete the dead toggles, or wire them in the same PR. Effort M. Edge + iOS + web settings. DB: `profiles.timezone NULL` (US-747).
- **P1-4 Onboarding captures what makes EatPal different.** After the child's name: 3-5 safe foods (typeahead from the catalog), allergens and textures to avoid. That seeds the pantry and the first plan in the same minute, and feeds quiz answers in if the user came from `/picky-eater-quiz`. Effort M. Web + iOS. DB: none (existing `foods`, `kids.allergens`).
- **P1-5 Sharing on the paid tier people actually buy.** Decide whether Pro gets 2 seats. A second parent *is* the product for a family app, and AnyList prices sharing per household. This is a pricing decision, so it goes to Dj, not a code change. `subscription_plans.max_household_members` is data-only.
- **P1-6 Leave household**, plus a confirmation on `/join` that names the household and the inviter before accepting (today `Join.tsx:41` accepts on page load). Effort S.

P2: ambient polish.

- **P2-1 Caregiver role (read + log only).** Extend the CHECK to add `'caregiver'` (additive: widening a CHECK is safe, and older clients only ever send parent/guardian). RLS lets a caregiver read plan and kids, insert plan results, and add grocery items, but not delete or manage members. Pairs with US-748's tokenless ICS/week share for sitters without accounts. Effort L.
- **P2-2 Interactive widgets (iOS 17 AppIntent buttons):** "Mark dinner made", check off the next grocery item, and a "Missing for tonight" medium widget. Effort M.
- **P2-3 Independent Watch:** Supabase from the Watch over Wi-Fi/LTE for check-off, dictation add, log a meal result from Today. Effort M-L.
- **P2-4 Command palette data entry:** "add milk", "log dinner: ate", "plan tacos Thursday". Effort S. Web.
- **P2-5 Web push** (VAPID) once P0-2's sender is platform-aware. Effort M.
- **P2-6 iOS local gating** from the agreed entitlements table (`docs/entitlements.md` item 4). Effort S-M.

## 5. Cross-module moments per surface

| Moment | Widget | Watch | Siri | Push | Status |
|---|---|---|---|---|---|
| Tonight's dinner + missing ingredients | dish only | dish only | "What's for dinner" (dish only) | none | **missing**: the shortfall exists (`Utilities/ShortfallCalculator.swift`, `MissingIngredientsSheet`) but no ambient surface calls it |
| Out of / low on a safe food | "pantry low" count (qty<=2 heuristic, `WidgetSnapshot.swift:104-107`) | no | no | `expiringFood` topic, never fired | **missing**: safe-food-specific restock ("Sam's only yogurt is gone") is the most EatPal-specific alert available |
| Add to list | n/a | no | yes, online only | n/a | partial (P0-4) |
| Check off in store | Live Activity (count) | yes, tethered | no | n/a | ok; add "Mark bought" intent |
| Partner did something | no | no | no | toggle exists, nothing sends | **missing** (P1-3) |
| Log tonight's result (ate/tasted/refused) | no | read-only | yes | no | missing on widget/Watch; add a post-dinner push at dinner +45min with actionable buttons (UNNotificationAction, no app open) |
| Try-bite win / streak | streak hardcoded 0 | no | no | toggle, never fired | broken (P0-3) |
| Shopping day nudge with projected list | no | no | no | no | missing (US-747) |
| Kid-facing "what's for dinner" vote | no | no | no | no | `meal_voting` tables exist; no ambient surface |

The one moment to build first, because it touches three modules: **"Tonight: Chicken tacos. Missing tortillas and cheese. [Add both] [Swap meal]"**. It needs a medium widget, a 4pm push with actions, and the Siri dialog. That is the planner, pantry shortfall and grocery list in a single glance, and no competitor above has it for picky-eater safe foods.

## 6. Not verified here

Nothing was run on a Mac or device. The Expo-push rejection of APNs tokens is from Expo's documented token format, not a captured response. Whether a cron outside the repo (Coolify) calls the schedulers is unknown; the repo shows none. The multi-household behaviour is from reading the SQL and client code, and needs a repro in `scripts/dev/local-sql-suite.sh`.
