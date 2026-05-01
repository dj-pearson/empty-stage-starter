import Foundation

/// Composable filter state for the Recipes list. Holds every active
/// filter dimension; `apply(to:pantry:grocery:)` collapses an input
/// recipe collection down to the matching subset.
///
/// The single struct lets the chip row, the filter sheet, and the
/// "active filter" chip strip all read from one source of truth, and
/// makes "clear all" a single `= RecipeFilters()` assignment.
struct RecipeFilters: Equatable {

    /// `easy` / `medium` / `hard`. nil = no difficulty constraint.
    var difficulty: String?

    /// Multi-select of cuisines. Matched case-insensitively against
    /// `Recipe.tags` (substring) and `Recipe.category`. Empty = any.
    var cuisines: Set<Cuisine> = []

    /// Multi-select of pantry food IDs that the recipe must reference
    /// (either via `Recipe.foodIds` or by an ingredient row whose
    /// `foodId` matches, or by the food's name appearing in the
    /// ingredient names). Empty = any.
    var requiredFoodIds: Set<String> = []

    /// Free-text "must include" matched against all ingredient names
    /// (structured + legacy) and the recipe's name. Trimmed-empty = any.
    var ingredientQuery: String = ""

    /// When true, only show recipes RecipeMatcher classifies as
    /// `cookNow` or `almostThere` (>= 50% coverage from pantry +
    /// unchecked grocery items).
    var cookableOnly: Bool = false

    /// Max total time (prep + cook) in minutes. nil = any.
    var maxTotalMinutes: Int?

    // MARK: - Convenience

    /// True when any filter is active. Drives chip rendering and the
    /// "Clear filters" affordance in the sheet.
    var isAnyActive: Bool {
        difficulty != nil
            || !cuisines.isEmpty
            || !requiredFoodIds.isEmpty
            || !ingredientQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || cookableOnly
            || maxTotalMinutes != nil
    }

    /// Number of active filter dimensions (used in the "Filters (3)"
    /// button label so users know how many they've turned on).
    var activeCount: Int {
        var n = 0
        if difficulty != nil { n += 1 }
        if !cuisines.isEmpty { n += 1 }
        if !requiredFoodIds.isEmpty { n += 1 }
        if !ingredientQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { n += 1 }
        if cookableOnly { n += 1 }
        if maxTotalMinutes != nil { n += 1 }
        return n
    }

    // MARK: - Apply

    /// Filter `recipes` by the active criteria. Cookable evaluation
    /// requires the pantry + grocery state for ingredient coverage; the
    /// other dimensions are pure recipe-side checks.
    func apply(
        to recipes: [Recipe],
        pantry: [Food],
        grocery: [GroceryItem]
    ) -> [Recipe] {
        // Snapshot the cookable set once when needed so we don't run
        // RecipeMatcher per-row.
        let cookableIds: Set<String>? = cookableOnly
            ? Set(
                RecipeMatcher.rank(recipes: recipes, pantry: pantry, groceryItems: grocery)
                    .map { $0.recipe.id }
            )
            : nil

        // Pre-resolve the names of any selected pantry foods so we can
        // also match recipes whose ingredient rows aren't `food_id`-
        // linked (legacy imports), as long as the name shows up.
        let requiredFoodNames: Set<String> = Set(
            pantry
                .filter { requiredFoodIds.contains($0.id) }
                .map { $0.name.lowercased() }
        )

        let trimmedQuery = ingredientQuery
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()

        return recipes.filter { recipe in
            if let difficulty, recipe.difficultyLevel != difficulty { return false }

            if let max = maxTotalMinutes {
                let mins = recipe.resolvedTotalMinutes
                if let mins, mins > max { return false }
                // If we couldn't resolve a duration at all, drop it
                // from time-bounded results — better to exclude than
                // mislead.
                if mins == nil { return false }
            }

            if !cuisines.isEmpty {
                let haystack = (recipe.tags ?? []).map { $0.lowercased() }
                    + [recipe.category?.lowercased() ?? ""]
                let matches = cuisines.contains { c in
                    haystack.contains { tag in tag.contains(c.rawValue.lowercased()) }
                }
                if !matches { return false }
            }

            if !requiredFoodIds.isEmpty {
                let foodIdHits = !Set(recipe.foodIds).isDisjoint(with: requiredFoodIds)
                let ingredientFoodIdHits = recipe.ingredients.contains { ing in
                    if let fid = ing.foodId, requiredFoodIds.contains(fid) { return true }
                    return false
                }
                let nameHits = recipe.allIngredientText.contains { line in
                    requiredFoodNames.contains { name in line.contains(name) }
                }
                if !(foodIdHits || ingredientFoodIdHits || nameHits) { return false }
            }

            if !trimmedQuery.isEmpty {
                let nameHit = recipe.name.lowercased().contains(trimmedQuery)
                let ingredientHit = recipe.allIngredientText.contains { $0.contains(trimmedQuery) }
                if !(nameHit || ingredientHit) { return false }
            }

            if let cookableIds, !cookableIds.contains(recipe.id) { return false }

            return true
        }
    }
}

// MARK: - Cuisines

/// Curated cuisine list. Stored on `Recipe` either via `category` or
/// `tags`; the filter does case-insensitive substring matches against
/// both, so a tag of "italian" or "Italian Pasta" both classify here.
enum Cuisine: String, CaseIterable, Identifiable, Hashable {
    case italian
    case mexican
    case asian
    case chinese
    case japanese
    case thai
    case indian
    case mediterranean
    case greek
    case french
    case spanish
    case middleEastern = "middle eastern"
    case american
    case bbq
    case comfort
    case vegetarian
    case vegan
    case glutenFree = "gluten-free"
    case kidFriendly = "kid-friendly"
    case breakfast
    case dessert

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .italian: return "Italian"
        case .mexican: return "Mexican"
        case .asian: return "Asian"
        case .chinese: return "Chinese"
        case .japanese: return "Japanese"
        case .thai: return "Thai"
        case .indian: return "Indian"
        case .mediterranean: return "Mediterranean"
        case .greek: return "Greek"
        case .french: return "French"
        case .spanish: return "Spanish"
        case .middleEastern: return "Middle Eastern"
        case .american: return "American"
        case .bbq: return "BBQ"
        case .comfort: return "Comfort"
        case .vegetarian: return "Vegetarian"
        case .vegan: return "Vegan"
        case .glutenFree: return "Gluten-Free"
        case .kidFriendly: return "Kid-Friendly"
        case .breakfast: return "Breakfast"
        case .dessert: return "Dessert"
        }
    }

    var emoji: String {
        switch self {
        case .italian: return "🍝"
        case .mexican: return "🌮"
        case .asian, .chinese: return "🥢"
        case .japanese: return "🍣"
        case .thai: return "🍜"
        case .indian: return "🍛"
        case .mediterranean, .greek: return "🫒"
        case .french: return "🥖"
        case .spanish: return "🥘"
        case .middleEastern: return "🥙"
        case .american: return "🍔"
        case .bbq: return "🔥"
        case .comfort: return "🍲"
        case .vegetarian: return "🥗"
        case .vegan: return "🌱"
        case .glutenFree: return "🌾"
        case .kidFriendly: return "🧒"
        case .breakfast: return "🥞"
        case .dessert: return "🍰"
        }
    }
}

// MARK: - Recipe ingredient/time helpers

extension Recipe {

    /// All ingredient text — structured rows + legacy comma string +
    /// linked food names where resolvable — flattened to lowercased
    /// strings for substring searches. Computed on demand; the recipe
    /// list is short enough that we don't need a cache.
    fileprivate var allIngredientText: [String] {
        var lines: [String] = []
        for ing in ingredients {
            let name = ing.name.trimmingCharacters(in: .whitespacesAndNewlines)
            if !name.isEmpty { lines.append(name.lowercased()) }
        }
        if let extras = additionalIngredients {
            for raw in extras.split(separator: ",") {
                let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                if !t.isEmpty { lines.append(t.lowercased()) }
            }
        }
        return lines
    }

    /// Best-effort total time in minutes from the row's mixed-format
    /// `prepTime` / `cookTime` strings ("15", "20 min", "1 hr 5 min")
    /// or the canonical `totalTimeMinutes`.
    fileprivate var resolvedTotalMinutes: Int? {
        if let total = totalTimeMinutes { return total }
        let prep = parseDurationToMinutes(prepTime)
        let cook = parseDurationToMinutes(cookTime)
        if prep == nil && cook == nil { return nil }
        return (prep ?? 0) + (cook ?? 0)
    }
}

/// Parse a free-text duration like "20", "20 min", "1 hr", "1 hr 30 min"
/// into minutes. Returns nil for empty/unparseable strings.
private func parseDurationToMinutes(_ raw: String?) -> Int? {
    guard let raw = raw?.trimmingCharacters(in: .whitespacesAndNewlines),
          !raw.isEmpty else { return nil }
    let lowered = raw.lowercased()
    var minutes = 0
    var matchedAny = false

    // Hours: "1 hr", "2 hours", "1h"
    if let h = firstNumber(in: lowered, beforeAny: ["hr", "hour", "h"]) {
        minutes += h * 60
        matchedAny = true
    }
    // Minutes: "30 min", "30 minutes", "30m"
    if let m = firstNumber(in: lowered, beforeAny: ["min", "minute", "m"]) {
        minutes += m
        matchedAny = true
    }
    if matchedAny { return minutes }

    // Bare integer like "30" — assume minutes.
    if let n = Int(lowered) { return n }
    return nil
}

private func firstNumber(in s: String, beforeAny suffixes: [String]) -> Int? {
    for suffix in suffixes {
        guard let range = s.range(of: suffix) else { continue }
        let head = s[..<range.lowerBound]
        // Walk back over digits to capture the integer.
        var digits = ""
        for ch in head.reversed() {
            if ch.isNumber { digits.insert(ch, at: digits.startIndex) }
            else if !digits.isEmpty { break }
        }
        if let n = Int(digits) { return n }
    }
    return nil
}
