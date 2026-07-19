import XCTest
@testable import EatPal

/// US-380: Tests for the force-update gate's version comparison. The original
/// bug: CI stamps `CFBundleVersion` as a dotted date-build (`YYYYMMDD.<run>`),
/// but the gate parsed it with `Int(...) ?? 0`, collapsing every real build to
/// 0 so `0 < min_ios_build` gated *everyone* — including the latest build.
/// These pin the fixed behaviour: dotted builds compare component-wise, and
/// anything unparseable fails OPEN.
final class ForceUpdateServiceTests: XCTestCase {

    // MARK: - The regression: dotted date-build must NOT be gated

    func testDottedDateBuildAboveSeededMinimumIsNotGated() {
        // The exact production scenario: build "20260719.42", min_ios_build = 1.
        XCTAssertFalse(ForceUpdateService.isUpdateRequired(current: "20260719.42", minimum: "1"))
    }

    func testPlainIntegerBuildEqualToMinimumIsNotGated() {
        XCTAssertFalse(ForceUpdateService.isUpdateRequired(current: "1", minimum: "1"))
    }

    // MARK: - Component-wise ordering (Apple's CFBundleVersion semantics)

    func testOlderDateBuildBelowThresholdIsGated() {
        XCTAssertTrue(ForceUpdateService.isUpdateRequired(current: "20260719.42", minimum: "20260720.0"))
    }

    func testSameDayHigherRunIsNotGated() {
        XCTAssertFalse(ForceUpdateService.isUpdateRequired(current: "20260720.43", minimum: "20260720.0"))
    }

    func testSameDayLowerRunIsGated() {
        XCTAssertTrue(ForceUpdateService.isUpdateRequired(current: "20260720.5", minimum: "20260720.9"))
    }

    func testShorterVersionTreatsMissingFieldsAsZero() {
        // "20260720" == "20260720.0"
        XCTAssertFalse(ForceUpdateService.isUpdateRequired(current: "20260720", minimum: "20260720.0"))
        XCTAssertTrue(ForceUpdateService.isUpdateRequired(current: "20260720", minimum: "20260720.1"))
    }

    // MARK: - Fail-open (AC3): unparseable input never blocks the user

    func testEmptyCurrentBuildFailsOpen() {
        XCTAssertFalse(ForceUpdateService.isUpdateRequired(current: "", minimum: "1"))
    }

    func testNonNumericCurrentBuildFailsOpen() {
        XCTAssertFalse(ForceUpdateService.isUpdateRequired(current: "abc", minimum: "1"))
    }

    func testGarbageMinimumFailsOpen() {
        XCTAssertFalse(ForceUpdateService.isUpdateRequired(current: "20260719.42", minimum: "not-a-version"))
    }

    // MARK: - BuildVersion value semantics

    func testBuildVersionRejectsEmptyAndNonNumeric() {
        XCTAssertNil(BuildVersion(""))
        XCTAssertNil(BuildVersion("1.x"))
        XCTAssertNil(BuildVersion("."))
    }

    func testBuildVersionEqualityAcrossPadding() {
        XCTAssertFalse(BuildVersion("42")! < BuildVersion("42.0.0")!)
        XCTAssertFalse(BuildVersion("42.0.0")! < BuildVersion("42")!)
    }
}
