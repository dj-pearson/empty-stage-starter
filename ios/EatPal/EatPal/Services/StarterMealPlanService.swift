import Foundation

/// US-235: Loads bundled starter meal-plan templates and applies them to the
/// active kid's week. The bundled JSON references foods by name only — when
/// applying, we fuzzy-match against the user's pantry and auto-create any
/// missing food rows so plan entries reference real Food UUIDs.
@MainActor
enum StarterMealPlanService {

    struct StarterTemplate: Codable, Identifiable, Equatable {
        let id: String
        let name: String
        let blurb: String
        let ageRangeMin: Int?
        let ageRangeMax: Int?
        let tags: [String]?
        let meals: [StarterMeal]
    }

    struct StarterMeal: Codable, Equatable, Hashable {
        let dayIndex: Int       // 0 (week start) ... 6
        let mealSlot: String    // raw MealSlot value (breakfast / lunch / dinner / snack1 / snack2 / try_bite)
        let foodName: String
        let category: String    // raw FoodCategory value
    }

    private struct Catalog: Codable {
        let version: Int
        let templates: [StarterTemplate]
    }

    /// Result of applying a template — used to drive the success toast.
    struct ApplyResult {
        let entriesCreated: Int
        let foodsCreated: Int
        let allergenSkips: [String]   // unique allergen names that triggered skips
        let allergenSkipCount: Int
    }

    /// Cached catalog — the bundled JSON is small but no point re-decoding.
    private static var cachedCatalog: Catalog?

    /// Returns every bundled template. Empty if the JSON is missing or
    /// unreadable (logged to Sentry; the UI shows the empty-list state).
    static func allTemplates() -> [StarterTemplate] {
        loadCatalog()?.templates ?? []
    }

    /// Apply a starter template to the given week for the given kid.
    /// - Allergen guard: any meal whose `category`-implied food matches an
    ///   existing pantry food with allergens that conflict with the target
    ///   kid is skipped. (Fresh foods we auto-create have no allergens by
    ///   default, so they pass through.)
    static func apply(
        _ template: StarterTemplate,
        weekStart: Date,
        kidId: String,
        appState: AppState
    ) async throws -> ApplyResult {
        let calendar = Calendar.current
        let kid = appState.kids.first { $0.id == kidId }
        let kidAllergens = Set((kid?.allergens ?? []).map { $0.lowercased() })

        var foodsCreated = 0
        var entriesCreated = 0
        var skipCount = 0
        var skipAllergens: Set<String> = []

        for meal in template.meals {
            let food = try await resolveFood(
                named: meal.foodName,
                category: meal.category,
                appState: appState,
                createdCounter: &foodsCreated
            )

            // Allergen guard against existing pantry foods.
            if !kidAllergens.isEmpty {
                let foodAllergens = Set((food.allergens ?? []).map { $0.lowercased() })
                let conflict = foodAllergens.intersection(kidAllergens)
                if !conflict.isEmpty {
                    skipCount += 1
                    skipAllergens.formUnion(conflict)
                    continue
                }
            }

            let date = calendar.date(byAdding: .day, value: meal.dayIndex, to: weekStart) ?? weekStart
            let entry = PlanEntry(
                id: UUID().uuidString,
                userId: "",
                kidId: kidId,
                date: DateFormatter.isoDate.string(from: date),
                mealSlot: meal.mealSlot,
                foodId: food.id
            )

            do {
                try await appState.addPlanEntry(entry)
                entriesCreated += 1
            } catch {
                skipCount += 1
            }
        }

        return ApplyResult(
            entriesCreated: entriesCreated,
            foodsCreated: foodsCreated,
            allergenSkips: Array(skipAllergens).sorted(),
            allergenSkipCount: skipCount
        )
    }

    /// Returns the count of allergen conflicts a starter template would
    /// produce against the kid — used by the preview UI before commit.
    static func conflictPreview(
        _ template: StarterTemplate,
        kidId: String,
        appState: AppState
    ) -> [(foodName: String, allergens: [String])] {
        let kid = appState.kids.first { $0.id == kidId }
        let kidAllergens = Set((kid?.allergens ?? []).map { $0.lowercased() })
        guard !kidAllergens.isEmpty else { return [] }

        var seen: Set<String> = []
        var result: [(String, [String])] = []
        for meal in template.meals {
            guard let existing = appState.foods.first(where: {
                $0.name.lowercased() == meal.foodName.lowercased()
            }) else { continue }

            let foodAllergens = Set((existing.allergens ?? []).map { $0.lowercased() })
            let conflict = foodAllergens.intersection(kidAllergens)
            if !conflict.isEmpty, !seen.contains(existing.id) {
                seen.insert(existing.id)
                result.append((existing.name, Array(conflict).sorted()))
            }
        }
        return result
    }

    // MARK: - Private

    private static func loadCatalog() -> Catalog? {
        if let cached = cachedCatalog { return cached }

        guard let url = Bundle.main.url(
            forResource: "StarterMealPlans",
            withExtension: "json"
        ) else {
            SentryService.leaveBreadcrumb(
                category: "starter-templates",
                message: "StarterMealPlans.json not found in bundle"
            )
            return nil
        }

        do {
            let data = try Data(contentsOf: url)
            let catalog = try JSONDecoder().decode(Catalog.self, from: data)
            cachedCatalog = catalog
            return catalog
        } catch {
            SentryService.capture(error, extras: [
                "context": "starter_template_decode"
            ])
            return nil
        }
    }

    /// Find a food by case-insensitive name match; if missing, create a new
    /// Food row in the user's pantry with the template-supplied category and
    /// `addedVia: "starter_template"` so analytics can spot it later.
    private static func resolveFood(
        named name: String,
        category: String,
        appState: AppState,
        createdCounter: inout Int
    ) async throws -> Food {
        let normalized = name.lowercased()
        if let existing = appState.foods.first(where: { $0.name.lowercased() == normalized }) {
            return existing
        }

        let resolvedCategory = FoodCategory(rawValue: category)?.rawValue ?? FoodCategory.snack.rawValue
        let newFood = Food(
            id: UUID().uuidString,
            userId: "",
            name: name,
            category: resolvedCategory,
            isSafe: false,
            isTryBite: false
        )
        try await appState.addFood(newFood)
        createdCounter += 1
        return newFood
    }
}
