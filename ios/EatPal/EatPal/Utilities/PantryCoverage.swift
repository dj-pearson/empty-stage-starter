import SwiftUI

/// US-348: advisory, read-only pantry-coverage signal for a planned meal.
///
/// This is deliberately NON-destructive — computing coverage never decrements
/// `Food.quantity`. The real debit stays exclusively at mark-made
/// (`rpc_mark_meal_made`, US-262/US-286) so the planner can't diverge from the
/// server debit path or double-count. Product decision (US-348 AC6): plan-time
/// is advisory only; true ingredient reservation is out of scope.
enum PantryCoverage: Equatable {
    case fullyStocked
    case partiallyStocked
    case notStocked

    /// Compute coverage for a recipe against the current pantry. Returns nil
    /// when there's nothing to assess (no structured ingredients AND no
    /// legacy foodIds) so the UI shows no badge rather than a misleading
    /// "stocked".
    static func compute(recipe: Recipe, pantry: [Food]) -> PantryCoverage? {
        // Prefer structured ingredients (US-281) via the shared shortfall
        // calculator so coverage matches the MissingIngredientsSheet exactly.
        let namedIngredients = recipe.ingredients.filter {
            !$0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
        if !namedIngredients.isEmpty {
            let shortfalls = ShortfallCalculator.compute(recipe: recipe, pantry: pantry)
            if shortfalls.isEmpty { return .fullyStocked }
            if shortfalls.count >= namedIngredients.count { return .notStocked }
            return .partiallyStocked
        }

        // AC4: legacy recipes with no structured ingredients fall back to
        // recipe.foodIds; a food counts as on-hand when it exists with a
        // positive (or untracked) quantity.
        let foodIds = recipe.foodIds
        guard !foodIds.isEmpty else { return nil }
        let inStock = foodIds.filter { id in
            guard let food = pantry.first(where: { $0.id == id }) else { return false }
            // nil quantity means "untracked" — treat as available rather than
            // out, matching the pantry list's behaviour.
            return (food.quantity ?? 1) > 0
        }.count
        if inStock == foodIds.count { return .fullyStocked }
        if inStock == 0 { return .notStocked }
        return .partiallyStocked
    }

    var label: String {
        switch self {
        case .fullyStocked:     return "In stock"
        case .partiallyStocked: return "Low stock"
        case .notStocked:       return "Not stocked"
        }
    }

    var icon: String {
        switch self {
        case .fullyStocked:     return "checkmark.circle.fill"
        case .partiallyStocked: return "exclamationmark.triangle.fill"
        case .notStocked:       return "xmark.circle.fill"
        }
    }

    var color: Color {
        switch self {
        case .fullyStocked:     return .green
        case .partiallyStocked: return .orange
        case .notStocked:       return AppTheme.Colors.danger
        }
    }

    /// US-348 AC7: explicit VoiceOver description of the coverage state.
    var accessibilityLabel: String {
        switch self {
        case .fullyStocked:     return "Pantry coverage: fully stocked"
        case .partiallyStocked: return "Pantry coverage: partially stocked"
        case .notStocked:       return "Pantry coverage: not stocked"
        }
    }

    /// Tapping a partial/not-stocked badge should open the missing-ingredients
    /// sheet; a fully-stocked badge is informational only.
    var isActionable: Bool {
        self != .fullyStocked
    }
}
