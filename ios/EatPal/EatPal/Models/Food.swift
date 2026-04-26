import Foundation

struct Food: Identifiable, Codable, Equatable {
    let id: String
    var userId: String
    var householdId: String?
    var name: String
    var category: String
    var isSafe: Bool
    var isTryBite: Bool
    var allergens: [String]?
    var barcode: String?
    var aisle: String?
    var quantity: Double?
    var unit: String?
    var servingsPerContainer: Double?
    var packageQuantity: String?
    /// US-230: ISO yyyy-MM-dd string matching the rest of the app's date
    /// vocabulary. nil means "no expiry tracked" — most pantry items.
    var expiryDate: String?
    /// US-243: optional per-unit price for budget tracking. nil means
    /// "untracked"; the budget views skip nil-priced foods rather than
    /// guess.
    var pricePerUnit: Double?
    /// US-243: ISO-4217 currency code (e.g. "USD"). Stored alongside the
    /// price so mixed-currency households don't see false totals.
    var currency: String?
    var createdAt: String?
    var updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case householdId = "household_id"
        case name, category
        case isSafe = "is_safe"
        case isTryBite = "is_try_bite"
        case allergens, barcode, aisle, quantity, unit
        case servingsPerContainer = "servings_per_container"
        case packageQuantity = "package_quantity"
        case expiryDate = "expiry_date"
        case pricePerUnit = "price_per_unit"
        case currency
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    mutating func apply(_ updates: FoodUpdate) {
        if let name = updates.name { self.name = name }
        if let category = updates.category { self.category = category }
        if let isSafe = updates.isSafe { self.isSafe = isSafe }
        if let isTryBite = updates.isTryBite { self.isTryBite = isTryBite }
        if let allergens = updates.allergens { self.allergens = allergens }
        if let barcode = updates.barcode { self.barcode = barcode }
        if let aisle = updates.aisle { self.aisle = aisle }
        if let quantity = updates.quantity { self.quantity = quantity }
        if let unit = updates.unit { self.unit = unit }
        if let expiryDate = updates.expiryDate { self.expiryDate = expiryDate }
        if let pricePerUnit = updates.pricePerUnit { self.pricePerUnit = pricePerUnit }
        if let currency = updates.currency { self.currency = currency }
    }

    /// US-243: total inventory value for this food = price × quantity.
    /// Returns nil when either is missing (most foods today).
    var inventoryValue: Double? {
        guard let price = pricePerUnit, let qty = quantity else { return nil }
        return price * qty
    }

    // MARK: - US-230 expiry helpers

    /// Days until this food expires, computed against the start of today.
    /// Negative when already expired, zero on the expiry day. Returns nil
    /// when no expiry was set or the stored string can't be parsed.
    var daysUntilExpiry: Int? {
        guard let raw = expiryDate,
              let date = DateFormatter.isoDate.date(from: raw) else { return nil }
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let target = calendar.startOfDay(for: date)
        return calendar.dateComponents([.day], from: today, to: target).day
    }

    var isExpired: Bool {
        (daysUntilExpiry ?? .max) < 0
    }

    /// True when expiring within `days` days (default 3) — drives the inline
    /// red-dot badge in the pantry list.
    func isExpiringSoon(within days: Int = 3) -> Bool {
        guard let remaining = daysUntilExpiry else { return false }
        return remaining >= 0 && remaining <= days
    }
}

struct FoodUpdate: Codable {
    var name: String?
    var category: String?
    var isSafe: Bool?
    var isTryBite: Bool?
    var allergens: [String]?
    var barcode: String?
    var aisle: String?
    var quantity: Double?
    var unit: String?
    var expiryDate: String?
    var pricePerUnit: Double?
    var currency: String?

    enum CodingKeys: String, CodingKey {
        case name, category
        case isSafe = "is_safe"
        case isTryBite = "is_try_bite"
        case allergens, barcode, aisle, quantity, unit
        case expiryDate = "expiry_date"
        case pricePerUnit = "price_per_unit"
        case currency
    }
}

enum FoodCategory: String, CaseIterable {
    case protein
    case carb
    case dairy
    case fruit
    case vegetable
    case snack

    var displayName: String {
        rawValue.capitalized
    }

    var icon: String {
        switch self {
        case .protein: return "🥩"
        case .carb: return "🍞"
        case .dairy: return "🥛"
        case .fruit: return "🍎"
        case .vegetable: return "🥦"
        case .snack: return "🍪"
        }
    }

    var color: String {
        switch self {
        case .protein: return "red"
        case .carb: return "orange"
        case .dairy: return "blue"
        case .fruit: return "pink"
        case .vegetable: return "green"
        case .snack: return "purple"
        }
    }
}
