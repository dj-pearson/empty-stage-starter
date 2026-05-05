import Foundation
@preconcurrency import Supabase

/// US-275: Loads and caches store layouts + per-user aisle overrides,
/// and exposes a single function (`walkOrder`) that takes a store
/// layout id and an aisle and returns the resolved walk-order int.
///
/// Resolution chain (high → low priority):
///  1. `user_store_layout_overrides` row keyed by (user, store, aisle)
///  2. `store_layouts.aisle_overrides[aisle]`
///  3. `GroceryAisle.storeWalkOrder`
///
/// Cached in memory after first load — the data is small (5-30 rows)
/// and changes rarely. Call `reload()` after a mutation to refresh.
@MainActor
final class StoreLayoutService: ObservableObject {
    static let shared = StoreLayoutService()

    @Published private(set) var layouts: [StoreLayout] = []
    @Published private(set) var userOverrides: [UserStoreLayoutOverride] = []

    private let client = SupabaseManager.client
    private var loaded = false

    private init() {}

    // MARK: - Load

    /// Loads layouts + per-user overrides. Idempotent — safe to call on
    /// every Settings open. The first call is the expensive one.
    func ensureLoaded() async {
        guard !loaded else { return }
        await reload()
    }

    func reload() async {
        async let layoutsFetch: [StoreLayout] = (try? await client
            .from("store_layouts")
            .select()
            .order("name", ascending: true)
            .execute()
            .value) ?? []
        async let overridesFetch: [UserStoreLayoutOverride] = (try? await client
            .from("user_store_layout_overrides")
            .select()
            .execute()
            .value) ?? []
        let (l, o) = await (layoutsFetch, overridesFetch)
        self.layouts = l
        self.userOverrides = o
        self.loaded = true
    }

    // MARK: - Resolve walk order

    /// Resolves the walk-order int for an aisle inside a given store
    /// layout. Returns the universal `storeWalkOrder` when no override
    /// applies — callers can sort indiscriminately by this single int.
    func walkOrder(for aisle: GroceryAisle, layoutId: String?) -> Int {
        guard let layoutId else { return aisle.storeWalkOrder }

        // Tier 1 — user override.
        if let override = userOverrides.first(where: {
            $0.storeLayoutId == layoutId && $0.aisle == aisle.rawValue
        }) {
            return override.walkOrder
        }

        // Tier 2 — chain-wide override.
        if let layout = layouts.first(where: { $0.id == layoutId }),
           let chainOrder = layout.aisleOverrides[aisle.rawValue] {
            return chainOrder
        }

        // Tier 3 — universal fallback.
        return aisle.storeWalkOrder
    }

    /// Convenience for the GroceryListSelector: layouts sorted by display
    /// name, but with the user's currently-selected layout pinned to the
    /// top so the picker is glanceable.
    func sortedLayouts(currentlySelected selectedId: String?) -> [StoreLayout] {
        layouts.sorted { lhs, rhs in
            if lhs.id == selectedId { return true }
            if rhs.id == selectedId { return false }
            return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
    }

    // MARK: - Mutations

    /// Persists a per-user aisle override. Upserts so the same aisle
    /// can be reordered repeatedly without producing duplicate rows.
    func setAisleOverride(layoutId: String, aisle: GroceryAisle, walkOrder: Int) async throws {
        struct Upsert: Encodable {
            let user_id: String
            let store_layout_id: String
            let aisle: String
            let walk_order: Int
        }
        let userId = try await currentUserId()
        let row = Upsert(
            user_id: userId,
            store_layout_id: layoutId,
            aisle: aisle.rawValue,
            walk_order: walkOrder
        )
        try await client
            .from("user_store_layout_overrides")
            .upsert(row, onConflict: "user_id,store_layout_id,aisle")
            .execute()
        await reload()
    }

    private func currentUserId() async throws -> String {
        let session = try await client.auth.session
        return session.user.id.uuidString.lowercased()
    }
}
