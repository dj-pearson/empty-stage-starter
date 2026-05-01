import AppIntents
import Foundation

/// US-142: Siri / Shortcuts grocery intents.
///
/// Intents run in the background (`openAppWhenRun = false`) and talk directly
/// to `DataService.shared`, which authenticates via the Supabase session
/// stored in the keychain. If the user has no active session the intent
/// throws a descriptive error that Siri surfaces.

struct AddGroceryItemIntent: AppIntent {
    static var title: LocalizedStringResource = "Add Grocery Item"
    static var description = IntentDescription(
        "Adds an item to your EatPal grocery list.",
        categoryName: "Grocery"
    )
    static var openAppWhenRun: Bool = false

    @Parameter(
        title: "Item",
        description: "What to add — e.g. 'milk', 'two pounds of chicken', 'a dozen eggs'",
        inputOptions: .init(capitalizationType: .sentences)
    )
    var item: String

    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$item) to EatPal grocery")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let trimmed = item.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw $item.needsValueError("What should I add to your grocery list?")
        }

        // Reuse the text parser so "two pounds of chicken" resolves to qty/unit/category.
        let parsed = GroceryTextParser.parse(trimmed).first
        let name = parsed?.name ?? trimmed.capitalized
        let category = parsed?.category ?? "snack"
        let quantity = parsed?.quantity ?? 1
        let unit = (parsed?.unit.isEmpty ?? true) ? "count" : parsed!.unit

        let newItem = GroceryItem(
            id: UUID().uuidString,
            userId: "",
            name: name,
            category: category,
            quantity: quantity,
            unit: unit,
            checked: false,
            addedVia: "siri",
            // US-263: derive aisle from the parsed FoodCategory so Siri-added
            // items also land in the right store section.
            aisleSection: GroceryAisle.fromLegacyCategory(category).rawValue
        )

        do {
            try await DataService.shared.insertGroceryItem(newItem)
            SentryService.leaveBreadcrumb(
                category: "intent",
                message: "AddGroceryItemIntent: \(name)"
            )
            return .result(dialog: "Added \(name) to your grocery list.")
        } catch {
            SentryService.capture(error, extras: ["intent": "AddGroceryItem"])
            throw error
        }
    }
}

struct WhatsForDinnerIntent: AppIntent {
    static var title: LocalizedStringResource = "What's For Dinner"
    static var description = IntentDescription(
        "Tells you what's planned for dinner in EatPal today.",
        categoryName: "Meal Plan"
    )
    static var openAppWhenRun: Bool = false

    static var parameterSummary: some ParameterSummary {
        Summary("What's for dinner in EatPal")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let todayString = DateFormatter.isoDate.string(from: Date())

        do {
            let kids = try await DataService.shared.fetchKids()
            let plans = try await DataService.shared.fetchPlanEntries()
            let foods = try await DataService.shared.fetchFoods()
            let recipes = try await DataService.shared.fetchRecipes()

            // Focus on today's dinner entries across all kids — merges family view.
            let dinnerEntries = plans.filter {
                $0.date == todayString && $0.mealSlot == MealSlot.dinner.rawValue
            }

            guard !dinnerEntries.isEmpty else {
                SentryService.leaveBreadcrumb(
                    category: "intent",
                    message: "WhatsForDinnerIntent: empty"
                )
                return .result(dialog: "You don't have dinner planned in EatPal today.")
            }

            let descriptions = dinnerEntries.map { entry -> String in
                if let recipeId = entry.recipeId,
                   let recipe = recipes.first(where: { $0.id == recipeId }) {
                    let kidName = kids.first(where: { $0.id == entry.kidId })?.name
                    return kidName.map { "\($0): \(recipe.name)" } ?? recipe.name
                }
                let food = foods.first(where: { $0.id == entry.foodId })
                let name = food?.name ?? "an unnamed item"
                if let kidName = kids.first(where: { $0.id == entry.kidId })?.name {
                    return "\(kidName): \(name)"
                }
                return name
            }

            let unique = Array(Set(descriptions)).sorted()
            let sentence: String = {
                switch unique.count {
                case 1: return "Tonight in EatPal: \(unique[0])."
                case 2: return "Tonight in EatPal: \(unique[0]) and \(unique[1])."
                default:
                    let last = unique.last ?? ""
                    let head = unique.dropLast().joined(separator: ", ")
                    return "Tonight in EatPal: \(head), and \(last)."
                }
            }()

            SentryService.leaveBreadcrumb(
                category: "intent",
                message: "WhatsForDinnerIntent: \(unique.count) item(s)"
            )
            return .result(dialog: IntentDialog(stringLiteral: sentence))
        } catch {
            SentryService.capture(error, extras: ["intent": "WhatsForDinner"])
            throw error
        }
    }
}
