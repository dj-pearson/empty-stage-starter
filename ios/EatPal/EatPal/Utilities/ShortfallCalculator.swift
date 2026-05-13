import Foundation

/// US-285: iOS parity for the web "missing ingredient" detector
/// (`src/lib/recipeShortfall.ts`, US-284).
///
/// Compares a recipe's structured ingredients (US-281, hydrated as
/// `Recipe.ingredients`) against the current pantry foods and returns one
/// row per ingredient the household doesn't have in sufficient quantity.
///
/// v1 unit handling matches the web behaviour and is intentionally
/// conservative: same unit string (case-insensitive, trimmed) on both sides
/// means arithmetic comparison; otherwise the row is flagged
/// `comparable = false` and on-hand is treated as zero so the user is
/// reminded to verify before submitting. The full unit-conversion layer
/// (US-287) will replace this with proper conversions.
///
/// Pantry-match strategy mirrors the web exactly:
///   1. If `ingredient.foodId` is set, look up by id.
///   2. Otherwise, lowercased trimmed name match against `Food.name`.
///   3. No match → "not in pantry" (entire quantity is short).
enum ShortfallCalculator {

    /// One row per missing ingredient. Identifiable for `ForEach` in the
    /// sheet — the underlying `RecipeIngredient.id` is stable, so the row
    /// id matches and SwiftUI animations don't reshuffle on re-compute.
    struct Shortfall: Identifiable, Equatable {
        var id: String { ingredient.id }
        let ingredient: RecipeIngredient
        /// Quantity the recipe needs. Defaults to 1 when the ingredient has
        /// no qty (so the user still gets a row instead of a silent skip).
        let needed: Double
        /// Recipe-side unit, normalized (trim + lowercase). nil when absent.
        let neededUnit: String?
        /// Quantity already on hand from the matched pantry food.
        let onHand: Double
        /// Pantry-side unit, normalized. nil when no match or no unit.
        let onHandUnit: String?
        /// Matched pantry food, or nil when nothing matched.
        let matchedFood: Food?
        /// True when on-hand was subtracted from needed (units matched).
        /// False when units mismatched or were absent — surface the row but
        /// flag "verify before adding".
        let comparable: Bool
    }

    /// Compute the shortfall list. Returns rows in `sortOrder` to match the
    /// recipe's display order, dropping ingredients that are fully covered.
    static func compute(recipe: Recipe, pantry: [Food]) -> [Shortfall] {
        let ingredients = recipe.ingredients
        guard !ingredients.isEmpty else { return [] }

        let sorted = ingredients.sorted { $0.sortOrder < $1.sortOrder }

        var rows: [Shortfall] = []
        rows.reserveCapacity(sorted.count)

        for ing in sorted {
            let name = ing.name.trimmingCharacters(in: .whitespacesAndNewlines)
            // Defensive — DB has NOT NULL on `name` but legacy rows may
            // be empty strings.
            guard !name.isEmpty else { continue }

            let needed: Double = {
                if let q = ing.quantity, q > 0 { return q }
                return 1
            }()
            let neededUnit = normalizeUnitTag(ing.unit)

            let matchedFood = matchPantry(ingredient: ing, name: name, pantry: pantry)

            guard let food = matchedFood else {
                rows.append(Shortfall(
                    ingredient: ing,
                    needed: needed,
                    neededUnit: neededUnit,
                    onHand: 0,
                    onHandUnit: nil,
                    matchedFood: nil,
                    comparable: false
                ))
                continue
            }

            let onHand = food.quantity ?? 0
            let onHandUnit = normalizeUnitTag(food.unit)
            let comparable = (neededUnit ?? "") == (onHandUnit ?? "")

            if !comparable {
                rows.append(Shortfall(
                    ingredient: ing,
                    needed: needed,
                    neededUnit: neededUnit,
                    onHand: onHand,
                    onHandUnit: onHandUnit,
                    matchedFood: food,
                    comparable: false
                ))
                continue
            }

            if onHand >= needed {
                continue
            }

            rows.append(Shortfall(
                ingredient: ing,
                needed: needed - onHand,
                neededUnit: neededUnit,
                onHand: onHand,
                onHandUnit: onHandUnit,
                matchedFood: food,
                comparable: true
            ))
        }

        return rows
    }

    private static func matchPantry(
        ingredient: RecipeIngredient,
        name: String,
        pantry: [Food]
    ) -> Food? {
        if let fid = ingredient.foodId,
           let byId = pantry.first(where: { $0.id == fid }) {
            return byId
        }
        let target = name.lowercased()
        return pantry.first { food in
            food.name.trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased() == target
        }
    }

    private static func normalizeUnitTag(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return trimmed.isEmpty ? nil : trimmed
    }
}
