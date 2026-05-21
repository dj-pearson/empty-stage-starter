import XCTest
@testable import EatPal

/// US-255: Lock the conflict-detector contract — the realtime layer
/// relies on these exact behaviours to suppress own-write echoes while
/// still surfacing real household-mate conflicts.
@MainActor
final class ConflictDetectorTests: XCTestCase {

    override func setUp() async throws {
        try await super.setUp()
        await ConflictDetector.shared.reset()
    }

    override func tearDown() async throws {
        await ConflictDetector.shared.reset()
        try await super.tearDown()
    }

    // MARK: - Echo consumption

    func testRecordedLocalProducesOnePendingEcho() async {
        await ConflictDetector.shared.recordLocal(.groceryItems, rowId: "row-1")
        let firstEcho = await ConflictDetector.shared.consumeEcho(.groceryItems, rowId: "row-1")
        XCTAssertTrue(firstEcho, "First UPDATE after a local edit must be treated as the echo.")

        let secondEcho = await ConflictDetector.shared.consumeEcho(.groceryItems, rowId: "row-1")
        XCTAssertFalse(secondEcho, "Second UPDATE within the window has no pending echo to consume.")
    }

    func testRapidFireEditsQueueOneEchoEach() async {
        // Two quick writes in a row → two pending echoes → both consumed.
        await ConflictDetector.shared.recordLocal(.groceryItems, rowId: "row-2")
        await ConflictDetector.shared.recordLocal(.groceryItems, rowId: "row-2")
        let echo1 = await ConflictDetector.shared.consumeEcho(.groceryItems, rowId: "row-2")
        let echo2 = await ConflictDetector.shared.consumeEcho(.groceryItems, rowId: "row-2")
        let echo3 = await ConflictDetector.shared.consumeEcho(.groceryItems, rowId: "row-2")
        XCTAssertTrue(echo1)
        XCTAssertTrue(echo2)
        XCTAssertFalse(echo3, "Only two writes were issued; the third UPDATE is a real conflict.")
    }

    func testEchoExpiresAfterEchoWindow() async {
        let oldStamp = Date().addingTimeInterval(-(ConflictDetector.echoWindowSeconds + 1))
        await ConflictDetector.shared.recordLocal(.groceryItems, rowId: "row-3", at: oldStamp)
        let echo = await ConflictDetector.shared.consumeEcho(.groceryItems, rowId: "row-3")
        XCTAssertFalse(echo, "An UPDATE arriving outside the 2s echo window is treated as a real conflict.")
    }

    // MARK: - Conflict window

    func testWasRecentLocalEditTrueWithinFiveSeconds() async {
        let recent = Date().addingTimeInterval(-3)
        await ConflictDetector.shared.recordLocal(.planEntries, rowId: "plan-1", at: recent)
        let (isRecent, ageMs) = await ConflictDetector.shared.wasRecentLocalEdit(.planEntries, rowId: "plan-1")
        XCTAssertTrue(isRecent)
        XCTAssertNotNil(ageMs)
        XCTAssertGreaterThanOrEqual(ageMs ?? 0, 3000)
    }

    func testWasRecentLocalEditFalseOutsideWindow() async {
        let stale = Date().addingTimeInterval(-(ConflictDetector.conflictWindowSeconds + 1))
        await ConflictDetector.shared.recordLocal(.planEntries, rowId: "plan-2", at: stale)
        let (isRecent, _) = await ConflictDetector.shared.wasRecentLocalEdit(.planEntries, rowId: "plan-2")
        XCTAssertFalse(isRecent)
    }

    func testWasRecentLocalEditFalseWhenNeverEdited() async {
        let (isRecent, ageMs) = await ConflictDetector.shared.wasRecentLocalEdit(.planEntries, rowId: "never")
        XCTAssertFalse(isRecent)
        XCTAssertNil(ageMs)
    }

    // MARK: - Toast debounce

    func testFirstToastWithinWindowFires() async {
        await ConflictDetector.shared.recordLocal(.groceryItems, rowId: "row-4")
        let first = await ConflictDetector.shared.shouldFireToast(.groceryItems, rowId: "row-4")
        XCTAssertTrue(first)
    }

    func testRepeatToastWithinWindowSuppressed() async {
        await ConflictDetector.shared.recordLocal(.groceryItems, rowId: "row-5")
        _ = await ConflictDetector.shared.shouldFireToast(.groceryItems, rowId: "row-5")
        let second = await ConflictDetector.shared.shouldFireToast(.groceryItems, rowId: "row-5")
        XCTAssertFalse(second, "Per-row debounce must suppress repeat toasts inside the conflict window.")
    }

    // MARK: - Realistic flow

    func testOwnWriteThenRemoteConflictBehavesCorrectly() async {
        // 1. Local user writes — echo pending, recent edit stamped.
        await ConflictDetector.shared.recordLocal(.groceryItems, rowId: "shared")

        // 2. Realtime echo arrives → consumed, no conflict toast.
        let echoConsumed = await ConflictDetector.shared.consumeEcho(.groceryItems, rowId: "shared")
        XCTAssertTrue(echoConsumed)

        // 3. Household-mate's UPDATE arrives later within the 5s conflict
        //    window → no echo pending → wasRecentLocalEdit still true →
        //    toast should fire.
        let echoTwo = await ConflictDetector.shared.consumeEcho(.groceryItems, rowId: "shared")
        XCTAssertFalse(echoTwo)
        let (isRecent, _) = await ConflictDetector.shared.wasRecentLocalEdit(.groceryItems, rowId: "shared")
        XCTAssertTrue(isRecent)
        let canToast = await ConflictDetector.shared.shouldFireToast(.groceryItems, rowId: "shared")
        XCTAssertTrue(canToast)
    }
}
