import XCTest
@testable import EatPal

/// US-583 / US-586 / US-587: regression tests for the recipe → grocery
/// quantity audit.
///
/// Each test names the behaviour that was WRONG before the audit so a
/// regression is immediately legible.
final class GroceryQuantityAuditTests: XCTestCase {

    private let accuracy = 0.01

    // MARK: - US-583: container units must resolve

    /// Before: `canonicalContainer` didn't exist and `canonical("cans")`
    /// returned nil, so the generator couldn't sum a unit with ITSELF.
    func testContainerPluralsResolveToCanonicalSingular() {
        let pairs: [(String, String)] = [
            ("cans", "can"), ("bags", "bag"), ("boxes", "box"), ("jars", "jar"),
            ("bottles", "bottle"), ("packs", "pack"), ("packages", "pack"),
            ("loaves", "loaf"), ("bunches", "bunch"), ("heads", "head"),
            ("cartons", "carton"), ("containers", "container"), ("tubs", "container"),
            ("sticks", "stick"), ("slices", "slice"), ("cloves", "clove"),
            ("servings", "serving"),
        ]
        for (plural, singular) in pairs {
            XCTAssertEqual(
                UnitConverter.canonicalContainer(plural), singular,
                "\(plural) should resolve to \(singular)"
            )
        }
    }

    func testContainerUnitsStillDoNotConvertAcrossNouns() {
        // A jar of jam genuinely isn't N bottles — this must stay nil.
        XCTAssertNil(UnitConverter.convert(1, from: "jar", to: "bottle"))
        XCTAssertNotEqual(
            UnitConverter.canonicalContainer("can"),
            UnitConverter.canonicalContainer("bag")
        )
    }

    func testHalfGallonNormalises() {
        let result = UnitConverter.convert(2, from: "½ gal", to: "gal")
        XCTAssertNotNil(result)
        XCTAssertEqual(result!, 1, accuracy: accuracy)
    }

    func testTrailingPeriodsAndCasingAreTolerated() {
        XCTAssertEqual(UnitConverter.canonical("Tbsp."), "tbsp")
        XCTAssertEqual(UnitConverter.canonical("LBS"), "lb")
    }

    // MARK: - US-586: unit-aware combination

    /// Before: `totalQuantity += qty` kept only the first unit seen, so
    /// 2 cup + 1 gal milk became the meaningless "3 cup".
    func testCombineConvertsAcrossCompatibleVolumeUnits() {
        let combined = UnitConverter.combine([
            (quantity: 2, unit: "cup"),
            (quantity: 1, unit: "gal"),
        ])
        XCTAssertNotNil(combined)
        // 2 cup = 473.18ml, 1 gal = 3785.41ml → 4258.59ml.
        // "cup" and "gal" tie on frequency, so the total lands in the first.
        let totalInMl = UnitConverter.convert(combined!.quantity, from: combined!.unit, to: "ml")
        XCTAssertNotNil(totalInMl)
        XCTAssertEqual(totalInMl!, 4258.59, accuracy: 1.0)
        XCTAssertNotEqual(combined!.quantity, 3, "must not be the old bare-number sum")
    }

    func testCombineMassUnits() {
        let combined = UnitConverter.combine([
            (quantity: 1, unit: "lb"),
            (quantity: 8, unit: "oz"),
        ])
        XCTAssertNotNil(combined)
        let grams = UnitConverter.convert(combined!.quantity, from: combined!.unit, to: "g")
        XCTAssertEqual(grams!, 680.39, accuracy: 1.0)
    }

    func testCombineSumsIdenticalContainerUnits() {
        let combined = UnitConverter.combine([
            (quantity: 2, unit: "cans"),
            (quantity: 1, unit: "can"),
        ])
        XCTAssertNotNil(combined, "two quantities of the same unit must be summable")
        XCTAssertEqual(combined!.quantity, 3, accuracy: accuracy)
        XCTAssertEqual(UnitConverter.canonicalContainer(combined!.unit), "can")
    }

    /// The safety property: genuinely incomparable parts return nil so the
    /// caller keeps them as separate grocery lines rather than inventing a sum.
    func testCombineRefusesIncomparableParts() {
        XCTAssertNil(UnitConverter.combine([
            (quantity: 2, unit: "cup"),
            (quantity: 1, unit: "bag"),
        ]))
        XCTAssertNil(UnitConverter.combine([
            (quantity: 1, unit: "can"),
            (quantity: 1, unit: "jar"),
        ]))
    }

    func testCombineSumsUnitlessQuantities() {
        let combined = UnitConverter.combine([
            (quantity: 2, unit: ""),
            (quantity: 3, unit: ""),
        ])
        XCTAssertNotNil(combined)
        XCTAssertEqual(combined!.quantity, 5, accuracy: accuracy)
    }

    func testCombineSinglePartPassesThrough() {
        let combined = UnitConverter.combine([(quantity: 1.5, unit: "lb")])
        XCTAssertEqual(combined?.quantity, 1.5)
        XCTAssertEqual(combined?.unit, "lb")
    }

    // MARK: - US-585: ingredient lines must survive their own commas

    /// Before: `RecipesView.applyParsed` joined imported ingredients with ", "
    /// while `RecipeIngredientLegacyParser` comma-splits whenever no newline is
    /// present — so "1 onion, diced" became an "onion" row plus a bogus
    /// "diced" row. The writer now joins with newlines.
    func testNewlineJoinedImportKeepsCommaDescriptorsAttached() {
        let blob = ["1 onion, diced", "2 cloves garlic, minced"].joined(separator: "\n")
        let rows = RecipeIngredientLegacyParser.parse(blob, recipeId: "r1")

        XCTAssertEqual(rows.count, 2, "newline-joined imports must not comma-split")
        XCTAssertEqual(rows[0].name.lowercased(), "onion")
        XCTAssertEqual(rows[0].quantity, 1)
        XCTAssertEqual(rows[1].name.lowercased(), "garlic")
        XCTAssertEqual(rows[1].quantity, 2)
        XCTAssertEqual(rows[1].unit, "clove")
    }

    /// The old comma-joined shape is what produced phantom items — pinned here
    /// so the difference is explicit and can't be reintroduced by accident.
    func testCommaJoinedImportIsTheBrokenShape() {
        let blob = ["1 onion, diced", "2 cloves garlic, minced"].joined(separator: ", ")
        let rows = RecipeIngredientLegacyParser.parse(blob, recipeId: "r1")
        XCTAssertGreaterThan(
            rows.count, 2,
            "comma joining tears descriptors into their own rows — this is why applyParsed now uses newlines"
        )
    }

    /// US-584: a quantity + unit must survive the import into structured rows,
    /// including for ingredients that also matched a pantry food.
    func testImportedLinesRetainQuantityAndUnit() {
        let blob = ["2 lbs chicken breast", "1 (14.5 oz) can diced tomatoes"]
            .joined(separator: "\n")
        let rows = RecipeIngredientLegacyParser.parse(blob, recipeId: "r1")

        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(rows[0].quantity, 2, "2 lbs must not degrade to 1 serving")
        XCTAssertEqual(rows[0].unit, "lb")
        XCTAssertEqual(rows[1].quantity, 1)
        XCTAssertEqual(rows[1].unit, "can")
    }
}
