import AppIntents
import Foundation

/// US-233: Food-status Siri intents.
///
/// `MarkFoodSafeIntent` and `MarkFoodTryBiteIntent` flip flags on a Food
/// record without opening the app. Both back onto a `FoodEntity` parameter
/// that resolves spoken food names (and Spotlight suggestions) via
/// `FoodEntityQuery`'s `EntityStringQuery` conformance.

// MARK: - Food entity

/// Lightweight entity wrapper around `Food`. Only what Siri/Shortcuts needs
/// to display + resolve a food — full Food record is fetched at perform time.
struct FoodEntity: AppEntity, Identifiable {
    let id: String
    let name: String
    let category: String

    static var typeDisplayRepresentation: TypeDisplayRepresentation {
        TypeDisplayRepresentation(name: "Food")
    }

    var displayRepresentation: DisplayRepresentation {
        let categoryIcon = FoodCategory(rawValue: category)?.icon ?? "🍽"
        return DisplayRepresentation(title: "\(categoryIcon) \(name)")
    }

    static var defaultQuery = FoodEntityQuery()

    init(id: String, name: String, category: String) {
        self.id = id
        self.name = name
        self.category = category
    }

    init(food: Food) {
        self.id = food.id
        self.name = food.name
        self.category = food.category
    }
}

/// Query that lets Siri / Shortcuts resolve a `FoodEntity` from either an
/// identifier (saved shortcut) or a spoken/typed string ("broccoli" →
/// matching food). Conforms to `EntityStringQuery` so Siri can match by
/// voice without us building a custom entity index.
struct FoodEntityQuery: EntityQuery, EntityStringQuery {
    /// Look up specific food entities by id — used when a saved Shortcut
    /// references a previously-resolved food.
    func entities(for identifiers: [FoodEntity.ID]) async throws -> [FoodEntity] {
        let foods = try await DataService.shared.fetchFoods()
        return foods.filter { identifiers.contains($0.id) }.map(FoodEntity.init(food:))
    }

    /// Suggested entities shown when the user picks a food in the Shortcuts
    /// editor — capped to 30 so the list stays scannable.
    func suggestedEntities() async throws -> [FoodEntity] {
        let foods = try await DataService.shared.fetchFoods()
        return Array(foods.prefix(30)).map(FoodEntity.init(food:))
    }

    /// Voice / typed name matching. Case-insensitive substring; if a voice
    /// transcription says "carrots" we match "Carrot" too via prefix fallback.
    func entities(matching string: String) async throws -> [FoodEntity] {
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }

        let foods = try await DataService.shared.fetchFoods()
        let lowered = trimmed.lowercased()

        let exact = foods.filter { $0.name.lowercased() == lowered }
        if !exact.isEmpty {
            return exact.map(FoodEntity.init(food:))
        }

        let prefix = foods.filter { $0.name.lowercased().hasPrefix(lowered) }
        if !prefix.isEmpty {
            return Array(prefix.prefix(20)).map(FoodEntity.init(food:))
        }

        let contains = foods.filter { $0.name.localizedCaseInsensitiveContains(trimmed) }
        return Array(contains.prefix(20)).map(FoodEntity.init(food:))
    }
}

// MARK: - Mark food safe

struct MarkFoodSafeIntent: AppIntent {
    static var title: LocalizedStringResource = "Mark Food as Safe"
    static var description = IntentDescription(
        "Marks a food as safe in your EatPal pantry — a food you know your child eats reliably.",
        categoryName: "Pantry"
    )
    static var openAppWhenRun: Bool = false

    @Parameter(
        title: "Food",
        description: "The food to mark as safe."
    )
    var food: FoodEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Mark \(\.$food) as a safe food in EatPal")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        do {
            try await DataService.shared.updateFood(
                food.id,
                updates: FoodUpdate(isSafe: true, isTryBite: false)
            )
            SentryService.leaveBreadcrumb(
                category: "intent",
                message: "MarkFoodSafeIntent: \(food.name)"
            )
            return .result(dialog: "Marked \(food.name) as a safe food.")
        } catch {
            SentryService.capture(error, extras: ["intent": "MarkFoodSafe"])
            throw error
        }
    }
}

// MARK: - Mark food try-bite

struct MarkFoodTryBiteIntent: AppIntent {
    static var title: LocalizedStringResource = "Mark Food as Try-Bite"
    static var description = IntentDescription(
        "Marks a food as a try-bite — something your child is being introduced to.",
        categoryName: "Pantry"
    )
    static var openAppWhenRun: Bool = false

    @Parameter(
        title: "Food",
        description: "The food to flag as a try-bite."
    )
    var food: FoodEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Flag \(\.$food) as a try-bite in EatPal")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        do {
            try await DataService.shared.updateFood(
                food.id,
                updates: FoodUpdate(isSafe: false, isTryBite: true)
            )
            SentryService.leaveBreadcrumb(
                category: "intent",
                message: "MarkFoodTryBiteIntent: \(food.name)"
            )
            return .result(dialog: "Marked \(food.name) as a try-bite.")
        } catch {
            SentryService.capture(error, extras: ["intent": "MarkFoodTryBite"])
            throw error
        }
    }
}

// MARK: - Today's plan

/// Spoken summary of every meal planned for today, across kids. Complements
/// `WhatsForDinnerIntent` (which is dinner-only) for the "what does the day
/// look like" lock-screen ask.
struct TodaysPlanIntent: AppIntent {
    static var title: LocalizedStringResource = "Today's Meal Plan"
    static var description = IntentDescription(
        "Tells you every meal planned for today across your family.",
        categoryName: "Meal Plan"
    )
    static var openAppWhenRun: Bool = false

    static var parameterSummary: some ParameterSummary {
        Summary("Today's EatPal meal plan")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let todayString = DateFormatter.isoDate.string(from: Date())

        do {
            let kids = try await DataService.shared.fetchKids()
            let plans = try await DataService.shared.fetchPlanEntries()
            let foods = try await DataService.shared.fetchFoods()
            let recipes = try await DataService.shared.fetchRecipes()

            let today = plans.filter { $0.date == todayString }
            guard !today.isEmpty else {
                return .result(dialog: "Nothing is planned in EatPal for today.")
            }

            // Group by slot in canonical morning→evening order so the spoken
            // summary follows the day instead of database insertion order.
            let slotOrder: [String] = MealSlot.allCases.map(\.rawValue)
            var lines: [String] = []
            for slot in slotOrder {
                let slotEntries = today.filter { $0.mealSlot == slot }
                guard !slotEntries.isEmpty else { continue }

                let names: [String] = slotEntries.compactMap { entry in
                    if let recipeId = entry.recipeId,
                       let recipe = recipes.first(where: { $0.id == recipeId }) {
                        return recipe.name
                    }
                    return foods.first { $0.id == entry.foodId }?.name
                }

                guard !names.isEmpty else { continue }
                let unique = Array(Set(names))
                let label = MealSlot(rawValue: slot)?.displayName ?? slot.capitalized
                lines.append("\(label): \(unique.joined(separator: " and "))")
            }

            guard !lines.isEmpty else {
                return .result(dialog: "Today's plan in EatPal has entries but no food names yet.")
            }

            let kidSuffix = kids.count > 1 ? " (across \(kids.count) kids)" : ""
            let summary = "Today in EatPal\(kidSuffix). " + lines.joined(separator: ". ") + "."
            SentryService.leaveBreadcrumb(
                category: "intent",
                message: "TodaysPlanIntent: \(lines.count) slot summaries"
            )
            return .result(dialog: IntentDialog(stringLiteral: summary))
        } catch {
            SentryService.capture(error, extras: ["intent": "TodaysPlan"])
            throw error
        }
    }
}
