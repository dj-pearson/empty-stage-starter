import Foundation

/// US-264: One link from a grocery item to the recipe / plan entry that
/// contributed to it. A single grocery item can have many sources — e.g.
/// chicken sourced from "Mon dinner: stir-fry" and "Wed lunch: salad".
///
/// The "By Recipe" view groups grocery items via these rows: every
/// recipe section pulls its items by `recipe_id`, items linked to two
/// or more recipes go in a synthetic "Shared" section, and items with
/// no source rows fall into "Manual additions".
struct GroceryItemSource: Identifiable, Codable, Equatable, Hashable {
    let id: String
    var groceryItemId: String
    /// Nil when the sourcing recipe was deleted (FK SET NULL) or the
    /// item came from a recipe-less plan entry.
    var recipeId: String?
    /// Nil when the sourcing plan entry was deleted or the item was
    /// added manually with a recipe tag but no specific meal slot.
    var planEntryId: String?
    /// ISO date string ("YYYY-MM-DD") matching plan_entries.date.
    var mealDate: String?
    /// Matches MealSlot.rawValue ("breakfast" / "lunch" / etc.).
    var mealSlot: String?
    /// Recipe-side ingredient quantity that was contributed to this
    /// grocery item. Lets the budget view attribute weekly cost back
    /// to the recipe that drove it.
    var contributedQuantity: Double?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case groceryItemId = "grocery_item_id"
        case recipeId = "recipe_id"
        case planEntryId = "plan_entry_id"
        case mealDate = "meal_date"
        case mealSlot = "meal_slot"
        case contributedQuantity = "contributed_quantity"
        case createdAt = "created_at"
    }

    static func new(
        groceryItemId: String,
        recipeId: String?,
        planEntryId: String?,
        mealDate: String?,
        mealSlot: String?,
        contributedQuantity: Double?
    ) -> GroceryItemSource {
        GroceryItemSource(
            id: UUID().uuidString,
            groceryItemId: groceryItemId,
            recipeId: recipeId,
            planEntryId: planEntryId,
            mealDate: mealDate,
            mealSlot: mealSlot,
            contributedQuantity: contributedQuantity,
            createdAt: nil
        )
    }
}
