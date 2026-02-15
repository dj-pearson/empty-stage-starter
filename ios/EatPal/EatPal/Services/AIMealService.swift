import Foundation
import Supabase

/// Integrates with the backend AI meal suggestion edge function.
/// Sends kid profile + pantry data and receives meal plan suggestions.
@MainActor
final class AIMealService: ObservableObject {
    static let shared = AIMealService()
    private let client = SupabaseManager.client

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

        enum CodingKeys: String, CodingKey {
            case kidId = "kid_id"
            case date
            case safeFoods = "safe_foods"
            case tryBiteFoods = "try_bite_foods"
            case recentMeals = "recent_meals"
            case preferences
        }
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
        allFoods: [Food]
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
            )
        )

        do {
            let response = try await client.functions.invoke(
                "generate-meal-suggestions",
                options: .init(body: request)
            )

            let data = response.data
            let decoded = try JSONDecoder().decode([MealSuggestion].self, from: data)
            suggestions = decoded
        } catch {
            errorMessage = "Failed to generate suggestions: \(error.localizedDescription)"

            // Fallback: generate local suggestions from safe foods
            suggestions = generateLocalFallback(safeFoods: foods.filter(\.isSafe))
        }

        isLoading = false
    }

    // MARK: - Local Fallback

    /// Generates basic suggestions from safe foods when the AI service is unavailable.
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
