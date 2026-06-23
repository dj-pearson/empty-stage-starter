import XCTest
@testable import EatPal

/// US-359/US-402: recipe instruction → numbered steps.
final class RecipeStepParserTests: XCTestCase {

    func testNumberedLinesSplitIntoSteps() {
        let raw = "1. Preheat oven\n2. Mix flour\n3. Bake"
        XCTAssertEqual(RecipeStepParser.parse(raw), ["Preheat oven", "Mix flour", "Bake"])
    }

    func testSingleBlobStaysOneStep() {
        let raw = "Just mix everything together and serve"
        XCTAssertEqual(RecipeStepParser.parse(raw).count, 1)
    }

    func testDecimalsDoNotSplitMidStep() {
        // "1.5" must not be treated as a sentence boundary.
        let raw = "Add 1.5 cups of flour and stir well"
        XCTAssertEqual(RecipeStepParser.parse(raw).count, 1)
    }

    func testEmptyReturnsNoSteps() {
        XCTAssertTrue(RecipeStepParser.parse(nil).isEmpty)
        XCTAssertTrue(RecipeStepParser.parse("   ").isEmpty)
    }
}
