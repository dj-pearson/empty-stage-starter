import XCTest
@testable import EatPal

/// AllergenMatcher is a port of supabase/functions/_shared/allergens.ts. The
/// expectations below are what matchingFoodAllergen returns for the same
/// inputs, so a drift between iOS and the web/edge check shows up here.
final class AllergenMatcherTests: XCTestCase {

    private func hit(_ kid: [String], name: String = "x", tags: [String] = []) -> String? {
        AllergenMatcher.matching(kidAllergens: kid, foodName: name, foodAllergens: tags)
    }

    /// Each pair read as safe under the old exact lowercase compare.
    func testSpellingVariantsMatch() {
        XCTAssertEqual(hit(["peanuts"], tags: ["Peanut"]), "peanut")
        XCTAssertEqual(hit(["tree nuts"], tags: ["en:tree-nuts"]), "tree nut")
        XCTAssertEqual(hit(["tree nuts"], tags: ["tree_nuts"]), "tree nut")
        XCTAssertEqual(hit(["milk"], tags: ["dairy"]), "milk")
        XCTAssertEqual(hit(["soy"], tags: ["en:soybeans"]), "soy")
        XCTAssertEqual(hit(["sesame"], tags: ["en:sesame-seeds"]), "sesame")
        XCTAssertEqual(hit(["wheat"], tags: ["gluten"]), "wheat")
        XCTAssertEqual(hit(["eggs"], tags: ["EGG"]), "egg")
    }

    func testFamiliesMatchOneWay() {
        XCTAssertEqual(hit(["tree nuts"], tags: ["almonds"]), "tree nut")
        XCTAssertNil(hit(["almond"], tags: ["tree nuts"]))
        XCTAssertNil(hit(["tree nuts"], tags: ["peanuts"]), "peanut is not a tree nut")
    }

    func testFoodNameIsScannedWhenTagsAreMissing() {
        XCTAssertEqual(hit(["peanuts"], name: "Peanut butter"), "peanut")
        XCTAssertEqual(hit(["tree nuts"], name: "Almond butter"), "tree nut")
        XCTAssertEqual(hit(["milk"], name: "Cheddar cheese"), "milk")
        XCTAssertEqual(hit(["kiwi"], name: "Kiwi slices"), "kiwi")
    }

    func testNameScanFalsePositivesStayClear() {
        XCTAssertNil(hit(["milk"], name: "Almond milk"))
        XCTAssertNil(hit(["milk"], name: "Dairy-free cheese"))
        XCTAssertNil(hit(["tree nuts"], name: "Butternut squash"))
        XCTAssertNil(hit(["tree nuts"], name: "Water chestnuts"))
        XCTAssertNil(hit(["eggs"], name: "Eggplant"))
        XCTAssertNil(hit(["fish"], name: "Goldfish crackers"))
    }

    func testNoKidAllergensNeverHits() {
        XCTAssertNil(hit([], name: "Peanut butter", tags: ["peanuts"]))
    }
}
