import XCTest
@testable import EatPal

/// US-383: cache writes must replace the prior snapshot so removed rows are
/// pruned (no unbounded growth, no duplicate-key failures on re-cache).
/// US-489: cache reads must be scoped to the account that wrote them so one
/// user's data can never surface for a different user on a shared device.
@MainActor
final class OfflineStoreCacheTests: XCTestCase {

    private func food(_ id: String) -> Food {
        Food(id: id, userId: "u1", name: "Food-\(id)", category: "snack", isSafe: true, isTryBite: false)
    }

    override func tearDown() {
        // Leave the shared store clean for other suites.
        OfflineStore.shared.clearCachedData()
        super.tearDown()
    }

    func testReCacheSmallerSetPrunesRemovedIds() {
        let store = OfflineStore.shared

        store.cacheFoods([food("a"), food("b"), food("c")], ownerUserId: "u1")
        XCTAssertEqual(
            Set(store.loadCachedFoods(userId: "u1").map(\.id)),
            ["a", "b", "c"],
            "All cached ids should be present after the first cache"
        )

        // Re-cache a smaller set — the removed ids must be gone.
        store.cacheFoods([food("a")], ownerUserId: "u1")
        XCTAssertEqual(
            Set(store.loadCachedFoods(userId: "u1").map(\.id)),
            ["a"],
            "Re-caching a smaller set must prune removed ids"
        )
    }

    func testReCacheExistingIdDoesNotDuplicateOrFail() {
        let store = OfflineStore.shared

        store.cacheFoods([food("x")], ownerUserId: "u1")
        // Re-caching the same id must not silently fail the whole save or
        // leave duplicate rows behind.
        store.cacheFoods([food("x")], ownerUserId: "u1")
        let ids = store.loadCachedFoods(userId: "u1").map(\.id)
        XCTAssertEqual(ids, ["x"], "Re-caching an existing id should leave exactly one row")
    }

    // MARK: - US-489: cross-account isolation

    /// A cache written by user u1 must NOT be readable by user u2 — the core
    /// of the cross-account disclosure fix. Without scoping, u2's offline load
    /// would surface u1's pantry / children's profiles.
    func testCacheIsNotReadableByADifferentUser() {
        let store = OfflineStore.shared

        store.cacheFoods([food("a"), food("b")], ownerUserId: "u1")

        XCTAssertEqual(
            Set(store.loadCachedFoods(userId: "u1").map(\.id)),
            ["a", "b"],
            "The owning user must still read their own cache"
        )
        XCTAssertTrue(
            store.loadCachedFoods(userId: "u2").isEmpty,
            "A different user must never read another account's cached rows"
        )
    }

    /// With no session (empty user id) the cache must read as empty rather
    /// than leaking whatever happens to be on disk.
    func testEmptyUserIdReadsNothing() {
        let store = OfflineStore.shared
        store.cacheFoods([food("a")], ownerUserId: "u1")
        XCTAssertTrue(
            store.loadCachedFoods(userId: "").isEmpty,
            "An empty (signed-out) user id must not load any cached rows"
        )
    }

    /// Sign-out wipes the display cache so it can't outlive the session.
    func testClearCachedDataWipesEverything() {
        let store = OfflineStore.shared
        store.cacheFoods([food("a")], ownerUserId: "u1")
        XCTAssertFalse(store.loadCachedFoods(userId: "u1").isEmpty)

        store.clearCachedData()
        XCTAssertTrue(
            store.loadCachedFoods(userId: "u1").isEmpty,
            "clearCachedData must remove all cached rows"
        )
    }
}
