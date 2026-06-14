import Foundation

/// US-286 / US-351: Decides which pantry-debit strategy to use when a planned
/// meal is marked "made". Pulled out of `AppState.markPlanEntryMade` so the
/// branching + scaling logic is unit-testable without a Supabase round trip.
///
/// Branching rules:
///   * Recipe with structured `recipe_ingredients` (US-281): debit each linked
///     food by its serving-scaled, unit-converted quantity. iOS sends these
///     amounts to `rpc_mark_meal_made_v2` and mirrors them locally.
///   * Recipe with `food_ids` but no structured ingredients: legacy fallback —
///     debit each linked food by the serving scale. iOS persists these via
///     direct `deduct_food_quantity`.
///   * No recipe: no debits.
///
/// US-351: the debit amount now derives from `RecipeIngredient.quantity`
/// scaled by the planned serving count and converted into the pantry food's
/// unit via `UnitConverter`. When units are incompatible (e.g. cups vs count)
/// the raw scaled quantity is debited best-effort and the row is flagged so
/// the user can verify.
enum MealMadeStrategy {

    /// One pantry-debit instruction.
    struct Debit: Equatable {
        let foodId: String
        /// Serving-scaled, unit-converted quantity to remove from the pantry.
        let amount: Double
        /// Recipe-side ingredient name (for mismatch reporting). Empty on the
        /// legacy `food_ids` path.
        let name: String
        /// US-351: true when recipe & pantry units differed and weren't
        /// convertible — the amount is a best-effort debit to verify.
        let unitMismatch: Bool

        init(foodId: String, amount: Double, name: String = "", unitMismatch: Bool = false) {
            self.foodId = foodId
            self.amount = amount
            self.name = name
            self.unitMismatch = unitMismatch
        }
    }

    /// The decision output. `fallbackUsed` flags the legacy `food_ids`
    /// path for analytics + future migration tracking.
    struct Plan: Equatable {
        let debits: [Debit]
        let fallbackUsed: Bool
        /// True when the work belongs to the server v2 RPC (it applies the
        /// per-food amounts we pass). When false, the iOS layer is responsible
        /// for the actual database writes (legacy path).
        let serverHandlesDebits: Bool

        var decrementedCount: Int { debits.count }

        /// US-351: ingredient names debited best-effort because their unit
        /// couldn't be converted to the pantry food's unit.
        var mismatchedNames: [String] {
            debits.filter(\.unitMismatch).map(\.name).filter { !$0.isEmpty }
        }
    }

    /// Decide what to debit. `recipe == nil` produces an empty no-op plan.
    /// `pantry` supplies each linked food's unit for conversion; `servingScale`
    /// multiplies every ingredient quantity (1.0 = cook the recipe as written).
    static func plan(
        for recipe: Recipe?,
        pantry: [Food] = [],
        servingScale: Double = 1.0
    ) -> Plan {
        guard let recipe else {
            return Plan(debits: [], fallbackUsed: false, serverHandlesDebits: false)
        }

        // Path A: structured ingredients → serving-scaled, unit-converted debit.
        let structured = recipe.ingredients.compactMap { ing -> Debit? in
            guard let fid = ing.foodId, !fid.isEmpty else { return nil }
            let needed = (ing.quantity ?? 1) * servingScale
            let pantryUnit = pantry.first(where: { $0.id == fid })?.unit
            let (amount, mismatch) = resolveAmount(needed: needed, from: ing.unit, to: pantryUnit)
            return Debit(foodId: fid, amount: amount, name: ing.name, unitMismatch: mismatch)
        }
        if !structured.isEmpty {
            return Plan(
                debits: dedupe(structured),
                fallbackUsed: false,
                serverHandlesDebits: true
            )
        }

        // Path B: legacy food_ids fallback (no per-ingredient quantity → scale).
        let legacy = recipe.foodIds.map {
            Debit(foodId: $0, amount: servingScale, name: "", unitMismatch: false)
        }
        return Plan(
            debits: dedupe(legacy),
            fallbackUsed: !legacy.isEmpty,
            serverHandlesDebits: false
        )
    }

    /// US-351: resolve the debit amount + mismatch flag for one ingredient.
    /// Same/absent units debit directly; convertible units convert; otherwise
    /// best-effort raw + flagged.
    private static func resolveAmount(
        needed: Double,
        from recipeUnit: String?,
        to pantryUnit: String?
    ) -> (amount: Double, mismatch: Bool) {
        let r = recipeUnit?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let p = pantryUnit?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard let r, !r.isEmpty, let p, !p.isEmpty, r != p else {
            return (needed, false)
        }
        if let converted = UnitConverter.convert(needed, from: r, to: p) {
            return (converted, false)
        }
        return (needed, true)
    }

    /// A recipe can list the same food twice. Sum their (already pantry-unit)
    /// amounts so we debit the true total once. Mismatch flags OR together;
    /// the first name wins for reporting.
    private static func dedupe(_ debits: [Debit]) -> [Debit] {
        var order: [String] = []
        var merged: [String: Debit] = [:]
        for d in debits {
            if let existing = merged[d.foodId] {
                merged[d.foodId] = Debit(
                    foodId: d.foodId,
                    amount: existing.amount + d.amount,
                    name: existing.name.isEmpty ? d.name : existing.name,
                    unitMismatch: existing.unitMismatch || d.unitMismatch
                )
            } else {
                order.append(d.foodId)
                merged[d.foodId] = d
            }
        }
        return order.compactMap { merged[$0] }
    }
}
