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

    enum CodingKeys: String, CodingKey {
        case name, category
        case isSafe = "is_safe"
        case isTryBite = "is_try_bite"
        case allergens, barcode, aisle, quantity, unit
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
