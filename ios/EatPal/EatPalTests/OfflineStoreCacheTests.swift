import XCTest
@testable import EatPal

/// US-383: cache writes must replace the prior snapshot so removed rows are
/// pruned (no unbounded growth, no duplicate-key failures on re-cache).
@MainActor
final class OfflineStoreCacheTests: XCTestCase {

    private func food(_ id: String, userId: String = "u1") -> Food {
        Food(id: id, userId: userId, name: "Food-\(id)", category: "snack", isSafe: true, isTryBite: false)
    }

    func testReCacheSmallerSetPrunesRemovedIds() {
        let store = OfflineStore.shared

        store.cacheFoods([food("a"), food("b"), food("c")])
        XCTAssertEqual(
            Set(store.loadCachedFoods(userId: "u1").map(\.id)),
            ["a", "b", "c"],
            "All cached ids should be present after the first cache"
        )

        // Re-cache a smaller set — the removed ids must be gone.
        store.cacheFoods([food("a")])
        XCTAssertEqual(
            Set(store.loadCachedFoods(userId: "u1").map(\.id)),
            ["a"],
            "Re-caching a smaller set must prune removed ids"
        )
    }

    func testReCacheExistingIdDoesNotDuplicateOrFail() {
        let store = OfflineStore.shared

        store.cacheFoods([food("x")])
        // Re-caching the same id must not silently fail the whole save or
        // leave duplicate rows behind.
        store.cacheFoods([food("x")])
        let ids = store.loadCachedFoods(userId: "u1").map(\.id)
        XCTAssertEqual(ids, ["x"], "Re-caching an existing id should leave exactly one row")
    }

    // MARK: - US-451: user-scoping + purge (cross-account leak prevention)

    func testCacheIsNotLeakedToADifferentUser() {
        let store = OfflineStore.shared
        store.purgeAllCachedEntities()

        // User A's data is cached (e.g. A was the last signed-in user).
        store.cacheFoods([food("a1", userId: "userA"), food("a2", userId: "userA")])

        // User B signs in offline: their load must NOT surface A's rows.
        XCTAssertTrue(
            store.loadCachedFoods(userId: "userB").isEmpty,
            "A different user must never hydrate another account's cached rows"
        )
        // A still sees their own data.
        XCTAssertEqual(
            Set(store.loadCachedFoods(userId: "userA").map(\.id)),
            ["a1", "a2"],
            "The owning user should still load their own cached rows"
        )
    }

    func testBlankUserIdFailsClosed() {
        let store = OfflineStore.shared
        store.purgeAllCachedEntities()
        store.cacheFoods([food("a1", userId: "userA")])

        XCTAssertTrue(
            store.loadCachedFoods(userId: "").isEmpty,
            "An empty userId (session unavailable) must return nothing, not another account's cache"
        )
    }

    func testCachePreservesQuantityUnitAisle() {
        let store = OfflineStore.shared
        store.purgeAllCachedEntities()

        var f = food("q1", userId: "u1")
        f.quantity = 3
        f.unit = "cups"
        f.aisle = "Baking"
        f.expiryDate = "2026-01-01"
        store.cacheFoods([f])

        let loaded = store.loadCachedFoods(userId: "u1").first
        XCTAssertEqual(loaded?.quantity, 3, "Offline cache must preserve quantity (drives mark-made debits)")
        XCTAssertEqual(loaded?.unit, "cups")
        XCTAssertEqual(loaded?.aisle, "Baking")
        XCTAssertEqual(loaded?.expiryDate, "2026-01-01")
    }

    func testPurgeWipesCacheAndPendingQueue() {
        let store = OfflineStore.shared

        store.cacheFoods([food("a"), food("b")])
        store.addPendingMutation(table: "foods", operation: "insert", entityId: "a")
        XCTAssertFalse(store.loadCachedFoods(userId: "u1").isEmpty)
        XCTAssertGreaterThan(store.pendingMutationCount, 0)

        store.purgeAllCachedEntities()

        XCTAssertTrue(
            store.loadCachedFoods(userId: "u1").isEmpty,
            "Purge must remove all cached rows (sign-out / delete-account)"
        )
        XCTAssertEqual(
            store.pendingMutationCount, 0,
            "Purge must also drain the pending-mutation queue"
        )
    }
}
