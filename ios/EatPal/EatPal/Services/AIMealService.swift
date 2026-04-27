import Foundation

/// Integrates with the backend AI meal suggestion edge function.
/// Sends kid profile + pantry data and receives meal plan suggestions.
@MainActor
final class AIMealService: ObservableObject {
    static let shared = AIMealService()

    @Published var suggestions: [MealSuggestion] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private init() {}

    // MARK: - Types

    struct MealSuggestion: Identifiable, Codable {
        let id: String
        let mealSlot: String
        let foodName: String
        let foodId: String?
        let reasoning: String
        let nutritionNote: String?

        enum CodingKeys: String, CodingKey {
            case id
            case mealSlot = "meal_slot"
            case foodName = "food_name"
            case foodId = "food_id"
            case reasoning
            case nutritionNote = "nutrition_note"
        }
    }

    struct SuggestionRequest: Codable {
        let kidId: String
        let date: String
        let safeFoods: [FoodSummary]
        let tryBiteFoods: [FoodSummary]
        let recentMeals: [MealSummary]
        let preferences: KidPreferences
        /// US-230: ingredient names the LLM should bias toward — populated
        /// with foods expiring within ~7 days so the planner picks them
        /// before they go to waste. Optional; older edge-function versions
        /// just ignore the field.
        let preferIngredients: [String]?
        /// US-231: meal names the family rated 4-5★ recently. Lets the LLM
        /// favor real-world hits over generic suggestions.
        let lovedMeals: [String]?
        /// US-231: meal names the family rated 1-2★ along with the parent's
        /// note (when provided). Lets the LLM avoid known fails and learn
        /// from the rejection reason ("too crunchy", "doesn't like sauce").
        let refusedMeals: [RefusedMealSignal]?
        /// US-243: optional per-week budget cap. When set, the prompt nudges
        /// the LLM toward cheaper meals. Currency follows the user's locale.
        let weeklyBudget: Double?
        /// US-238: confirmed-from-fridge ingredient names. Stronger signal
        /// than `preferIngredients` (which is fuzzy / expiry-driven) — the
        /// prompt is told these are KNOWN to be on hand right now.
        let availableIngredients: [String]?

        enum CodingKeys: String, CodingKey {
            case kidId = "kid_id"
            case date
            case safeFoods = "safe_foods"
            case tryBiteFoods = "try_bite_foods"
            case recentMeals = "recent_meals"
            case preferences
            case preferIngredients = "prefer_ingredients"
            case lovedMeals = "loved_meals"
            case refusedMeals = "refused_meals"
            case weeklyBudget = "weekly_budget"
            case availableIngredients = "available_ingredients"
        }
    }

    /// Compact refusal signal — just the food name + the parent's note.
    /// We deliberately omit IDs so the LLM treats it as a heuristic, not
    /// a record reference, and so the prompt stays short.
    struct RefusedMealSignal: Codable {
        let name: String
        let note: String?
    }

    struct FoodSummary: Codable {
        let id: String
        let name: String
        let category: String
    }

    struct MealSummary: Codable {
        let date: String
        let slot: String
        let foodName: String
        let result: String?

        enum CodingKeys: String, CodingKey {
            case date, slot
            case foodName = "food_name"
            case result
        }
    }

    struct KidPreferences: Codable {
        let name: String
        let age: Int?
        let pickinessLevel: String?
        let allergens: [String]?
        let texturePreferences: [String]?
        let flavorPreferences: [String]?

        enum CodingKeys: String, CodingKey {
            case name, age
            case pickinessLevel = "pickiness_level"
            case allergens
            case texturePreferences = "texture_preferences"
            case flavorPreferences = "flavor_preferences"
        }
    }

    // MARK: - Generate Suggestions

    /// Calls the backend edge function to generate AI meal suggestions.
    func generateSuggestions(
        kid: Kid,
        date: Date,
        foods: [Food],
        recentEntries: [PlanEntry],
        allFoods: [Food],
        recipes: [Recipe] = [],
        feedback: [PlanEntryFeedback] = [],
        weeklyBudget: Double? = nil,
        availableIngredients: [String]? = nil
    ) async {
        isLoading = true
        errorMessage = nil

        let safeFoods = foods.filter(\.isSafe).map {
            FoodSummary(id: $0.id, name: $0.name, category: $0.category)
        }
        let tryBiteFoods = foods.filter(\.isTryBite).map {
            FoodSummary(id: $0.id, name: $0.name, category: $0.category)
        }

        let recentMeals = recentEntries.prefix(21).map { entry in
            let foodName = allFoods.first { $0.id == entry.foodId }?.name ?? "Unknown"
            return MealSummary(
                date: entry.date,
                slot: entry.mealSlot,
                foodName: foodName,
                result: entry.result
            )
        }

        // US-230: bias the planner toward foods that are about to expire
        // (within 7 days) so the family uses them up before they spoil.
        // Sorted soonest-first so the LLM gets the most urgent first.
        let preferIngredients: [String]? = {
            let expiring = allFoods
                .filter { food in
                    guard let days = food.daysUntilExpiry else { return false }
                    return days >= 0 && days <= 7
                }
                .sorted { ($0.daysUntilExpiry ?? .max) < ($1.daysUntilExpiry ?? .max) }
                .prefix(15)
                .map(\.name)
            return expiring.isEmpty ? nil : Array(expiring)
        }()

        // US-231: distill rated meals into compact loved/refused signals
        // for the prompt. Only meals belonging to this kid count; we group
        // by (recipeId or foodId) so multiple ratings of the same dish
        // average out before we send it.
        let (lovedMeals, refusedMeals) = Self.feedbackSignals(
            for: kid.id,
            feedback: feedback,
            planEntries: recentEntries,
            foods: allFoods,
            recipes: recipes
        )

        let request = SuggestionRequest(
            kidId: kid.id,
            date: DateFormatter.isoDate.string(from: date),
            safeFoods: safeFoods,
            tryBiteFoods: tryBiteFoods,
            recentMeals: recentMeals,
            preferences: KidPreferences(
                name: kid.name,
                age: kid.age,
                pickinessLevel: kid.pickinessLevel,
                allergens: kid.allergens,
                texturePreferences: kid.texturePreferences,
                flavorPreferences: kid.flavorPreferences
            ),
            preferIngredients: preferIngredients,
            lovedMeals: lovedMeals,
            refusedMeals: refusedMeals,
            // Pass through only when > 0; nil tells the edge function to
            // ignore the budget bias entirely.
            weeklyBudget: (weeklyBudget ?? 0) > 0 ? weeklyBudget : nil,
            availableIngredients: (availableIngredients?.isEmpty == false) ? availableIngredients : nil
        )

        do {
            let decoded: [MealSuggestion] = try await EdgeFunctions.invoke(
                "generate-meal-suggestions",
                body: request,
                as: [MealSuggestion].self
            )
            suggestions = decoded
            await MainActor.run {
                AnalyticsService.track(.aiPlanGenerated(promptType: "remote_edge_function"))
            }
        } catch {
            errorMessage = "Failed to generate suggestions: \(error.localizedDescription)"

            // Fallback: generate local suggestions from safe foods
            suggestions = generateLocalFallback(safeFoods: foods.filter(\.isSafe))
            await MainActor.run {
                AnalyticsService.track(.aiPlanGenerated(promptType: "local_fallback"))
            }
        }

        isLoading = false
    }

    // MARK: - Local Fallback

    /// Generates basic suggestions from safe foods when the AI service is unavailable.
    /// US-231: build top-10 loved + top-5 refused signals from raw feedback.
    /// Aggregates by (recipeId or foodId) so a dish rated five times shows
    /// up once with its average. Refusal signal additionally carries the
    /// parent's note when one was attached.
    static func feedbackSignals(
        for kidId: String,
        feedback: [PlanEntryFeedback],
        planEntries: [PlanEntry],
        foods: [Food],
        recipes: [Recipe]
    ) -> (loved: [String]?, refused: [RefusedMealSignal]?) {
        // Resolve a feedback row → display name and dish key. Skips entries
        // that don't belong to the active kid or whose food/recipe is gone.
        struct Resolved {
            let key: String
            let name: String
            let rating: Int
            let note: String?
        }
        let resolved: [Resolved] = feedback.compactMap { fb in
            guard let entry = planEntries.first(where: { $0.id == fb.planEntryId }),
                  entry.kidId == kidId else { return nil }
            if let rid = entry.recipeId,
               let recipe = recipes.first(where: { $0.id == rid }) {
                return Resolved(key: "r:\(rid)", name: recipe.name, rating: fb.rating, note: fb.note)
            }
            if let food = foods.first(where: { $0.id == entry.foodId }) {
                return Resolved(key: "f:\(food.id)", name: food.name, rating: fb.rating, note: fb.note)
            }
            return nil
        }

        // Group then average per dish.
        var grouped: [String: (name: String, ratings: [Int], notes: [String])] = [:]
        for r in resolved {
            var bucket = grouped[r.key] ?? (name: r.name, ratings: [], notes: [])
            bucket.ratings.append(r.rating)
            if let note = r.note, !note.isEmpty { bucket.notes.append(note) }
            grouped[r.key] = bucket
        }

        let loved = grouped
            .filter { (Double($1.ratings.reduce(0, +)) / Double($1.ratings.count)) >= 4.0 }
            .sorted { lhs, rhs in
                let l = Double(lhs.value.ratings.reduce(0, +)) / Double(lhs.value.ratings.count)
                let r = Double(rhs.value.ratings.reduce(0, +)) / Double(rhs.value.ratings.count)
                return l > r
            }
            .prefix(10)
            .map { $0.value.name }

        let refused: [RefusedMealSignal] = grouped
            .filter { (Double($1.ratings.reduce(0, +)) / Double($1.ratings.count)) <= 2.0 }
            .sorted { lhs, rhs in
                let l = Double(lhs.value.ratings.reduce(0, +)) / Double(lhs.value.ratings.count)
                let r = Double(rhs.value.ratings.reduce(0, +)) / Double(rhs.value.ratings.count)
                return l < r
            }
            .prefix(5)
            .map { entry in
                RefusedMealSignal(
                    name: entry.value.name,
                    note: entry.value.notes.first  // first note is enough — the LLM doesn't need a transcript
                )
            }

        return (
            loved.isEmpty ? nil : Array(loved),
            refused.isEmpty ? nil : refused
        )
    }

    private func generateLocalFallback(safeFoods: [Food]) -> [MealSuggestion] {
        let slots = MealSlot.allCases
        var result: [MealSuggestion] = []
        let shuffled = safeFoods.shuffled()

        for (index, slot) in slots.enumerated() {
            guard index < shuffled.count else { break }
            let food = shuffled[index]
            result.append(MealSuggestion(
                id: UUID().uuidString,
                mealSlot: slot.rawValue,
                foodName: food.name,
                foodId: food.id,
                reasoning: "Based on \(food.name) being a safe food in your pantry.",
                nutritionNote: nil
            ))
        }

        return result
    }

    func clearSuggestions() {
        suggestions = []
    }
}
