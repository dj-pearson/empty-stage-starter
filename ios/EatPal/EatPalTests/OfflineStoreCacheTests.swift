import XCTest
@testable import EatPal

/// US-383: cache writes must replace the prior snapshot so removed rows are
/// pruned (no unbounded growth, no duplicate-key failures on re-cache).
@MainActor
final class OfflineStoreCacheTests: XCTestCase {

    private func food(_ id: String) -> Food {
        Food(id: id, userId: "u1", name: "Food-\(id)", category: "snack", isSafe: true, isTryBite: false)
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
}
