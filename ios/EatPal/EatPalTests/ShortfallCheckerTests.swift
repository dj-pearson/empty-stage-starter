import XCTest
@testable import EatPal

/// US-353: shared shortfall check (legacy foodId fallback + multi-recipe
/// aggregation) used by every plan-add path.
final class ShortfallCheckerTests: XCTestCase {

    private func makeIngredient(name: String, foodId: String?, quantity: Double? = 1, unit: String? = nil) -> RecipeIngredient {
        RecipeIngredient(
            id: UUID().uuidString, recipeId: "r", foodId: foodId, sortOrder: 0,
            name: name, quantity: quantity, unit: unit, groupLabel: nil,
            optionalNotes: nil, createdAt: nil
        )
    }

    private func makeFood(id: String, name: String, quantity: Double?) -> Food {
        Food(id: id, userId: "u1", name: name, category: "snack", isSafe: true, isTryBite: false, quantity: quantity)
    }

    private func makeRecipe(id: String = "r", ingredients: [RecipeIngredient] = [], foodIds: [String] = []) -> Recipe {
        var r = Recipe(id: id, userId: "u1", name: "R", foodIds: foodIds)
        r.ingredients = ingredients
        return r
    }

    func testStructuredRecipeUsesShortfallCalculator() {
        let recipe = makeRecipe(ingredients: [makeIngredient(name: "flour", foodId: "f1")])
        // f1 not in pantry → short.
        let result = ShortfallChecker.shortfalls(for: recipe, pantry: [])
        XCTAssertEqual(result.count, 1)
    }

    func testLegacyFoodIdsFallbackProducesShortfalls() {
        // No structured ingredients → fall back to foodIds. The linked food is
        // out of stock (qty 0) → it's a shortfall.
        let recipe = makeRecipe(foodIds: ["f1"])
        let pantry = [makeFood(id: "f1", name: "rice", quantity: 0)]
        let result = ShortfallChecker.shortfalls(for: recipe, pantry: pantry)
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result.first?.ingredient.name, "rice")
    }

    func testAggregateDedupesByIngredientName() {
        let r1 = makeRecipe(id: "r1", ingredients: [makeIngredient(name: "Flour", foodId: nil)])
        let r2 = makeRecipe(id: "r2", ingredients: [makeIngredient(name: "flour", foodId: nil),
                                                    makeIngredient(name: "Sugar", foodId: nil)])
        let result = ShortfallChecker.aggregate(recipes: [r1, r2], pantry: [])
        // "Flour"/"flour" merge → flour + sugar = 2 unique.
        XCTAssertEqual(Set(result.map { $0.ingredient.name.lowercased() }), ["flour", "sugar"])
    }
}
