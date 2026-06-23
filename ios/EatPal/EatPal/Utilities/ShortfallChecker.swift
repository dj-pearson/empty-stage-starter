import Foundation

/// US-353: one shared "what am I missing for this/these recipe(s)" check used
/// by every plan-add path (single add, template apply, copy-week, copy-to-kid),
/// so the missing-ingredient prompt fires consistently instead of only from the
/// single-add flow.
///
/// AC3: legacy recipes with no structured `recipe_ingredients` (US-281) fall
/// back to `recipe.foodIds` — we synthesize one ingredient per linked food so
/// the same ShortfallCalculator path can score them.
/// AC5: `aggregate` merges shortfalls across many recipes (dedup by ingredient
/// name) so a batch op surfaces ONE sheet, not N.
enum ShortfallChecker {

    /// Shortfall rows for a single recipe against the pantry.
    static func shortfalls(for recipe: Recipe, pantry: [Food]) -> [ShortfallCalculator.Shortfall] {
        if !recipe.ingredients.isEmpty {
            return ShortfallCalculator.compute(recipe: recipe, pantry: pantry)
        }

        // AC3: legacy fallback — synthesize ingredients from foodIds so the
        // structured matcher can run. A food we can't name (not in the pantry
        // array at all) still gets a row keyed by its id.
        guard !recipe.foodIds.isEmpty else { return [] }
        let synthetic: [RecipeIngredient] = recipe.foodIds.enumerated().map { index, fid in
            let food = pantry.first(where: { $0.id == fid })
            return RecipeIngredient(
                id: "\(recipe.id)-\(fid)",
                recipeId: recipe.id,
                foodId: fid,
                sortOrder: index,
                name: food?.name ?? fid,
                quantity: 1,
                unit: food?.unit,
                groupLabel: nil,
                optionalNotes: nil,
                createdAt: nil
            )
        }
        var legacyRecipe = recipe
        legacyRecipe.ingredients = synthetic
        return ShortfallCalculator.compute(recipe: legacyRecipe, pantry: pantry)
    }

    /// AC5: aggregate shortfalls across several recipes into one list,
    /// deduped by case-insensitive ingredient name. Each retained row keeps
    /// its own `ingredient.recipeId`, so adding to grocery still links to the
    /// right source recipe.
    static func aggregate(recipes: [Recipe], pantry: [Food]) -> [ShortfallCalculator.Shortfall] {
        var seen = Set<String>()
        var out: [ShortfallCalculator.Shortfall] = []
        for recipe in recipes {
            for sf in shortfalls(for: recipe, pantry: pantry) {
                let key = sf.ingredient.name
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                    .lowercased()
                guard !key.isEmpty else { continue }
                if seen.insert(key).inserted {
                    out.append(sf)
                }
            }
        }
        return out
    }
}
