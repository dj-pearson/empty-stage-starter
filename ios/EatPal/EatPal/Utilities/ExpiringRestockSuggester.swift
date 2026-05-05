import Foundation

/// US-280: Cross-references the user's pantry expiry dates with their
/// product preferences to surface "milk expires Friday — restock?"
/// chips in the grocery view.
///
/// A food makes the suggestion list when ALL of:
///   1. It has an `expiryDate` set and is within `windowDays` of expiring
///      (default 2).
///   2. It hasn't already expired (negative `daysUntilExpiry`) — a
///      separate "use it up" flow handles that case.
///   3. The user has a `user_product_preferences` row for it (so we
///      know they buy it again — random one-off pantry items don't
///      qualify).
///   4. It isn't already on the active grocery list, unchecked.
///
/// Pure Swift, no Supabase calls — the caller pre-loads the three
/// inputs.
enum ExpiringRestockSuggester {

    /// One expiring-restock candidate.
    struct Suggestion: Identifiable, Equatable, Hashable {
        let id: String              // foods.id, stable across renders
        let foodId: String
        let preferenceId: String?   // nil if the user removed prefs but kept food
        let name: String
        let aisleSection: GroceryAisle?
        let category: FoodCategory?
        /// Days until the food expires. Always >= 0 (we filter out
        /// already-expired in the suggester).
        let daysUntilExpiry: Int
        let preferredUnit: String?
        let preferredQuantity: Double?
    }

    /// Returns suggestions sorted by `daysUntilExpiry` ascending (most
    /// urgent first). Stable + cheap (linear over inputs) so the UI
    /// can call this on every pantry/grocery state change.
    ///
    /// - Parameters:
    ///   - foods: all pantry foods, with `expiryDate` populated.
    ///   - groceryItems: current grocery list — used to filter out
    ///     items already queued.
    ///   - preferences: smart-add preferences for this user/household.
    ///   - windowDays: how many days ahead counts as "expiring soon".
    static func suggestions(
        foods: [Food],
        groceryItems: [GroceryItem],
        preferences: [UserProductPreference],
        windowDays: Int = 2
    ) -> [Suggestion] {
        // Index preferences by normalized name so the cross-ref is O(n+m).
        var prefsByName: [String: UserProductPreference] = [:]
        for pref in preferences {
            prefsByName[pref.nameNormalized] = pref
        }

        // Names already on the unchecked grocery list — don't double-suggest.
        let onListNames: Set<String> = Set(
            groceryItems
                .filter { !$0.checked }
                .map { ProductNameNormalizer.normalize($0.name) }
        )

        var results: [Suggestion] = []
        for food in foods {
            guard let days = food.daysUntilExpiry else { continue }
            // Only "expiring soon", not already expired.
            guard days >= 0 && days <= windowDays else { continue }

            let normalized = ProductNameNormalizer.normalize(food.name)
            guard !onListNames.contains(normalized) else { continue }

            let pref = prefsByName[normalized]
            // Acceptance criterion: the user has bought this before.
            // Without a preference row we have no signal that they want
            // it again — skip.
            guard let pref else { continue }

            let aisle = pref.preferredAisleSection.flatMap(GroceryAisle.init(rawValue:))
            let category = pref.preferredCategory.flatMap(FoodCategory.init(rawValue:))

            results.append(
                Suggestion(
                    id: food.id,
                    foodId: food.id,
                    preferenceId: pref.id,
                    name: pref.name.isEmpty ? food.name : pref.name,
                    aisleSection: aisle,
                    category: category,
                    daysUntilExpiry: days,
                    preferredUnit: pref.preferredUnit,
                    preferredQuantity: pref.preferredQuantity
                )
            )
        }
        return results.sorted { $0.daysUntilExpiry < $1.daysUntilExpiry }
    }
}
