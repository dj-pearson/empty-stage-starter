import XCTest
@testable import EatPal

/// US-286: Tests for `MealMadeStrategy.plan(for:)`. Covers the decision
/// tree that picks between structured recipe_ingredients (server-handled),
/// legacy food_ids fallback (iOS-handled), and the no-op path.
final class MealMadeStrategyTests: XCTestCase {

    // MARK: - Helpers

    private func makeIngredient(
        id: String = UUID().uuidString,
        name: String = "Test",
        foodId: String? = nil,
        sortOrder: Int = 0
    ) -> RecipeIngredient {
        RecipeIngredient(
            id: id,
            recipeId: "r1",
            foodId: foodId,
            sortOrder: sortOrder,
            name: name,
            quantity: nil,
            unit: nil,
            groupLabel: nil,
            optionalNotes: nil,
            createdAt: nil
        )
    }

    private func makeRecipe(
        ingredients: [RecipeIngredient] = [],
        foodIds: [String] = []
    ) -> Recipe {
        var r = Recipe(
            id: "r1",
            userId: "u1",
            name: "Test",
            foodIds: foodIds
        )
        r.ingredients = ingredients
        return r
    }

    // MARK: - No recipe

    func testNilRecipeProducesEmptyNoOpPlan() {
        let plan = MealMadeStrategy.plan(for: nil)
        XCTAssertTrue(plan.debits.isEmpty)
        XCTAssertFalse(plan.fallbackUsed)
        XCTAssertFalse(plan.serverHandlesDebits)
        XCTAssertEqual(plan.decrementedCount, 0)
    }

    // MARK: - Structured ingredients path (server handles)

    func testStructuredIngredientsProducesServerHandledPlan() {
        let recipe = makeRecipe(ingredients: [
            makeIngredient(foodId: "food-a"),
            makeIngredient(foodId: "food-b")
        ])
        let plan = MealMadeStrategy.plan(for: recipe)
        XCTAssertEqual(plan.debits.map(\.foodId), ["food-a", "food-b"])
        XCTAssertEqual(plan.debits.map(\.amount), [1, 1])
        XCTAssertFalse(plan.fallbackUsed, "Structured path must not flag fallback")
        XCTAssertTrue(plan.serverHandlesDebits, "Server RPC walks recipe_ingredients")
    }

    func testStructuredIgnoresIngredientsWithoutFoodId() {
        // Mix of linked + unlinked ingredients. The unlinked one shouldn't
        // produce a debit since we have no food row to subtract from.
        let recipe = makeRecipe(ingredients: [
            makeIngredient(name: "saffron", foodId: nil),
            makeIngredient(name: "flour", foodId: "food-a")
        ])
        let plan = MealMadeStrategy.plan(for: recipe)
        XCTAssertEqual(plan.debits.map(\.foodId), ["food-a"])
        XCTAssertTrue(plan.serverHandlesDebits)
    }

    func testStructuredDedupesRepeatedFoodIds() {
        // A recipe may list the same food twice (e.g. "flour for dusting"
        // + "flour in dough"). Dedupe so we don't double-debit.
        let recipe = makeRecipe(ingredients: [
            makeIngredient(foodId: "food-a", sortOrder: 0),
            makeIngredient(foodId: "food-a", sortOrder: 1)
        ])
        let plan = MealMadeStrategy.plan(for: recipe)
        XCTAssertEqual(plan.debits.count, 1)
        XCTAssertEqual(plan.debits.first?.foodId, "food-a")
    }

    // MARK: - Legacy fallback path

    func testLegacyFoodIdsFallback() {
        // No structured ingredients — should fall back to recipe.foodIds.
        let recipe = makeRecipe(ingredients: [], foodIds: ["food-x", "food-y"])
        let plan = MealMadeStrategy.plan(for: recipe)
        XCTAssertEqual(plan.debits.map(\.foodId), ["food-x", "food-y"])
        XCTAssertTrue(plan.fallbackUsed, "Legacy path must flag fallback")
        XCTAssertFalse(plan.serverHandlesDebits, "iOS owns the writes for legacy")
    }

    func testLegacyDedupes() {
        let recipe = makeRecipe(ingredients: [], foodIds: ["food-x", "food-x", "food-y"])
        let plan = MealMadeStrategy.plan(for: recipe)
        XCTAssertEqual(plan.debits.map(\.foodId), ["food-x", "food-y"])
        XCTAssertTrue(plan.fallbackUsed)
    }

    // MARK: - Empty recipe

    func testEmptyRecipeProducesNoOp() {
        // No structured ingredients AND no food_ids → nothing to debit.
        let recipe = makeRecipe(ingredients: [], foodIds: [])
        let plan = MealMadeStrategy.plan(for: recipe)
        XCTAssertTrue(plan.debits.isEmpty)
        XCTAssertFalse(plan.fallbackUsed, "Empty recipe is not a fallback case — there's nothing to fall back to")
        XCTAssertFalse(plan.serverHandlesDebits)
    }

    // MARK: - Path precedence

    func testStructuredIngredientsTakePrecedenceOverFoodIds() {
        // When BOTH paths could fire, structured wins. The web behaviour
        // is the same (Planner.tsx uses recipe_ingredients when present).
        let recipe = makeRecipe(
            ingredients: [makeIngredient(foodId: "structured-food")],
            foodIds: ["legacy-food"]
        )
        let plan = MealMadeStrategy.plan(for: recipe)
        XCTAssertEqual(plan.debits.map(\.foodId), ["structured-food"])
        XCTAssertFalse(plan.fallbackUsed)
        XCTAssertTrue(plan.serverHandlesDebits)
    }
}
