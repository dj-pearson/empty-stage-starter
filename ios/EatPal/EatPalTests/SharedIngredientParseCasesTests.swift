import XCTest
@testable import EatPal

/// US-590: the iOS half of the shared cross-platform parse contract.
///
/// Loads `tests/fixtures/ingredient-parse-cases.json` — the SAME file asserted
/// by `src/lib/parse-grocery-text.test.ts` — so the web and iOS ingredient
/// parsers cannot drift apart again. Before the audit they disagreed on ranges,
/// unicode fractions, parentheticals, filler words, word-form numbers and unit
/// spelling, which is why the same pasted recipe produced different quantities
/// on the two platforms.
///
/// Add cases to the fixture, not to this file.
final class SharedIngredientParseCasesTests: XCTestCase {

    private struct Fixture: Decodable {
        struct Case: Decodable {
            let input: String
            let quantity: Double
            let unit: String
            let name: String
            let was: String?
            let note: String?
        }
        let cases: [Case]
    }

    /// Repo root derived from this source file's location:
    /// `<root>/ios/EatPal/EatPalTests/ThisFile.swift` → up four levels.
    ///
    /// `#filePath` is used rather than a bundle resource so the fixture doesn't
    /// have to be copied into the test bundle (which would mean a project.yml
    /// `resources:` entry and a second source of truth for the path).
    private static var fixtureURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { url.deleteLastPathComponent() }
        return url
            .appendingPathComponent("tests")
            .appendingPathComponent("fixtures")
            .appendingPathComponent("ingredient-parse-cases.json")
    }

    private func loadFixture() throws -> Fixture {
        let url = Self.fixtureURL
        guard FileManager.default.fileExists(atPath: url.path) else {
            XCTFail("Shared fixture missing at \(url.path) — did tests/fixtures move?")
            throw XCTSkip("fixture not found")
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(Fixture.self, from: data)
    }

    /// Guards against a silently broken path resolving to an empty list, which
    /// would make every case below vacuously pass.
    func testFixtureLoadsAndIsNonEmpty() throws {
        let fixture = try loadFixture()
        XCTAssertGreaterThan(fixture.cases.count, 15)
    }

    func testEverySharedCaseParsesIdenticallyOnIOS() throws {
        let fixture = try loadFixture()

        for testCase in fixture.cases {
            let parsed = IngredientTextParser.parse(testCase.input)
            let context = testCase.was.map { " (was: \($0))" }
                ?? testCase.note.map { " — \($0)" }
                ?? ""
            let label = "\(testCase.input)\(context)"

            // A case with an expected quantity must produce one.
            XCTAssertEqual(
                parsed.quantity ?? 1, testCase.quantity, accuracy: 0.01,
                "quantity mismatch for \(label)"
            )

            // Units are canonicalised the same way the grocery path does, so
            // "gallon" → "gal" and "packages" → "pack" compare equal to the
            // fixture's canonical spelling.
            let rawUnit = parsed.unit ?? ""
            let unit = rawUnit.isEmpty
                ? ""
                : (UnitConverter.canonical(rawUnit)
                    ?? UnitConverter.canonicalContainer(rawUnit)
                    ?? rawUnit)
            XCTAssertEqual(unit, testCase.unit, "unit mismatch for \(label)")

            // Case-insensitive: the iOS grocery path title-cases for display
            // while the web parser preserves the input's casing.
            XCTAssertEqual(
                parsed.name.lowercased(),
                testCase.name.lowercased(),
                "name mismatch for \(label)"
            )
        }
    }
}
