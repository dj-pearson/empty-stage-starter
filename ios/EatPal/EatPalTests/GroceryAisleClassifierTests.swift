import XCTest
@testable import EatPal

/// US-454: `GroceryAisle.classify` used raw substring matching, so "oil"
/// matched "toilet"/"broil" and the bare "pepper" spice keyword swallowed
/// produce peppers. These tests pin the word-boundary fix and guard the
/// table's intentional stem/prefix keywords against regression.
final class GroceryAisleClassifierTests: XCTestCase {

    func testOilSubstringNoLongerMisclassifies() {
        XCTAssertEqual(GroceryAisle.classify("toilet paper"), .paperGoods)
        XCTAssertEqual(GroceryAisle.classify("broiled chicken"), .meatDeli)
    }

    func testOilStillMatchesRealOils() {
        XCTAssertEqual(GroceryAisle.classify("olive oil"), .condiments)
        XCTAssertEqual(GroceryAisle.classify("vegetable oil"), .condiments)
    }

    func testProducePeppersBeatSpicePepper() {
        XCTAssertEqual(GroceryAisle.classify("bell pepper"), .produce)
        XCTAssertEqual(GroceryAisle.classify("red pepper"), .produce)
        XCTAssertEqual(GroceryAisle.classify("green pepper"), .produce)
        XCTAssertEqual(GroceryAisle.classify("jalapeño"), .produce)
    }

    func testSpicePeppersStillClassifyAsCondiments() {
        XCTAssertEqual(GroceryAisle.classify("black pepper"), .condiments)
        XCTAssertEqual(GroceryAisle.classify("peppercorns"), .condiments)
        XCTAssertEqual(GroceryAisle.classify("red pepper flakes"), .condiments)
    }

    func testPluralEggsClassify() {
        XCTAssertEqual(GroceryAisle.classify("eggs"), .eggs)
        XCTAssertEqual(GroceryAisle.classify("large eggs"), .eggs)
        XCTAssertEqual(GroceryAisle.classify("a dozen eggs"), .eggs)
        // "eggplant" must NOT be pulled into the eggs aisle.
        XCTAssertEqual(GroceryAisle.classify("eggplant"), .produce)
    }

    func testStemAndTrailingSpaceKeywordsStillMatch() {
        // Left-boundary matching must keep prefix stems working.
        XCTAssertEqual(GroceryAisle.classify("anchovies"), .seafood)
        XCTAssertEqual(GroceryAisle.classify("strawberries"), .produce)
        XCTAssertEqual(GroceryAisle.classify("pasta salad"), .pasta)
    }
}
