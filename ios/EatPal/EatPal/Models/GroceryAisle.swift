import Foundation

/// US-263: Grocery store aisle taxonomy.
///
/// 32 sections that mirror how shoppers actually walk a US grocery store:
/// produce, bakery, deli, frozen, pasta, ethnic, household, etc. Drives
/// section grouping in `GroceryView` and walk-order in `ShoppingModeView`.
///
/// Independent of `FoodCategory`, which still drives nutrition coloring.
/// `aisleSection` is the source of truth for grocery routing; `category`
/// stays in place for back-compat with FoodCategory consumers.
enum GroceryAisle: String, CaseIterable, Codable {

    // MARK: Perimeter (most stores enter here)
    case produce
    case bakery
    case bread
    case meatDeli = "meat_deli"
    case seafood
    case dairy
    case eggs
    case refrigerated

    // MARK: Frozen
    case frozenMeals = "frozen_meals"
    case frozenVeg = "frozen_veg"
    case frozenTreats = "frozen_treats"

    // MARK: Dry / packaged
    case canned
    case drySoups = "dry_soups"
    case pasta
    case riceGrains = "rice_grains"
    case condiments
    case baking
    case breakfast

    // MARK: Snacks
    case snacks
    case crackers
    case candy

    // MARK: Beverages
    case beverages
    case alcohol

    // MARK: Ethnic / international
    case ethnicMexican = "ethnic_mexican"
    case ethnicAsian = "ethnic_asian"
    case ethnicEuropean = "ethnic_european"

    // MARK: Non-food
    case household
    case paperGoods = "paper_goods"
    case cleaning
    case personalCare = "personal_care"
    case baby
    case pet

    // MARK: Catch-all
    case other

    // MARK: - Display

    var displayName: String {
        switch self {
        case .produce: return "Produce"
        case .bakery: return "Bakery"
        case .bread: return "Bread"
        case .meatDeli: return "Meat & Deli"
        case .seafood: return "Seafood"
        case .dairy: return "Dairy"
        case .eggs: return "Eggs"
        case .refrigerated: return "Refrigerated"
        case .frozenMeals: return "Frozen Meals"
        case .frozenVeg: return "Frozen Vegetables"
        case .frozenTreats: return "Frozen Treats"
        case .canned: return "Canned Goods"
        case .drySoups: return "Dry Soups & Mixes"
        case .pasta: return "Pasta"
        case .riceGrains: return "Rice & Grains"
        case .condiments: return "Condiments & Sauces"
        case .baking: return "Baking"
        case .breakfast: return "Breakfast"
        case .snacks: return "Snacks"
        case .crackers: return "Crackers"
        case .candy: return "Candy"
        case .beverages: return "Beverages"
        case .alcohol: return "Beer & Wine"
        case .ethnicMexican: return "Mexican"
        case .ethnicAsian: return "Asian"
        case .ethnicEuropean: return "European"
        case .household: return "Household"
        case .paperGoods: return "Paper Goods"
        case .cleaning: return "Cleaning"
        case .personalCare: return "Personal Care"
        case .baby: return "Baby"
        case .pet: return "Pet"
        case .other: return "Other"
        }
    }

    /// SF Symbol name. All chosen from iOS 16+ to match the app's deployment target.
    var icon: String {
        switch self {
        case .produce: return "leaf.fill"
        case .bakery: return "birthday.cake.fill"
        case .bread: return "fork.knife"
        case .meatDeli: return "fork.knife.circle.fill"
        case .seafood: return "fish.fill"
        case .dairy: return "drop.fill"
        case .eggs: return "oval.fill"
        case .refrigerated: return "thermometer.snowflake"
        case .frozenMeals: return "snowflake"
        case .frozenVeg: return "snowflake.circle"
        case .frozenTreats: return "snowflake.circle.fill"
        case .canned: return "cylinder.fill"
        case .drySoups: return "takeoutbag.and.cup.and.straw.fill"
        case .pasta: return "circle.dotted"
        case .riceGrains: return "circle.grid.3x3.fill"
        case .condiments: return "drop.circle.fill"
        case .baking: return "scalemass.fill"
        case .breakfast: return "sun.max.fill"
        case .snacks: return "bag.fill"
        case .crackers: return "square.grid.2x2.fill"
        case .candy: return "star.fill"
        case .beverages: return "cup.and.saucer.fill"
        case .alcohol: return "wineglass.fill"
        case .ethnicMexican: return "globe.americas.fill"
        case .ethnicAsian: return "globe.asia.australia.fill"
        case .ethnicEuropean: return "globe.europe.africa.fill"
        case .household: return "house.fill"
        case .paperGoods: return "doc.fill"
        case .cleaning: return "sparkles"
        case .personalCare: return "heart.fill"
        case .baby: return "figure.and.child.holdinghands"
        case .pet: return "pawprint.fill"
        case .other: return "shippingbox.fill"
        }
    }

    /// Asset/system color name. Maps to AppTheme.Colors via the
    /// `swiftUIColor` accessor below for consistent theming.
    var colorName: String {
        switch self {
        case .produce, .frozenVeg: return "green"
        case .bakery, .bread, .baking, .breakfast: return "orange"
        case .meatDeli, .seafood: return "red"
        case .dairy, .eggs, .refrigerated: return "blue"
        case .frozenMeals, .frozenTreats: return "cyan"
        case .canned, .drySoups, .pasta, .riceGrains: return "brown"
        case .condiments: return "yellow"
        case .snacks, .crackers, .candy: return "purple"
        case .beverages, .alcohol: return "indigo"
        case .ethnicMexican, .ethnicAsian, .ethnicEuropean: return "pink"
        case .household, .paperGoods, .cleaning: return "gray"
        case .personalCare, .baby, .pet: return "teal"
        case .other: return "secondary"
        }
    }

    // MARK: - Store walk order

    /// Lower numbers come first when sorting for in-store walking. Reflects
    /// a typical US supermarket layout: produce up front, frozen near the
    /// back, non-food on the wings, ethnic between dry and beverages.
    /// `ShoppingModeView` reads this to lay out the route.
    var storeWalkOrder: Int {
        switch self {
        // Perimeter, front of store
        case .produce: return 10
        case .bakery: return 20
        case .bread: return 25
        case .meatDeli: return 30
        case .seafood: return 35
        // Perimeter, back wall
        case .dairy: return 40
        case .eggs: return 45
        case .refrigerated: return 50
        // Frozen aisles
        case .frozenMeals: return 60
        case .frozenVeg: return 65
        case .frozenTreats: return 70
        // Center, dry / packaged
        case .breakfast: return 80
        case .pasta: return 90
        case .riceGrains: return 95
        case .canned: return 100
        case .drySoups: return 105
        case .baking: return 110
        case .condiments: return 115
        // Snacks block
        case .snacks: return 120
        case .crackers: return 125
        case .candy: return 130
        // Ethnic
        case .ethnicMexican: return 140
        case .ethnicAsian: return 145
        case .ethnicEuropean: return 150
        // Beverages
        case .beverages: return 160
        case .alcohol: return 165
        // Non-food wings
        case .household: return 180
        case .paperGoods: return 185
        case .cleaning: return 190
        case .personalCare: return 195
        case .baby: return 200
        case .pet: return 205
        // Catch-all last
        case .other: return 999
        }
    }

    // MARK: - Back-compat with FoodCategory

    /// Best-effort upcast from the legacy 6-bucket FoodCategory raw value
    /// to a 32-aisle assignment. Used by drag-drop and the meal-plan
    /// generator when all we know is the source food's FoodCategory.
    /// `snack` deliberately maps to `.snacks` rather than `.candy` so it
    /// covers the common case; users can override per item.
    static func fromLegacyCategory(_ raw: String) -> GroceryAisle {
        switch FoodCategory(rawValue: raw) {
        case .protein:   return .meatDeli
        case .carb:      return .pasta
        case .dairy:     return .dairy
        case .fruit:     return .produce
        case .vegetable: return .produce
        case .snack:     return .snacks
        case .none:      return .other
        }
    }

    /// Best-effort downcast to the legacy 6-bucket FoodCategory so that
    /// nutrition coloring + older consumers keep working when the user
    /// only sets an aisle. Used by AddGroceryItemView when picking the
    /// derived category for a freshly added item.
    var derivedFoodCategory: FoodCategory {
        switch self {
        case .produce, .frozenVeg:
            return .vegetable
        case .meatDeli, .seafood:
            return .protein
        case .dairy, .eggs, .refrigerated:
            return .dairy
        case .bakery, .bread, .pasta, .riceGrains, .baking, .breakfast, .canned, .drySoups, .frozenMeals:
            return .carb
        case .snacks, .crackers, .candy, .frozenTreats, .condiments:
            return .snack
        case .beverages, .alcohol, .ethnicMexican, .ethnicAsian, .ethnicEuropean,
             .household, .paperGoods, .cleaning, .personalCare, .baby, .pet, .other:
            return .snack
        }
    }
}

// MARK: - Sortable section helper

extension GroceryAisle: Comparable {
    static func < (lhs: GroceryAisle, rhs: GroceryAisle) -> Bool {
        lhs.storeWalkOrder < rhs.storeWalkOrder
    }
}
