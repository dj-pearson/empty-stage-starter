import Foundation

/// US-286: Decides which pantry-debit strategy to use when a planned meal
/// is marked "made". Pulled out of `AppState.markPlanEntryMade` so the
/// branching logic is unit-testable without a Supabase round trip.
///
/// Branching rules:
///   * Recipe with structured `recipe_ingredients` (US-281): use those.
///     This is the path the server RPC also walks — iOS just mirrors it
///     locally for the optimistic UI.
///   * Recipe with `food_ids` but no structured ingredients: legacy
///     fallback — debit each linked food by 1. iOS persists these via
///     direct `deduct_food_quantity` calls since `rpc_mark_meal_made`
///     ignores legacy recipes.
///   * No recipe (food-only plan entry): no debits — the server RPC
///     returns `no_recipe` and we treat that as a pure "result = ate" log.
///
/// Quantity is fixed at 1 per food in v1 (matches the existing server
/// RPC comment: "conservative — serving math is future polish"). US-287
/// will replace this with per-ingredient serving-scaled quantities.
enum MealMadeStrategy {

    /// One pantry-debit instruction.
    struct Debit: Equatable {
        let foodId: String
        let amount: Int
    }

    /// The decision output. `fallbackUsed` flags the legacy `food_ids`
    /// path for analytics + future migration tracking.
    struct Plan: Equatable {
        let debits: [Debit]
        let fallbackUsed: Bool
        /// True when the work belongs to the server RPC (it walks the
        /// recipe_ingredients table for us). When false, the iOS layer
        /// is responsible for the actual database writes.
        let serverHandlesDebits: Bool

        var decrementedCount: Int { debits.count }
    }

    /// Decide what to debit. `recipe == nil` is allowed and produces an
    /// empty no-op plan (the entry is food-only or a recipe that the
    /// client no longer has hydrated).
    static func plan(for recipe: Recipe?) -> Plan {
        guard let recipe else {
            return Plan(debits: [], fallbackUsed: false, serverHandlesDebits: false)
        }

        // Path A: structured ingredients → server RPC walks them; we
        // mirror locally with -1 per linked food.
        let structured = recipe.ingredients.compactMap { ing -> Debit? in
            guard let fid = ing.foodId, !fid.isEmpty else { return nil }
            return Debit(foodId: fid, amount: 1)
        }
        if !structured.isEmpty {
            return Plan(
                debits: dedupe(structured),
                fallbackUsed: false,
                serverHandlesDebits: true
            )
        }

        // Path B: legacy food_ids fallback. iOS persists each debit via
        // `deduct_food_quantity` since the server RPC skips legacy.
        let legacy = recipe.foodIds.map { Debit(foodId: $0, amount: 1) }
        return Plan(
            debits: dedupe(legacy),
            fallbackUsed: !legacy.isEmpty,
            serverHandlesDebits: false
        )
    }

    /// A recipe can list the same food twice (e.g. "1 cup flour" in
    /// two sections). Dedupe so we don't double-debit the same pantry
    /// row in a single mark-made.
    private static func dedupe(_ debits: [Debit]) -> [Debit] {
        var seen: Set<String> = []
        var out: [Debit] = []
        for d in debits where seen.insert(d.foodId).inserted {
            out.append(d)
        }
        return out
    }
}
