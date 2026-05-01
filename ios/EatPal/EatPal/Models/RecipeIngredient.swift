import Foundation

/// US-265: One structured row per recipe ingredient.
///
/// Replaces the legacy `recipe.additional_ingredients` comma-split string.
/// Each row carries a name, optional quantity + unit, an optional link
/// back to a `Food` (so pantry debit + "what can I make" can find it),
/// and an optional group label like "For the sauce" so multi-section
/// recipes render in groups.
struct RecipeIngredient: Identifiable, Codable, Equatable, Hashable {
    let id: String
    var recipeId: String
    var foodId: String?
    /// Stable display order within the recipe. 0-based.
    /// (Stored as `sort_order` in Postgres — `position` is a SQL function
    /// name and trips some migration runners.)
    var sortOrder: Int
    var name: String
    var quantity: Double?
    var unit: String?
    /// Optional section header, e.g. "For the sauce" or "Garnish".
    var groupLabel: String?
    /// Free-text notes — "use room temperature", "or substitute X".
    var optionalNotes: String?
    var createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case recipeId = "recipe_id"
        case foodId = "food_id"
        case sortOrder = "sort_order"
        case name
        case quantity
        case unit
        case groupLabel = "group_label"
        case optionalNotes = "optional_notes"
        case createdAt = "created_at"
    }

    /// Convenience for new rows that haven't been persisted yet.
    static func new(
        recipeId: String,
        sortOrder: Int,
        name: String = "",
        foodId: String? = nil,
        quantity: Double? = nil,
        unit: String? = nil,
        groupLabel: String? = nil,
        optionalNotes: String? = nil
    ) -> RecipeIngredient {
        RecipeIngredient(
            id: UUID().uuidString,
            recipeId: recipeId,
            foodId: foodId,
            sortOrder: sortOrder,
            name: name,
            quantity: quantity,
            unit: unit,
            groupLabel: groupLabel,
            optionalNotes: optionalNotes,
            createdAt: nil
        )
    }
}

/// Subset of fields used for partial updates of an existing row.
struct RecipeIngredientUpdate: Codable {
    var foodId: String??
    var sortOrder: Int?
    var name: String?
    var quantity: Double??
    var unit: String??
    var groupLabel: String??
    var optionalNotes: String??

    enum CodingKeys: String, CodingKey {
        case foodId = "food_id"
        case sortOrder = "sort_order"
        case name
        case quantity
        case unit
        case groupLabel = "group_label"
        case optionalNotes = "optional_notes"
    }
}

/// Lazy-migrate a legacy `additional_ingredients` comma-separated string
/// into structured rows on first save in EditRecipeView.
///
/// Each split chunk is run through `IngredientTextParser` so that lines
/// like `"4 tablespoons vegetable oil"` produce a row with
/// `name = "vegetable oil"`, `quantity = 4`, `unit = "tbsp"` — instead
/// of the whole raw string landing in `name` and trickling through to
/// the grocery list as the displayed item.
enum RecipeIngredientLegacyParser {
    static func parse(
        _ legacy: String,
        recipeId: String,
        startingSortOrder: Int = 0
    ) -> [RecipeIngredient] {
        legacy
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .enumerated()
            .map { offset, raw in
                let parsed = IngredientTextParser.parse(raw)
                return RecipeIngredient.new(
                    recipeId: recipeId,
                    sortOrder: startingSortOrder + offset,
                    name: parsed.name,
                    quantity: parsed.quantity,
                    unit: parsed.unit
                )
            }
    }
}
