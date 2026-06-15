import XCTest
@testable import EatPal

/// US-251: a recipe's weekly-budget contribution = sum of its priced
/// ingredient lines, with a "partial" flag when some are unpriced.
final class BudgetServiceRecipeCostTests: XCTestCase {

    private func ingredient(name: String, price: Double?) -> RecipeIngredient {
        var ing = RecipeIngredient.new(recipeId: "r1", sortOrder: 0, name: name)
        ing.pricePerUnit = price
        return ing
    }

    private func recipe(_ ingredients: [RecipeIngredient]) -> Recipe {
        var r = Recipe(id: "r1", userId: "u1", name: "Test", foodIds: [])
        r.ingredients = ingredients
        return r
    }

    func testAllPricedSumsWithoutPartial() {
        let r = recipe([
            ingredient(name: "pasta", price: 3.20),
            ingredient(name: "sauce", price: 1.80)
        ])
        let cost = BudgetService.recipeCost(r)
        XCTAssertEqual(cost?.total ?? -1, 5.0, accuracy: 0.0001)
        XCTAssertEqual(cost?.partial, false)
    }

    func testSomeUnpricedFlagsPartial() {
        let r = recipe([
            ingredient(name: "pasta", price: 3.20),
            ingredient(name: "salt", price: nil)
        ])
        let cost = BudgetService.recipeCost(r)
        XCTAssertEqual(cost?.total ?? -1, 3.20, accuracy: 0.0001)
        XCTAssertEqual(cost?.partial, true, "an unpriced ingredient must flag partial")
    }

    func testNoPricedIngredientsReturnsNil() {
        let r = recipe([ingredient(name: "pasta", price: nil)])
        XCTAssertNil(BudgetService.recipeCost(r))
    }

    func testEmptyRecipeReturnsNil() {
        XCTAssertNil(BudgetService.recipeCost(recipe([])))
    }
}
