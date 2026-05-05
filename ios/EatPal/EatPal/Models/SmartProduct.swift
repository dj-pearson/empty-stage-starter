import Foundation

/// US-272: Centralized product catalog row. Mirrors the
/// `grocery_product_catalog` table — the community-shared source of
/// defaults that seeds a user's smart-add experience the first time
/// they encounter a product.
struct ProductCatalogEntry: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var name: String
    var nameNormalized: String
    var barcode: String?
    var defaultAisleSection: String?
    var defaultCategory: String?
    var defaultUnit: String?
    var defaultQuantity: Double?
    var brand: String?
    var packageSize: Double?
    var packageUnit: String?
    var timesAdded: Int
    var lastAddedAt: String?
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, barcode, brand
        case nameNormalized = "name_normalized"
        case defaultAisleSection = "default_aisle_section"
        case defaultCategory = "default_category"
        case defaultUnit = "default_unit"
        case defaultQuantity = "default_quantity"
        case packageSize = "package_size"
        case packageUnit = "package_unit"
        case timesAdded = "times_added"
        case lastAddedAt = "last_added_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

/// US-272: User-specific override row. Mirrors the
/// `user_product_preferences` table — the user's memory of what aisle
/// they put chicken nuggets in, what brand they actually buy, what
/// quantity they typically pick up. Wins over the catalog defaults.
struct UserProductPreference: Codable, Identifiable, Equatable, Hashable {
    let id: String
    var userId: String
    var catalogId: String?
    var name: String
    var nameNormalized: String
    var barcode: String?
    var preferredAisleSection: String?
    var preferredCategory: String?
    var preferredUnit: String?
    var preferredQuantity: Double?
    var preferredBrand: String?
    var notes: String?
    var timesAdded: Int
    var lastAddedAt: String?
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, name, barcode, notes
        case userId = "user_id"
        case catalogId = "catalog_id"
        case nameNormalized = "name_normalized"
        case preferredAisleSection = "preferred_aisle_section"
        case preferredCategory = "preferred_category"
        case preferredUnit = "preferred_unit"
        case preferredQuantity = "preferred_quantity"
        case preferredBrand = "preferred_brand"
        case timesAdded = "times_added"
        case lastAddedAt = "last_added_at"
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

/// US-272: A resolved product is the merged result of (user preference
/// → catalog → barcode lookup → keyword classifier). The `source` field
/// tells the UI how confident to be in the defaults — userPreference
/// pre-fills silently while keywordFallback shows a "Tap to confirm"
/// hint so the user knows we're guessing.
struct ResolvedProduct: Equatable {
    enum Source: String, Equatable {
        /// User has added this exact product before; their saved
        /// preferences are the source of truth.
        case userPreference
        /// No user preference yet, but the centralized catalog has
        /// defaults from other contributors.
        case catalog
        /// First time anywhere — Open Food Facts barcode lookup
        /// succeeded and provided a name + nutrition hints.
        case barcodeFresh
        /// Free-text classifier-based fallback. Lowest confidence.
        case keywordFallback
    }

    let name: String
    let aisleSection: GroceryAisle
    let category: FoodCategory
    let unit: String
    let quantity: Double
    let brand: String?
    let barcode: String?
    let notes: String?
    let source: Source

    /// True when the UI should highlight the pre-fill as "auto-detected"
    /// rather than silently inserting it. Anything weaker than the
    /// centralized catalog gets the soft-confirm treatment.
    var needsConfirmation: Bool {
        switch source {
        case .userPreference, .catalog: return false
        case .barcodeFresh, .keywordFallback: return true
        }
    }
}

/// US-272: Normalize a product name for exact-match lookup. Lowercases,
/// trims, and collapses internal whitespace so "  Chicken   Breast  "
/// and "chicken breast" hit the same row.
enum ProductNameNormalizer {
    static func normalize(_ raw: String) -> String {
        let lower = raw.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let parts = lower.split(whereSeparator: { $0.isWhitespace })
        return parts.joined(separator: " ")
    }
}
