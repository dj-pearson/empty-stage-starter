import XCTest
@testable import EatPal

/// US-363: Tests for `UnitConverter` — the best-effort unit conversion used
/// when crediting bought groceries into the pantry. Covers:
///   * same-dimension conversions (volume, mass, count)
///   * alias / plural / abbreviation normalization
///   * identity (same unit passes through)
///   * non-convertible cases: cross-dimension, container units, unknown units
final class UnitConverterTests: XCTestCase {

    private let accuracy = 0.0001

    // MARK: - Volume

    func testGallonToFluidOunce() {
        // 1 US gallon == 128 fluid ounces.
        let result = UnitConverter.convert(2, from: "gal", to: "fl oz")
        XCTAssertNotNil(result)
        XCTAssertEqual(result!, 256, accuracy: 0.01)
    }

    func testCupToTablespoon() {
        // 1 cup == 16 tablespoons.
        let result = UnitConverter.convert(1, from: "cup", to: "tbsp")
        XCTAssertNotNil(result)
        XCTAssertEqual(result!, 16, accuracy: 0.001)
    }

    func testLiterToMilliliter() {
        XCTAssertEqual(UnitConverter.convert(1.5, from: "l", to: "ml")!, 1500, accuracy: accuracy)
    }

    // MARK: - Mass

    func testPoundToOunce() {
        // 1 lb == 16 oz (weight).
        XCTAssertEqual(UnitConverter.convert(1, from: "lb", to: "oz")!, 16, accuracy: 0.001)
    }

    func testKilogramToGram() {
        XCTAssertEqual(UnitConverter.convert(2, from: "kg", to: "g")!, 2000, accuracy: accuracy)
    }

    // MARK: - Count

    func testDozenToCount() {
        XCTAssertEqual(UnitConverter.convert(2, from: "dozen", to: "count")!, 24, accuracy: accuracy)
    }

    // MARK: - Identity

    func testSameUnitPassesThrough() {
        XCTAssertEqual(UnitConverter.convert(3.5, from: "lb", to: "lb")!, 3.5, accuracy: accuracy)
    }

    // MARK: - Aliases / plurals

    func testAliasNormalization() {
        XCTAssertEqual(UnitConverter.convert(1, from: "gallon", to: "fluid ounce")!, 128, accuracy: 0.01)
        XCTAssertEqual(UnitConverter.convert(1, from: "pounds", to: "ounces")!, 16, accuracy: 0.001)
        XCTAssertEqual(UnitConverter.convert(1, from: "Tablespoons", to: "tsp")!, 3, accuracy: 0.001)
    }

    func testCanonicalIsCaseAndWhitespaceInsensitive() {
        XCTAssertEqual(UnitConverter.canonical("  GAL "), "gal")
        XCTAssertEqual(UnitConverter.canonical("Lbs"), "lb")
        XCTAssertEqual(UnitConverter.canonical("each"), "count")
    }

    // MARK: - Non-convertible

    func testCrossDimensionReturnsNil() {
        // Volume → mass can't be known without density. Must not guess.
        XCTAssertNil(UnitConverter.convert(1, from: "gal", to: "oz"))
        XCTAssertNil(UnitConverter.convert(1, from: "lb", to: "cup"))
    }

    func testContainerUnitsReturnNil() {
        // pack/bag/box/can/jar/bottle/loaf/bunch carry no fixed size.
        XCTAssertNil(UnitConverter.convert(1, from: "pack", to: "count"))
        XCTAssertNil(UnitConverter.convert(1, from: "bag", to: "lb"))
        XCTAssertNil(UnitConverter.canonical("box"))
    }

    func testUnknownUnitReturnsNil() {
        XCTAssertNil(UnitConverter.convert(1, from: "blorps", to: "g"))
        XCTAssertNil(UnitConverter.convert(1, from: "", to: "g"))
    }

    // MARK: - Helpers

    func testDimensionAndCompatibility() {
        XCTAssertEqual(UnitConverter.dimension(of: "tbsp"), .volume)
        XCTAssertEqual(UnitConverter.dimension(of: "oz"), .mass)
        XCTAssertEqual(UnitConverter.dimension(of: "dozen"), .count)
        XCTAssertNil(UnitConverter.dimension(of: "jar"))

        XCTAssertTrue(UnitConverter.areCompatible("cup", "gal"))
        XCTAssertFalse(UnitConverter.areCompatible("cup", "lb"))
        XCTAssertFalse(UnitConverter.areCompatible("pack", "count"))
    }
}
