import Foundation

/// US-461: cross-entity search shared by the global search surface.
///
/// Pure and view-agnostic so the matching rules live in one place (and can
/// be unit-tested) instead of being re-implemented per screen. Each entity
/// exposes its own `matches(...)` predicate; `run(...)` collapses the four
/// collections into grouped, capped, sorted results.
enum GlobalSearch {

    /// A planned-meal match carries the resolved display name (the linked
    /// food or recipe) alongside the entry so the row can render without
    /// re-resolving.
    struct PlanHit: Identifiable {
        let entry: PlanEntry
        let title: String
        var id: String { entry.id }
    }

    /// Grouped results. Empty groups are simply empty arrays so the view can
    /// render section-by-section with counts.
    struct Results {
        var foods: [Food] = []
        var recipes: [Recipe] = []
        var grocery: [GroceryItem] = []
        var plans: [PlanHit] = []

        var isEmpty: Bool {
            foods.isEmpty && recipes.isEmpty && grocery.isEmpty && plans.isEmpty
        }

        var total: Int {
            foods.count + recipes.count + grocery.count + plans.count
        }
    }

    // MARK: - Normalization

    /// Case- and diacritic-insensitive normalization so "jalapeno" matches
    /// "Jalapeño". Trimmed so trailing spaces don't suppress matches.
    static func normalize(_ s: String) -> String {
        s.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: .current)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func haystackContains(_ haystack: [String], _ normalizedQuery: String) -> Bool {
        guard !normalizedQuery.isEmpty else { return false }
        return haystack.contains { normalize($0).contains(normalizedQuery) }
    }

    // MARK: - Per-entity predicates

    static func matches(food: Food, query: String) -> Bool {
        haystackContains([food.name, food.category] + (food.allergens ?? []), normalize(query))
    }

    static func matches(recipe: Recipe, query: String) -> Bool {
        var hay = [recipe.name, recipe.description ?? "", recipe.category ?? ""]
        hay += recipe.tags ?? []
        hay += recipe.ingredients.map(\.name)
        return haystackContains(hay, normalize(query))
    }

    static func matches(grocery: GroceryItem, query: String) -> Bool {
        haystackContains(
            [grocery.name, grocery.category, grocery.aisle ?? "", grocery.notes ?? ""],
            normalize(query)
        )
    }

    // MARK: - Run

    /// Search every entity for `query`. `resolvePlanTitle` maps a plan entry
    /// to the linked food/recipe name — used both for matching and display.
    /// Results are sorted (name asc; plans by soonest date) and capped per
    /// group so a broad query can't render thousands of rows.
    static func run(
        query: String,
        foods: [Food],
        recipes: [Recipe],
        grocery: [GroceryItem],
        planEntries: [PlanEntry],
        resolvePlanTitle: (PlanEntry) -> String,
        limitPerGroup: Int = 25
    ) -> Results {
        let q = normalize(query)
        guard !q.isEmpty else { return Results() }

        var results = Results()

        results.foods = Array(
            foods
                .filter { haystackContains([$0.name, $0.category] + ($0.allergens ?? []), q) }
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                .prefix(limitPerGroup)
        )

        results.recipes = Array(
            recipes
                .filter { matches(recipe: $0, query: q) }
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                .prefix(limitPerGroup)
        )

        results.grocery = Array(
            grocery
                .filter { haystackContains([$0.name, $0.category, $0.aisle ?? "", $0.notes ?? ""], q) }
                .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                .prefix(limitPerGroup)
        )

        // Planned meals: dedupe family duplicates (same dish + date + slot)
        // so one scheduled dinner doesn't appear once per child.
        var seen = Set<String>()
        var planHits: [PlanHit] = []
        for entry in planEntries {
            let title = resolvePlanTitle(entry)
            guard haystackContains([title], q) else { continue }
            let key = "\(entry.recipeId ?? entry.foodId)|\(entry.date)|\(entry.mealSlot)"
            if !seen.insert(key).inserted { continue }
            planHits.append(PlanHit(entry: entry, title: title))
        }
        results.plans = Array(
            planHits
                .sorted { $0.entry.date < $1.entry.date }
                .prefix(limitPerGroup)
        )

        return results
    }
}
