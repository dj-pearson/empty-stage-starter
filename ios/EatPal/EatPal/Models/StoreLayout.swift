import Foundation

/// US-275: Per-chain aisle walk-order override. Mirrors the
/// `store_layouts` table — a community-shared document of "produce is
/// at the back of Trader Joe's, the front of Walmart" so the in-store
/// walking order matches the actual store the user is shopping at.
///
/// `aisleOverrides` is a sparse map: only the aisles whose order
/// differs from `GroceryAisle.storeWalkOrder` for this chain. The
/// resolver (`StoreLayoutService.walkOrder`) falls back to the
/// universal order for unmapped aisles.
struct StoreLayout: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var name: String
    var slug: String
    var bannerImageUrl: String?
    var aisleOverrides: [String: Int]
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, slug
        case bannerImageUrl = "banner_image_url"
        case aisleOverrides = "aisle_overrides"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

/// US-275: A user's per-aisle override inside a specific store. Wins
/// over the chain's `aisleOverrides` when sorting. Backed by the
/// `user_store_layout_overrides` table.
struct UserStoreLayoutOverride: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var userId: String
    var storeLayoutId: String
    var aisle: String
    var walkOrder: Int
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, aisle
        case userId = "user_id"
        case storeLayoutId = "store_layout_id"
        case walkOrder = "walk_order"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
