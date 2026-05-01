import Foundation

/// US-270: Score recipes by how many of their ingredients the user
/// already has — either in the pantry or on the unchecked grocery list.
/// Pure Swift, no edge-fn round-trip; runs over the in-memory AppState
/// arrays so it can power both an opt-in sheet and a passive empty-state
/// nudge in GroceryView.
///
/// Coverage = (in_pantry + in_grocery_unchecked) / total_ingredients
///   - >= 0.8 -> "Cook now" tier (green chip)
///   - 0.5 ..< 0.8 -> "Almost there" tier (orange chip)
///   - below 0.5 -> filtered out (too many missing ingredients to bother)
enum RecipeMatcher {

    /// Recipes ranked by ingredient coverage with a per-recipe missing
    /// list so the UI can offer one-tap "add 3 missing to grocery".
    struct Match: Identifiable {
        var id: String { recipe.id }
        var recipe: Recipe
        /// 0..1 — fraction of the recipe's ingredients we have on hand.
        var coverage: Double
        /// Subset of ingredients we have in the pantry (qty > 0 or count
        /// in the table). Each entry is the canonical display name.
        var inPantry: [String]
        /// Subset already on the grocery list, unchecked.
        var inGrocery: [String]
        /// Subset we don't have anywhere — surfaced as chips with one-tap
        /// add to grocery.
        var missing: [String]
        var totalIngredients: Int

        var tier: Tier {
            if coverage >= 0.8 { return .cookNow }
            if coverage >= 0.5 { return .almostThere }
            return .lowCoverage
        }
    }

    enum Tier: String {
        case cookNow
        case almostThere
        case lowCoverage

        var displayName: String {
            switch self {
            case .cookNow:     return "Cook now"
            case .almostThere: return "Almost there"
            case .lowCoverage: return "Low coverage"
            }
        }

        /// Minimum coverage threshold for the user-facing list. Lower
        /// tiers are filtered out before display.
        static var minimumDisplayedCoverage: Double { 0.5 }
    }

    /// Rank `recipes` by coverage against the supplied pantry + grocery
    /// list. Filters out recipes with no ingredients at all (so newly
    /// imported recipes that haven't been edited yet don't pollute the
    /// list with 0/0 coverage) and recipes below `minimumDisplayedCoverage`.
    static func rank(
        recipes: [Recipe],
        pantry: [Food],
        groceryItems: [GroceryItem]
    ) -> [Match] {
        // Build fast-lookup keys once. Pantry foods are present if their
        // quantity is > 0 OR if quantity is nil (legacy rows that pre-
        // date pricing — assume on-hand). Grocery items count only when
        // unchecked (checked = "already shopped, but maybe consumed").
        let pantryFoodIds = Set(
            pantry
                .filter { ($0.quantity ?? 1) > 0 }
                .map(\.id)
        )
        let pantryNameKeys = Set(
            pantry
                .filter { ($0.quantity ?? 1) > 0 }
                .map { canonicalize($0.name) }
        )
        let groceryNameKeys = Set(
            groceryItems
                .filter { !$0.checked }
                .map { canonicalize($0.name) }
        )

        var matches: [Match] = []
        matches.reserveCapacity(recipes.count)

        for recipe in recipes {
            let ingredients = collectIngredientCandidates(for: recipe)
            guard !ingredients.isEmpty else { continue }

            var inPantry: [String] = []
            var inGrocery: [String] = []
            var missing: [String] = []

            for candidate in ingredients {
                if let foodId = candidate.foodId, pantryFoodIds.contains(foodId) {
                    inPantry.append(candidate.displayName)
                } else if pantryNameKeys.contains(candidate.key) {
                    inPantry.append(candidate.displayName)
                } else if groceryNameKeys.contains(candidate.key) {
                    inGrocery.append(candidate.displayName)
                } else {
                    missing.append(candidate.displayName)
                }
            }

            let total = ingredients.count
            let covered = inPantry.count + inGrocery.count
            let coverage = total == 0 ? 0 : Double(covered) / Double(total)
            guard coverage >= Tier.minimumDisplayedCoverage else { continue }

            matches.append(Match(
                recipe: recipe,
                coverage: coverage,
                inPantry: inPantry,
                inGrocery: inGrocery,
                missing: missing,
                totalIngredients: total
            ))
        }

        // Sort by coverage desc, then by recipe name as the tiebreaker
        // so the order is stable across runs at the same data shape.
        return matches.sorted { lhs, rhs in
            if abs(lhs.coverage - rhs.coverage) < 0.001 {
                return lhs.recipe.name.localizedCaseInsensitiveCompare(rhs.recipe.name) == .orderedAscending
            }
            return lhs.coverage > rhs.coverage
        }
    }

    // MARK: - Ingredient enumeration

    private struct Candidate {
        var key: String
        var displayName: String
        var foodId: String?
    }

    /// Pull the canonical ingredient list for a recipe. Prefers
    /// structured rows (US-265) and falls back through linked foods +
    /// legacy comma string in that order.
    private static func collectIngredientCandidates(for recipe: Recipe) -> [Candidate] {
        if !recipe.ingredients.isEmpty {
            return recipe.ingredients.map { ing in
                Candidate(
                    key: canonicalize(ing.name),
                    displayName: ing.name.trimmingCharacters(in: .whitespacesAndNewlines),
                    foodId: ing.foodId
                )
            }
        }
        var fallback: [Candidate] = []
        for foodId in recipe.foodIds {
            // We don't have the Food name here without an injected pantry
            // lookup — return foodId as the key + a sentinel display name
            // that will get rendered by the matcher caller via name lookup
            // (see CookableRecipesSheet's denormalize step).
            fallback.append(Candidate(key: foodId, displayName: foodId, foodId: foodId))
        }
        if let extras = recipe.additionalIngredients, !extras.isEmpty {
            for raw in extras.split(separator: ",") {
                let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }
                fallback.append(Candidate(
                    key: canonicalize(trimmed),
                    displayName: trimmed,
                    foodId: nil
                ))
            }
        }
        return fallback
    }

    /// Lowercase + drop trailing 's' for naive plural matching. Good
    /// enough to merge "Apple" / "apples" / "Apples". Internationalization
    /// is out of scope for v1 — the AC is US-only foods.
    private static func canonicalize(_ s: String) -> String {
        let lowered = s.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard lowered.count > 3, lowered.hasSuffix("s") else { return lowered }
        return String(lowered.dropLast())
    }
}
