import XCTest
@testable import EatPal

/// US-285: Tests for `ShortfallCalculator` — parity logic with the web
/// `recipeShortfall.ts` (US-284). Covers:
///   * arithmetic shortfall when units match
///   * "verify" flag when units mismatch (treats on-hand as 0, conservative)
///   * pantry match by `food_id` first, then by lowercased name
///   * sort-order preservation
///   * edge cases that should produce no rows (empty ingredients, fully
///     covered, blank-name rows)
final class ShortfallCalculatorTests: XCTestCase {

    // MARK: - Helpers

    private func makeIngredient(
        id: String = UUID().uuidString,
        name: String,
        quantity: Double? = nil,
        unit: String? = nil,
        foodId: String? = nil,
        sortOrder: Int = 0
    ) -> RecipeIngredient {
        RecipeIngredient(
            id: id,
            recipeId: "r1",
            foodId: foodId,
            sortOrder: sortOrder,
            name: name,
            quantity: quantity,
            unit: unit,
            groupLabel: nil,
            optionalNotes: nil,
            createdAt: nil
        )
    }

    private func makeFood(
        id: String = UUID().uuidString,
        name: String,
        quantity: Double? = nil,
        unit: String? = nil
    ) -> Food {
        Food(
            id: id,
            userId: "u1",
            name: name,
            category: "other",
            isSafe: true,
            isTryBite: false,
            quantity: quantity,
            unit: unit
        )
    }

    private func makeRecipe(ingredients: [RecipeIngredient]) -> Recipe {
        var r = Recipe(
            id: "r1",
            userId: "u1",
            name: "Test Recipe",
            foodIds: []
        )
        r.ingredients = ingredients
        return r
    }

    // MARK: - Empty / no-op cases

    func testEmptyIngredientsReturnsEmpty() {
        let recipe = makeRecipe(ingredients: [])
        XCTAssertTrue(ShortfallCalculator.compute(recipe: recipe, pantry: []).isEmpty)
    }

    func testFullyCoveredIngredientProducesNoRow() {
        let ing = makeIngredient(name: "flour", quantity: 2, unit: "cup")
        let recipe = makeRecipe(ingredients: [ing])
        let pantry = [makeFood(name: "flour", quantity: 5, unit: "cup")]
        XCTAssertTrue(ShortfallCalculator.compute(recipe: recipe, pantry: pantry).isEmpty)
    }

    func testBlankNameIngredientIsSkipped() {
        let ing = makeIngredient(name: "   ", quantity: 1, unit: "cup")
        let recipe = makeRecipe(ingredients: [ing])
        XCTAssertTrue(ShortfallCalculator.compute(recipe: recipe, pantry: []).isEmpty)
    }

    // MARK: - Arithmetic shortfall (units match)

    func testArithmeticShortfallWhenUnitsMatch() {
        let ing = makeIngredient(name: "flour", quantity: 3, unit: "cup")
        let recipe = makeRecipe(ingredients: [ing])
        let pantry = [makeFood(name: "flour", quantity: 1, unit: "cup")]

        let result = ShortfallCalculator.compute(recipe: recipe, pantry: pantry)
        XCTAssertEqual(result.count, 1)
        let row = result[0]
        XCTAssertEqual(row.needed, 2, "3 needed - 1 on hand = 2 short")
        XCTAssertTrue(row.comparable)
        XCTAssertEqual(row.onHand, 1)
    }

    func testUnitNormalizationCaseInsensitive() {
        let ing = makeIngredient(name: "flour", quantity: 3, unit: "CUP ")
        let recipe = makeRecipe(ingredients: [ing])
        let pantry = [makeFood(name: "flour", quantity: 1, unit: "cup")]

        let result = ShortfallCalculator.compute(recipe: recipe, pantry: pantry)
        XCTAssertEqual(result.count, 1)
        XCTAssertTrue(result[0].comparable, "Unit normalization should treat 'CUP ' and 'cup' as equal")
        XCTAssertEqual(result[0].needed, 2)
    }

    // MARK: - Unit mismatch (conservative: comparable=false, onHand kept for display)

    func testUnitMismatchFlagsComparableFalse() {
        let ing = makeIngredient(name: "milk", quantity: 2, unit: "cup")
        let recipe = makeRecipe(ingredients: [ing])
        // Pantry has milk but in different unit ("oz" vs "cup")
        let pantry = [makeFood(name: "milk", quantity: 16, unit: "oz")]

        let result = ShortfallCalculator.compute(recipe: recipe, pantry: pantry)
        XCTAssertEqual(result.count, 1, "Mismatch should still surface a row")
        let row = result[0]
        XCTAssertFalse(row.comparable, "Unit mismatch must flag comparable=false")
        XCTAssertEqual(row.needed, 2, "Needed quantity unchanged when units mismatch (no subtraction)")
        XCTAssertEqual(row.onHand, 16, "On-hand surfaced for display even when not subtracted")
    }

    // MARK: - Pantry match strategy

    func testMatchByFoodIdTakesPrecedenceOverName() {
        let pantryFoodId = "food-uuid-1"
        let ing = makeIngredient(
            name: "tomato",
            quantity: 4,
            unit: "",
            foodId: pantryFoodId
        )
        let recipe = makeRecipe(ingredients: [ing])
        // Two pantry items: one matches by foodId (different name), the
        // other matches the ingredient name. foodId match should win.
        let pantry = [
            makeFood(id: pantryFoodId, name: "Roma tomato", quantity: 1, unit: ""),
            makeFood(name: "tomato", quantity: 99, unit: "")
        ]
        let result = ShortfallCalculator.compute(recipe: recipe, pantry: pantry)
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].matchedFood?.id, pantryFoodId)
        XCTAssertEqual(result[0].onHand, 1, "Should use foodId-matched pantry quantity, not the name match")
    }

    func testMatchByLowercasedNameWhenNoFoodId() {
        let ing = makeIngredient(name: "Onion", quantity: 3, unit: "")
        let recipe = makeRecipe(ingredients: [ing])
        let pantry = [makeFood(name: "onion", quantity: 1, unit: "")]

        let result = ShortfallCalculator.compute(recipe: recipe, pantry: pantry)
        XCTAssertEqual(result.count, 1)
        XCTAssertNotNil(result[0].matchedFood)
        XCTAssertTrue(result[0].comparable)
        XCTAssertEqual(result[0].needed, 2)
    }

    func testNoMatchTreatsAsFullyMissing() {
        let ing = makeIngredient(name: "saffron", quantity: 1, unit: "tsp")
        let recipe = makeRecipe(ingredients: [ing])
        let pantry = [makeFood(name: "salt", quantity: 1, unit: "tsp")]

        let result = ShortfallCalculator.compute(recipe: recipe, pantry: pantry)
        XCTAssertEqual(result.count, 1)
        XCTAssertNil(result[0].matchedFood)
        XCTAssertEqual(result[0].needed, 1, "No match -> full quantity is short")
        XCTAssertFalse(result[0].comparable)
    }

    // MARK: - Sort order

    func testRowsAreReturnedInSortOrder() {
        let ings = [
            makeIngredient(id: "c", name: "c-third", quantity: 1, unit: "", sortOrder: 2),
            makeIngredient(id: "a", name: "a-first", quantity: 1, unit: "", sortOrder: 0),
            makeIngredient(id: "b", name: "b-second", quantity: 1, unit: "", sortOrder: 1)
        ]
        let recipe = makeRecipe(ingredients: ings)
        let result = ShortfallCalculator.compute(recipe: recipe, pantry: [])
        XCTAssertEqual(result.map(\.id), ["a", "b", "c"])
    }

    // MARK: - Quantity defaulting

    func testIngredientWithoutQuantityDefaultsToOne() {
        let ing = makeIngredient(name: "lemon", quantity: nil, unit: nil)
        let recipe = makeRecipe(ingredients: [ing])
        let result = ShortfallCalculator.compute(recipe: recipe, pantry: [])
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result[0].needed, 1, "nil quantity falls back to 1 so the user still sees a row")
    }

    // MARK: - Mixed full set

    func testMixedScenarioOnlyShortRowsSurface() {
        let recipe = makeRecipe(ingredients: [
            makeIngredient(name: "flour", quantity: 2, unit: "cup", sortOrder: 0),  // covered
            makeIngredient(name: "eggs",  quantity: 4, unit: "",    sortOrder: 1),  // partially short
            makeIngredient(name: "vanilla", quantity: 1, unit: "tsp", sortOrder: 2) // missing entirely
        ])
        let pantry = [
            makeFood(name: "flour", quantity: 5, unit: "cup"),
            makeFood(name: "eggs",  quantity: 2, unit: "")
        ]
        let result = ShortfallCalculator.compute(recipe: recipe, pantry: pantry)
        XCTAssertEqual(result.count, 2, "Only short rows should appear")
        XCTAssertEqual(result.map(\.ingredient.name), ["eggs", "vanilla"])
        XCTAssertEqual(result[0].needed, 2)  // 4 needed - 2 on hand
        XCTAssertEqual(result[1].needed, 1)  // missing entirely
    }
}
