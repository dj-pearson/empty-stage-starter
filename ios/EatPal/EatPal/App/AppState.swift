import SwiftUI
import Combine

/// Central application state that mirrors the web AppContext.
/// Manages foods, kids, recipes, plan entries, and grocery items
/// with optimistic local updates and Supabase sync.
@MainActor
final class AppState: ObservableObject {
    // MARK: - Published State

    @Published var foods: [Food] = []
    @Published var kids: [Kid] = []
    @Published var recipes: [Recipe] = []
    @Published var planEntries: [PlanEntry] = []
    @Published var groceryItems: [GroceryItem] = []
    @Published var groceryLists: [GroceryList] = []
    /// US-264: many-to-many link from grocery items to the recipes /
    /// plan entries they were generated from. Powers the GroceryView
    /// "By Recipe" view mode. Refreshed alongside groceryItems.
    @Published var groceryItemSources: [GroceryItemSource] = []
    /// US-231: optional 1-5 ratings + notes attached to plan entries.
    /// Loaded lazily — first read of the dashboard "Most loved" card or
    /// the AI prompt enrichment triggers `loadPlanEntryFeedback()`.
    @Published var planEntryFeedback: [PlanEntryFeedback] = []

    @Published var activeKidId: String?
    @Published var isLoading = false
    @Published var errorMessage: String?

    // MARK: - Services

    private let dataService = DataService.shared
    private let realtimeService = RealtimeService.shared
    private let toast = ToastManager.shared
    private var cancellables: Set<AnyCancellable> = []

    init() {
        setupWidgetSnapshotSync()
    }

    // MARK: - Widget Snapshot Sync (US-152)

    /// Observes the @Published collections that feed the home/Lock Screen
    /// widget and pushes a debounced snapshot into App Group UserDefaults
    /// any time they change. Widget timeline reloads follow automatically.
    // MARK: - Pending recipe imports (US-143)

    /// Drains the share-extension-fed recipe queue. Each pending import is
    /// inserted as a Recipe row for the signed-in user. Silently no-ops when
    /// no auth session is present — the queue survives app restarts, so the
    /// next launch after sign-in will still process them.
    func drainPendingRecipeImports() async {
        let queued = PendingRecipeImportQueue.load()
        guard !queued.isEmpty else { return }

        var successful: Set<String> = []
        for pending in queued {
            let recipe = Recipe(
                id: UUID().uuidString,
                userId: "",
                name: pending.name,
                description: pending.description,
                instructions: pending.instructions,
                foodIds: [],
                prepTime: pending.prepTime,
                cookTime: pending.cookTime,
                servings: pending.servings,
                additionalIngredients: pending.additionalIngredients,
                imageUrl: pending.imageUrl,
                sourceUrl: pending.sourceUrl,
                sourceType: "imported"
            )

            do {
                try await addRecipe(recipe)
                successful.insert(pending.id)
                SentryService.leaveBreadcrumb(
                    category: "share-import",
                    message: "Imported shared recipe: \(pending.name)"
                )
            } catch {
                SentryService.capture(error, extras: [
                    "context": "drainPendingRecipeImports",
                    "recipe": pending.name
                ])
            }
        }

        // Remove only the ones that succeeded — failed imports stay queued
        // so the next launch can try again.
        for id in successful {
            PendingRecipeImportQueue.remove(id: id)
        }

        if !successful.isEmpty {
            toast.success(
                "Imported \(successful.count) recipe\(successful.count == 1 ? "" : "s")",
                message: "From your share sheet"
            )
        }
    }

    private func setupWidgetSnapshotSync() {
        $planEntries
            .combineLatest($foods, $groceryItems, $recipes)
            .debounce(for: .milliseconds(500), scheduler: DispatchQueue.main)
            .sink { [weak self] _, _, _, _ in
                self?.refreshWidgetSnapshot()
                // US-237: piggy-back the watch sync on the same change stream.
                // WatchConnectivityService has its own 1.5s debounce on top
                // so a burst of mutations doesn't translate into a burst of
                // userInfo transfers.
                WatchConnectivityService.shared.scheduleSnapshotPush()
            }
            .store(in: &cancellables)
    }

    private func refreshWidgetSnapshot() {
        let todayString = DateFormatter.isoDate.string(from: Date())
        let kidId = activeKidId

        // Today's meals (by slot): pick the first food per slot for the
        // active kid, or across all kids when no active kid is set.
        let todaysEntries = planEntries.filter { entry in
            entry.date == todayString && (kidId == nil || entry.kidId == kidId)
        }

        let widgetMeals: [WidgetSnapshot.Payload.Meal] = MealSlot.allCases.compactMap { slot in
            guard let entry = todaysEntries.first(where: { $0.mealSlot == slot.rawValue }) else {
                return nil
            }
            let foodName: String = {
                if let recipeId = entry.recipeId,
                   let recipe = recipes.first(where: { $0.id == recipeId }) {
                    return recipe.name
                }
                if let food = foods.first(where: { $0.id == entry.foodId }) {
                    return food.name
                }
                return "Unnamed"
            }()
            return WidgetSnapshot.Payload.Meal(
                slot: slot.displayName,
                foodName: foodName,
                icon: slot.icon
            )
        }

        let tonightDish = todaysEntries
            .first(where: { $0.mealSlot == MealSlot.dinner.rawValue })
            .flatMap { entry -> String? in
                if let recipeId = entry.recipeId,
                   let recipe = recipes.first(where: { $0.id == recipeId }) {
                    return recipe.name
                }
                return foods.first(where: { $0.id == entry.foodId })?.name
            }

        let pantryLowCount = foods.filter { food in
            guard let qty = food.quantity else { return false }
            return qty > 0 && qty <= 2
        }.count

        let unchecked = groceryItems.filter { !$0.checked }.count

        let payload = WidgetSnapshot.Payload(
            meals: widgetMeals,
            groceryCount: unchecked,
            pantryLowCount: pantryLowCount,
            tonightDish: tonightDish,
            tryBiteStreak: 0  // placeholder — real streak calc is a future story
        )

        WidgetSnapshot.write(payload)
    }

    // MARK: - Computed Properties

    var activeKid: Kid? {
        kids.first { $0.id == activeKidId }
    }

    var safeFoods: [Food] {
        foods.filter { $0.isSafe }
    }

    var tryBiteFoods: [Food] {
        foods.filter { $0.isTryBite }
    }

    var foodsByCategory: [String: [Food]] {
        Dictionary(grouping: foods, by: { $0.category })
    }

    // MARK: - Data Loading

    func loadAllData() async {
        isLoading = true
        errorMessage = nil

        do {
            async let fetchedFoods = dataService.fetchFoods()
            async let fetchedKids = dataService.fetchKids()
            async let fetchedRecipes = dataService.fetchRecipes()
            async let fetchedRecipeIngredients = dataService.fetchRecipeIngredients()
            async let fetchedPlanEntries = dataService.fetchPlanEntries()
            async let fetchedGroceryItems = dataService.fetchGroceryItems()
            async let fetchedGroceryLists = dataService.fetchGroceryLists()
            async let fetchedGroceryItemSources = dataService.fetchGroceryItemSources()

            let (loadedFoods, loadedKids, loadedRecipes,
                 loadedRecipeIngredients, loadedPlanEntries,
                 loadedGroceryItems, loadedGroceryLists,
                 loadedGroceryItemSources) = try await (
                fetchedFoods, fetchedKids, fetchedRecipes,
                fetchedRecipeIngredients, fetchedPlanEntries,
                fetchedGroceryItems, fetchedGroceryLists,
                fetchedGroceryItemSources
            )

            foods = loadedFoods
            kids = loadedKids
            // US-265: splat structured ingredients into each recipe so
            // consumers (RecipeDetailView, GroceryGeneratorService,
            // RecipeMatcher) can read them without a separate fetch.
            recipes = Self.attachIngredients(loadedRecipeIngredients, to: loadedRecipes)
            planEntries = loadedPlanEntries
            groceryItems = loadedGroceryItems
            groceryLists = loadedGroceryLists
            // US-264: source-link rows feed the "By Recipe" grouping in
            // GroceryView; refreshed in lockstep with groceryItems.
            groceryItemSources = loadedGroceryItemSources

            if activeKidId == nil, let firstKid = kids.first {
                activeKidId = firstKid.id
            }

            // Start real-time subscriptions after initial load
            await realtimeService.subscribe(appState: self)

            // US-231: feedback isn't on the critical path of the meal planner
            // so it loads in the background after primary data is on screen.
            Task { await loadPlanEntryFeedback() }

            // US-143: drain any recipes the share extension saved while the
            // user was signed out or the app was backgrounded.
            await drainPendingRecipeImports()
        } catch {
            // Single AppError mapping powers both the inline `errorMessage`
            // banner and the global toast so they stay in sync.
            let appError = AppError.wrap(error, as: { .load(entity: "your data", underlying: $0) })
            errorMessage = appError.errorDescription
            toast.show(appError)
            HapticManager.error()
        }

        isLoading = false
    }

    func clearData() {
        Task { await realtimeService.unsubscribeAll() }
        foods = []
        kids = []
        recipes = []
        planEntries = []
        groceryItems = []
        groceryLists = []
        groceryItemSources = []
        activeKidId = nil
    }

    // MARK: - Food Operations

    func addFood(_ food: Food) async throws {
        foods.append(food)
        do {
            try await dataService.insertFood(food)
            toast.success("Food added", message: "\(food.name) added to pantry")
            HapticManager.success()
            AnalyticsService.track(.foodAdded(via: .manual, category: food.category))
        } catch {
            foods.removeAll { $0.id == food.id }
            toast.show(error, as: { .save(entity: "food", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }

    func updateFood(_ id: String, updates: FoodUpdate) async throws {
        guard let index = foods.firstIndex(where: { $0.id == id }) else { return }
        let original = foods[index]
        foods[index].apply(updates)
        do {
            try await dataService.updateFood(id, updates: updates)
            toast.success("Food updated")
            HapticManager.lightImpact()
            AnalyticsService.track(.foodUpdated)
        } catch {
            foods[index] = original
            toast.show(error, as: { .save(entity: "food", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }

    func deleteFood(_ id: String) async throws {
        let removed = foods.filter { $0.id == id }
        foods.removeAll { $0.id == id }
        do {
            try await dataService.deleteFood(id)
            toast.success("Food deleted")
            HapticManager.mediumImpact()
            AnalyticsService.track(.foodDeleted)
        } catch {
            foods.append(contentsOf: removed)
            toast.show(error, as: { .delete(entity: "food", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }

    // MARK: - Kid Operations

    func addKid(_ kid: Kid) async throws {
        kids.append(kid)
        do {
            try await dataService.insertKid(kid)
            if activeKidId == nil { activeKidId = kid.id }
            toast.success("Child added", message: "\(kid.name) added to family")
            HapticManager.success()
            AnalyticsService.track(.kidAdded)
        } catch {
            kids.removeAll { $0.id == kid.id }
            toast.show(error, as: { .save(entity: "child profile", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }

    func updateKid(_ id: String, updates: KidUpdate) async throws {
        guard let index = kids.firstIndex(where: { $0.id == id }) else { return }
        let original = kids[index]
        kids[index].apply(updates)
        do {
            try await dataService.updateKid(id, updates: updates)
            toast.success("Profile updated")
            HapticManager.lightImpact()
            // Coarse field categorization — never includes the actual values.
            AnalyticsService.track(.kidUpdated(field: Self.classify(updates)))
        } catch {
            kids[index] = original
            toast.show(error, as: { .save(entity: "profile", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }

    /// Maps a KidUpdate to a `KidField` bucket for analytics. Falls back to
    /// `.other` when the update touches an uncategorized field — keeps the
    /// dashboard interpretable as we add new fields without forcing every
    /// new property into a category at the call-site.
    private static func classify(_ updates: KidUpdate) -> KidField {
        if updates.allergens != nil || updates.dietaryRestrictions != nil { return .allergens }
        if updates.heightCm != nil || updates.weightKg != nil { return .measurements }
        if updates.helpfulStrategies != nil || updates.pickinessLevel != nil { return .quiz }
        if updates.favoriteFoods != nil || updates.dislikedFoods != nil
           || updates.texturePreferences != nil || updates.flavorPreferences != nil { return .preferences }
        if updates.name != nil || updates.age != nil || updates.gender != nil { return .basicInfo }
        return .other
    }

    /// Maps GroceryItem.addedVia (a free-form string set at insert sites) to
    /// the typed `EntrySource` enum used by analytics events.
    private static func entrySource(_ raw: String?) -> EntrySource {
        guard let raw, let mapped = EntrySource(rawValue: raw) else { return .manual }
        return mapped
    }

    /// US-265: Splat a flat list of `recipe_ingredients` rows back onto
    /// their parent recipes in one O(n) pass. Used by `loadAllData()`
    /// after the parallel fetch returns. Ingredient rows arrive sorted
    /// by (recipe_id, sort_order) so the per-recipe slice is already in
    /// the right order — no extra sort needed.
    private static func attachIngredients(
        _ ingredients: [RecipeIngredient],
        to recipes: [Recipe]
    ) -> [Recipe] {
        let grouped = Dictionary(grouping: ingredients, by: \.recipeId)
        return recipes.map { recipe in
            var copy = recipe
            copy.ingredients = grouped[recipe.id] ?? []
            return copy
        }
    }

    func deleteKid(_ id: String) async throws {
        let removed = kids.filter { $0.id == id }
        kids.removeAll { $0.id == id }
        if activeKidId == id { activeKidId = kids.first?.id }
        do {
            try await dataService.deleteKid(id)
            toast.success("Child removed")
            HapticManager.mediumImpact()
            AnalyticsService.track(.kidDeleted)
        } catch {
            kids.append(contentsOf: removed)
            toast.show(error, as: { .delete(entity: "child profile", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }

    // MARK: - Recipe Operations

    func addRecipe(_ recipe: Recipe) async throws {
        recipes.append(recipe)
        do {
            try await dataService.insertRecipe(recipe)
            toast.success("Recipe created", message: "\(recipe.name) saved")
            HapticManager.success()
            // `addRecipe` callers default to `.manual` here; the URL-import path
            // emits `.recipeImported(...)` itself before invoking this method.
            AnalyticsService.track(.recipeCreated(via: .manual))
            // US-241: recipeChef badge is household-wide, but the catalog still
            // wants a kid context to persist against. Use the active kid; if
            // none is selected we silently skip (eval will pick it up next
            // time a kid logs a meal).
            if let activeKidId = activeKidId {
                BadgeService.shared.evaluate(
                    kidId: activeKidId,
                    foods: foods,
                    recipes: recipes,
                    planEntries: planEntries
                )
            }
        } catch {
            recipes.removeAll { $0.id == recipe.id }
            toast.show(error, as: { .save(entity: "recipe", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }

    func updateRecipe(_ id: String, updates: RecipeUpdate) async throws {
        guard let index = recipes.firstIndex(where: { $0.id == id }) else { return }
        let original = recipes[index]
        recipes[index].apply(updates)
        do {
            try await dataService.updateRecipe(id, updates: updates)
            toast.success("Recipe updated")
            HapticManager.lightImpact()
            AnalyticsService.track(.recipeUpdated)
        } catch {
            recipes[index] = original
            toast.show(error, as: { .save(entity: "recipe", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }

    /// US-265: Save a recipe + its structured ingredients together. The
    /// editor builds the full ingredient set client-side and we replace
    /// the whole bag in one shot — simpler than diffing inserts/updates/
    /// deletes and good enough for typical recipes (10–20 lines).
    /// Optimistic: the local copy updates immediately; on failure we
    /// roll the recipe + ingredients back to their pre-save state.
    func updateRecipeWithIngredients(
        _ id: String,
        updates: RecipeUpdate,
        ingredients: [RecipeIngredient]
    ) async throws {
        guard let index = recipes.firstIndex(where: { $0.id == id }) else { return }
        let original = recipes[index]
        recipes[index].apply(updates)
        recipes[index].ingredients = ingredients
        do {
            try await dataService.updateRecipe(id, updates: updates)
            try await dataService.replaceRecipeIngredients(recipeId: id, with: ingredients)
            toast.success("Recipe updated")
            HapticManager.lightImpact()
            AnalyticsService.track(.recipeUpdated)
        } catch {
            recipes[index] = original
            toast.show(error, as: { .save(entity: "recipe", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }

    func deleteRecipe(_ id: String) async throws {
        let removed = recipes.filter { $0.id == id }
        recipes.removeAll { $0.id == id }
        do {
            try await dataService.deleteRecipe(id)
            toast.success("Recipe deleted")
            HapticManager.mediumImpact()
            AnalyticsService.track(.recipeDeleted)
        } catch {
            recipes.append(contentsOf: removed)
            toast.show(error, as: { .delete(entity: "recipe", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }

    // MARK: - Plan Entry Operations

    func addPlanEntry(_ entry: PlanEntry) async throws {
        planEntries.append(entry)
        do {
            try await dataService.insertPlanEntry(entry)
            toast.success("Meal added to plan")
            HapticManager.success()
            AnalyticsService.track(.mealPlanned(slot: entry.mealSlot, kidId: entry.kidId))
        } catch {
            planEntries.removeAll { $0.id == entry.id }
            toast.show(error, as: { .save(entity: "meal", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }

    func updatePlanEntry(_ id: String, updates: PlanEntryUpdate) async throws {
        guard let index = planEntries.firstIndex(where: { $0.id == id }) else { return }
        let original = planEntries[index]
        planEntries[index].apply(updates)
        do {
            try await dataService.updatePlanEntry(id, updates: updates)
            if let result = updates.result {
                toast.success("Result logged", message: "Marked as \(result)")
                AnalyticsService.track(.mealResultLogged(
                    result: result,
                    kidId: planEntries[index].kidId
                ))
                // US-144: write nutrition to Health when the meal was eaten
                // and the user has opted in. No-op otherwise.
                if result == MealResult.ate.rawValue {
                    Task { await writeHealthSample(for: planEntries[index]) }
                }
                // US-241: re-evaluate badges after each result update. Cheap —
                // only runs criteria for unearned badges, and the planEntries
                // / foods / recipes arrays are already in memory.
                BadgeService.shared.evaluate(
                    kidId: planEntries[index].kidId,
                    foods: foods,
                    recipes: recipes,
                    planEntries: planEntries
                )
            }
            HapticManager.lightImpact()
        } catch {
            planEntries[index] = original
            toast.show(error, as: { .save(entity: "meal", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }

    /// US-144: pushes the linked recipe's macros to HealthKit as a single
    /// food correlation dated to the meal's date. Silently skipped when the
    /// user hasn't opted in, HealthKit isn't available, or the linked
    /// recipe has no nutrition data attached (food-only plan entries
    /// don't currently carry macros in the schema).
    private func writeHealthSample(for entry: PlanEntry) async {
        let service = HealthKitService.shared
        guard service.isEnabled, service.isAvailable else { return }

        guard let recipeId = entry.recipeId,
              let recipe = recipes.first(where: { $0.id == recipeId }),
              let nutrition = recipe.nutritionInfo else { return }

        let formatter = DateFormatter.isoDate
        let mealDate = formatter.date(from: entry.date) ?? Date()

        do {
            try await service.writeMeal(
                calories: nutrition.calories,
                proteinGrams: nutrition.proteinG,
                carbsGrams: nutrition.carbsG,
                fatGrams: nutrition.fatG,
                mealDate: mealDate,
                mealName: recipe.name
            )
            SentryService.leaveBreadcrumb(
                category: "healthkit",
                message: "Wrote food correlation for \(recipe.name)"
            )
        } catch {
            SentryService.capture(error, extras: ["context": "healthkit_writeMeal"])
        }
    }

    func deletePlanEntry(_ id: String) async throws {
        let removed = planEntries.filter { $0.id == id }
        planEntries.removeAll { $0.id == id }
        do {
            try await dataService.deletePlanEntry(id)
            HapticManager.mediumImpact()
            AnalyticsService.track(.mealRemoved)
        } catch {
            planEntries.append(contentsOf: removed)
            toast.show(error, as: { .delete(entity: "meal", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }

    func planEntriesForDate(_ date: Date, kidId: String) -> [PlanEntry] {
        let dateString = DateFormatter.isoDate.string(from: date)
        return planEntries.filter { $0.kidId == kidId && $0.date == dateString }
    }

    // MARK: - Mark Meal Made (US-262)

    /// Logs a planned recipe as eaten. Server-side, the
    /// `rpc_mark_meal_made` function debits pantry foods linked via
    /// `recipe_ingredients.food_id`, auto-checks any grocery items
    /// sourced from this plan entry, and writes a log row for
    /// idempotency. We then optimistically refresh local state so the
    /// UI reflects the changes without a full reload.
    func markPlanEntryMade(_ entryId: String) async throws {
        do {
            let result = try await dataService.markMealMade(planEntryId: entryId)
            switch result.status {
            case .alreadyLogged:
                toast.info(
                    "Already logged",
                    message: "This meal was logged within the last hour."
                )
                HapticManager.lightImpact()
            case .logged, .noRecipe:
                let debited = result.debitedCount ?? 0
                let checked = result.checkedCount ?? 0
                // Mirror the server-side mutations in our in-memory
                // state so the UI doesn't have to wait for a reload.
                applyMealMadeMutationsLocally(planEntryId: entryId)
                let detail: String
                switch (debited, checked) {
                case (0, 0):
                    detail = "Logged."
                case (let d, 0):
                    detail = "Debited \(d) pantry item\(d == 1 ? "" : "s")."
                case (0, let c):
                    detail = "Checked \(c) grocery item\(c == 1 ? "" : "s")."
                case (let d, let c):
                    detail = "Debited \(d) · checked \(c)."
                }
                toast.success("Meal logged", message: detail)
                HapticManager.success()
                AnalyticsService.track(.mealMadeLogged(
                    debitedCount: debited,
                    checkedCount: checked
                ))
            }
        } catch {
            toast.show(error, as: { .save(entity: "meal made log", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }

    /// Optimistically apply the side effects of a successful
    /// `rpc_mark_meal_made` to local state so the user sees the pantry
    /// debit + grocery check immediately. The next `loadAllData` will
    /// confirm; until then this keeps the UI honest.
    private func applyMealMadeMutationsLocally(planEntryId: String) {
        guard let entry = planEntries.first(where: { $0.id == planEntryId }) else { return }
        // Pantry debit: mirror the server's "decrement linked-food qty
        // by 1" rule. We can derive linked food ids from the recipe's
        // structured ingredients without an extra fetch.
        if let recipeId = entry.recipeId,
           let recipe = recipes.first(where: { $0.id == recipeId }) {
            for ing in recipe.ingredients {
                guard let foodId = ing.foodId,
                      let idx = foods.firstIndex(where: { $0.id == foodId }) else { continue }
                let current = foods[idx].quantity ?? 0
                foods[idx].quantity = max(0, current - 1)
            }
        }
        // Grocery checks: any item with a source row pointing at this entry.
        let affectedIds = Set(
            groceryItemSources
                .filter { $0.planEntryId == planEntryId }
                .map { $0.groceryItemId }
        )
        for id in affectedIds {
            if let idx = groceryItems.firstIndex(where: { $0.id == id }) {
                groceryItems[idx].checked = true
            }
        }
    }

    // MARK: - Plan Entry Feedback (US-231)

    /// Background-loadable. Failures are quietly swallowed: feedback is a
    /// secondary signal and we never want a transient error to block the
    /// dashboard from rendering with stale-but-useful data.
    func loadPlanEntryFeedback() async {
        do {
            planEntryFeedback = try await dataService.fetchPlanEntryFeedback()
        } catch {
            SentryService.capture(error, extras: ["context": "loadPlanEntryFeedback"])
        }
    }

    /// Records a 1-5 rating + optional note for a plan entry. Optimistic —
    /// the local @Published list updates immediately; on server failure we
    /// surface the standard error toast and roll back.
    func addPlanEntryFeedback(planEntryId: String, rating: Int, note: String?) async {
        let trimmedNote = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        let optimistic = PlanEntryFeedback(
            id: UUID().uuidString,
            planEntryId: planEntryId,
            userId: "",
            rating: rating,
            note: trimmedNote?.isEmpty == true ? nil : trimmedNote,
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        planEntryFeedback.append(optimistic)
        do {
            try await dataService.insertPlanEntryFeedback(
                PlanEntryFeedbackInsert(
                    planEntryId: planEntryId,
                    userId: "",
                    rating: rating,
                    note: optimistic.note
                )
            )
            AnalyticsService.track(.mealResultLogged(
                result: "rated_\(rating)",
                kidId: planEntries.first { $0.id == planEntryId }?.kidId
            ))
        } catch {
            planEntryFeedback.removeAll { $0.id == optimistic.id }
            toast.show(error, as: { .save(entity: "feedback", underlying: $0) })
        }
    }

    /// Latest feedback (by `createdAt`) for a given plan entry.
    func latestFeedback(for planEntryId: String) -> PlanEntryFeedback? {
        planEntryFeedback
            .filter { $0.planEntryId == planEntryId }
            .max { ($0.createdAt ?? "") < ($1.createdAt ?? "") }
    }

    // MARK: - Grocery Operations

    func addGroceryItem(_ item: GroceryItem) async throws {
        groceryItems.append(item)
        do {
            try await dataService.insertGroceryItem(item)
            toast.success("Item added", message: "\(item.name) added to list")
            HapticManager.success()
            // Map the GroceryItem.addedVia string back to the typed enum so
            // the analytics event keeps the same vocabulary across web/iOS.
            AnalyticsService.track(.groceryItemAdded(via: Self.entrySource(item.addedVia)))
        } catch {
            if isNetworkError(error) {
                // US-150: keep the optimistic update and queue for later replay.
                OfflineStore.shared.enqueueInsert(item, table: .groceryItems, entityId: item.id)
                toast.info("Queued for sync", message: "\(item.name) will save when you're back online.")
                HapticManager.lightImpact()
            } else {
                groceryItems.removeAll { $0.id == item.id }
                toast.show(error, as: { .save(entity: "grocery item", underlying: $0) })
                HapticManager.error()
                throw error
            }
        }
    }

    func updateGroceryItem(_ id: String, updates: GroceryItemUpdate) async throws {
        guard let index = groceryItems.firstIndex(where: { $0.id == id }) else { return }
        let original = groceryItems[index]
        groceryItems[index].apply(updates)
        do {
            try await dataService.updateGroceryItem(id, updates: updates)
            HapticManager.lightImpact()
        } catch {
            groceryItems[index] = original
            toast.show(error, as: { .save(entity: "grocery item", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }

    func deleteGroceryItem(_ id: String) async throws {
        let removed = groceryItems.filter { $0.id == id }
        let removedSources = groceryItemSources.filter { $0.groceryItemId == id }
        groceryItems.removeAll { $0.id == id }
        // US-264: keep the in-memory source-link array in sync; DB-side
        // ON DELETE CASCADE handles the persisted side.
        groceryItemSources.removeAll { $0.groceryItemId == id }
        do {
            try await dataService.deleteGroceryItem(id)
            HapticManager.mediumImpact()
            AnalyticsService.track(.groceryItemDeleted)
            _ = removedSources // referenced in the rollback path below
        } catch {
            if isNetworkError(error) {
                OfflineStore.shared.enqueueDelete(table: .groceryItems, entityId: id)
                HapticManager.lightImpact()
            } else {
                groceryItems.append(contentsOf: removed)
                groceryItemSources.append(contentsOf: removedSources)
                toast.show(error, as: { .delete(entity: "grocery item", underlying: $0) })
                HapticManager.error()
                throw error
            }
        }
    }

    func toggleGroceryItem(_ id: String) async throws {
        guard let index = groceryItems.firstIndex(where: { $0.id == id }) else { return }
        groceryItems[index].checked.toggle()
        let checked = groceryItems[index].checked
        let itemName = groceryItems[index].name
        do {
            try await dataService.updateGroceryItem(
                id,
                updates: GroceryItemUpdate(checked: checked)
            )
            HapticManager.lightImpact()
            await updateGroceryTripActivity(lastCheckedName: checked ? itemName : "")
            // Default to .tap; ShoppingModeView and swipe-action call sites
            // could later override by emitting their own event with .swipe /
            // .shoppingMode. For now this captures the dominant case.
            if checked {
                AnalyticsService.track(.groceryItemChecked(method: .tap))
            }
        } catch {
            if isNetworkError(error) {
                OfflineStore.shared.enqueueUpdate(
                    GroceryItemUpdate(checked: checked),
                    table: .groceryItems,
                    entityId: id
                )
                HapticManager.lightImpact()
                await updateGroceryTripActivity(lastCheckedName: checked ? itemName : "")
            } else {
                groceryItems[index].checked.toggle()
                toast.error("Failed to update item")
                HapticManager.error()
                throw error
            }
        }
    }

    // MARK: - Live Activity helpers (US-145)

    /// Refreshes the grocery-trip Live Activity counts if one is running.
    /// Silently no-ops when no activity is active.
    private func updateGroceryTripActivity(lastCheckedName: String) async {
        let service = GroceryTripActivityService.shared
        guard service.isActive else { return }
        let total = groceryItems.count
        let checked = groceryItems.filter(\.checked).count
        await service.update(
            totalCount: total,
            checkedCount: checked,
            lastCheckedName: lastCheckedName
        )
    }

    // MARK: - Offline helpers (US-150)

    /// Classifies an error as connectivity-related so callers can choose to
    /// keep the optimistic update and queue the mutation for later replay.
    /// Covers URLError / CancellationError / NSURLErrorDomain codes most
    /// commonly surfaced by supabase-swift when offline.
    private func isNetworkError(_ error: Error) -> Bool {
        if error is CancellationError { return false }

        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain {
            switch nsError.code {
            case NSURLErrorNotConnectedToInternet,
                 NSURLErrorNetworkConnectionLost,
                 NSURLErrorTimedOut,
                 NSURLErrorCannotFindHost,
                 NSURLErrorCannotConnectToHost,
                 NSURLErrorInternationalRoamingOff,
                 NSURLErrorDataNotAllowed:
                return true
            default:
                return false
            }
        }
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet,
                 .networkConnectionLost,
                 .timedOut,
                 .cannotFindHost,
                 .cannotConnectToHost,
                 .internationalRoamingOff,
                 .dataNotAllowed:
                return true
            default:
                return false
            }
        }
        return false
    }

    func clearCheckedGroceryItems() async throws {
        let checked = groceryItems.filter(\.checked)
        let checkedIds = Set(checked.map(\.id))
        // US-264: hold the source rows for the rollback path; DB-side
        // ON DELETE CASCADE handles persisted cleanup once the parent
        // grocery_items rows are gone.
        let removedSources = groceryItemSources.filter { checkedIds.contains($0.groceryItemId) }
        groceryItems.removeAll { $0.checked }
        groceryItemSources.removeAll { checkedIds.contains($0.groceryItemId) }
        do {
            for id in checkedIds {
                try await dataService.deleteGroceryItem(id)
            }
            toast.success("Cleared \(checkedIds.count) items")
            HapticManager.success()
            AnalyticsService.track(.groceryListCleared(checkedCount: checkedIds.count))
        } catch {
            groceryItems.append(contentsOf: checked)
            groceryItemSources.append(contentsOf: removedSources)
            toast.show(error, as: { .delete(entity: "grocery items", underlying: $0) })
            HapticManager.error()
            throw error
        }
    }
}
