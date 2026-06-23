import XCTest
@testable import EatPal

/// US-348: advisory pantry-coverage signal for planned meals.
final class PantryCoverageTests: XCTestCase {

    private func makeIngredient(name: String, quantity: Double? = nil, unit: String? = nil) -> RecipeIngredient {
        RecipeIngredient(
            id: UUID().uuidString,
            recipeId: "r1",
            foodId: nil,
            sortOrder: 0,
            name: name,
            quantity: quantity,
            unit: unit,
            groupLabel: nil,
            optionalNotes: nil,
            createdAt: nil
        )
    }

    private func makeFood(id: String = UUID().uuidString, name: String, quantity: Double? = nil, unit: String? = nil) -> Food {
        Food(id: id, userId: "u1", name: name, category: "other", isSafe: true, isTryBite: false, quantity: quantity, unit: unit)
    }

    private func makeRecipe(ingredients: [RecipeIngredient] = [], foodIds: [String] = []) -> Recipe {
        var r = Recipe(id: "r1", userId: "u1", name: "Test", foodIds: foodIds)
        r.ingredients = ingredients
        return r
    }

    func testFullyStockedWhenNoShortfalls() {
        let recipe = makeRecipe(ingredients: [makeIngredient(name: "flour", quantity: 2, unit: "cup")])
        let pantry = [makeFood(name: "flour", quantity: 5, unit: "cup")]
        XCTAssertEqual(PantryCoverage.compute(recipe: recipe, pantry: pantry), .fullyStocked)
    }

    func testNotStockedWhenNothingOnHand() {
        let recipe = makeRecipe(ingredients: [makeIngredient(name: "flour", quantity: 2, unit: "cup")])
        XCTAssertEqual(PantryCoverage.compute(recipe: recipe, pantry: []), .notStocked)
    }

    func testPartiallyStockedWhenSomeCovered() {
        let recipe = makeRecipe(ingredients: [
            makeIngredient(name: "flour", quantity: 2, unit: "cup"),
            makeIngredient(name: "sugar", quantity: 1, unit: "cup")
        ])
        let pantry = [makeFood(name: "flour", quantity: 5, unit: "cup")]
        XCTAssertEqual(PantryCoverage.compute(recipe: recipe, pantry: pantry), .partiallyStocked)
    }

    func testNilWhenNoIngredientsAndNoFoodIds() {
        XCTAssertNil(PantryCoverage.compute(recipe: makeRecipe(), pantry: []))
    }

    func testLegacyFoodIdsFallback() {
        let recipe = makeRecipe(foodIds: ["f1", "f2"])
        // Only f1 on hand → partial.
        let pantry = [makeFood(id: "f1", name: "rice", quantity: 3)]
        XCTAssertEqual(PantryCoverage.compute(recipe: recipe, pantry: pantry), .partiallyStocked)
    }
}
