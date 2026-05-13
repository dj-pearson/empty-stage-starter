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

/// US-296 (Tier 1): Bulk grocery add via Shortcuts / Siri.
///
/// Accepts a multi-line text blob — exactly what `Get All Reminders → Combine to Text`
/// or `Notes → Body → Combine to Text` produces — and pipes it through the same
/// `GroceryTextParser` the share extension and voice input use. One shortcut
/// action covers the Notes/Reminders "I have a list elsewhere" workflow without
/// the user needing to open the app.
///
/// Background-runnable (`openAppWhenRun = false`) so Siri can run it from the
/// lock screen. Returns a count dialog so the user gets confirmation.
struct BulkAddGroceryItemsIntent: AppIntent {
    static var title: LocalizedStringResource = "Add Multiple Grocery Items"
    static var description = IntentDescription(
        "Adds many items at once from a list — paste from Notes, Reminders, or any text.",
        categoryName: "Grocery"
    )
    static var openAppWhenRun: Bool = false

    @Parameter(
        title: "Items",
        description: "One item per line, or comma-separated. Quantities and units like 'two pounds of chicken' are parsed automatically.",
        inputOptions: .init(
            capitalizationType: .sentences,
            multiline: true
        )
    )
    var text: String

    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$text) to EatPal grocery")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            throw $text.needsValueError("What should I add to your grocery list?")
        }

        let parsed = GroceryTextParser.parse(trimmed)
        guard !parsed.isEmpty else {
            return .result(dialog: "I couldn't find any grocery items in that text.")
        }

        var addedCount = 0
        var failedNames: [String] = []

        for item in parsed {
            let unit = item.unit.isEmpty ? "count" : item.unit
            let newItem = GroceryItem(
                id: UUID().uuidString,
                userId: "",
                name: item.name,
                category: item.category,
                quantity: item.quantity,
                unit: unit,
                checked: false,
                addedVia: "shortcut-bulk",
                // US-263: route bulk-shortcut items to the right store aisle too,
                // matching the single-item intent behaviour.
                aisleSection: GroceryAisle.fromLegacyCategory(item.category).rawValue
            )
            do {
                try await DataService.shared.insertGroceryItem(newItem)
                addedCount += 1
            } catch {
                failedNames.append(item.name)
            }
        }

        SentryService.leaveBreadcrumb(
            category: "intent",
            message: "BulkAddGroceryItemsIntent: \(addedCount)/\(parsed.count) added"
        )

        let dialog: String = {
            switch (addedCount, failedNames.count) {
            case (0, _):
                return "I couldn't save any of those items. Please try again."
            case (_, 0):
                return "Added \(addedCount) item\(addedCount == 1 ? "" : "s") to your grocery list."
            default:
                return "Added \(addedCount) of \(parsed.count) items. \(failedNames.count) couldn't be saved."
            }
        }()

        return .result(dialog: IntentDialog(stringLiteral: dialog))
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
