import XCTest
@testable import EatPal

/// US-360: word-boundary ingredient matching (no raw-substring false positives).
final class IngredientNameMatcherTests: XCTestCase {

    func testQuantityUnitStrippedNameMatches() {
        XCTAssertTrue(
            IngredientNameMatcher.matches(foodName: "garlic", ingredientLine: "2 cloves garlic"),
            "'garlic' should match '2 cloves garlic'"
        )
    }

    func testShortNameDoesNotSubstringFalsePositive() {
        // The classic 3-char false positive: "oil" must NOT match "garlic" or
        // a word that merely contains "oil".
        XCTAssertFalse(
            IngredientNameMatcher.matches(foodName: "oil", ingredientLine: "2 cloves garlic"),
            "'oil' must not match '2 cloves garlic'"
        )
        XCTAssertFalse(
            IngredientNameMatcher.matches(foodName: "oil", ingredientLine: "1 lb broiled chicken"),
            "'oil' must not substring-match 'broiled'"
        )
    }

    func testRealOilMatchesWordBoundary() {
        XCTAssertTrue(
            IngredientNameMatcher.matches(foodName: "oil", ingredientLine: "1 tbsp olive oil"),
            "'oil' should match the whole word in 'olive oil'"
        )
    }

    func testMultiWordFoodName() {
        XCTAssertTrue(
            IngredientNameMatcher.matches(foodName: "olive oil", ingredientLine: "2 tbsp extra virgin olive oil"),
            "multi-word food name should match when all words are present"
        )
    }
}
