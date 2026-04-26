import Foundation

/// US-243: Budget calculations + locale-aware currency formatting.
///
/// Pure-function helpers — no @Published state. The Budget tab observes
/// AppState directly and routes its arrays through these functions, so
/// the math is trivially testable and there's no shared mutable state to
/// reason about.
enum BudgetService {

    // MARK: - Totals

    /// Sum of (price × quantity) for every priced grocery item that is
    /// still on the list (i.e. unchecked). Returns 0.0 when nothing is
    /// priced — callers should also check `pricedItemCount` to decide
    /// whether to show a "soft-fail" empty state instead of $0.00.
    static func uncheckedGroceryTotal(_ items: [GroceryItem]) -> Double {
        items
            .filter { !$0.checked }
            .compactMap(\.lineTotal)
            .reduce(0, +)
    }

    /// Number of grocery items with a known price. Drives the
    /// "Add prices to N items to see your forecast" empty state.
    static func pricedGroceryCount(_ items: [GroceryItem]) -> Int {
        items.lazy.filter { $0.pricePerUnit != nil }.count
    }

    /// Sum of (price × quantity) across the pantry — what your fridge is
    /// worth on paper. Skips foods without pricing.
    static func pantryInventoryValue(_ foods: [Food]) -> Double {
        foods.compactMap(\.inventoryValue).reduce(0, +)
    }

    static func pricedFoodCount(_ foods: [Food]) -> Int {
        foods.lazy.filter { $0.pricePerUnit != nil }.count
    }

    // MARK: - Per-meal breakdown

    /// Estimated cost-per-meal across this week's planned entries.
    /// For each plan entry we look up the underlying Food's price (recipes
    /// don't carry a per-meal cost yet, so they're skipped). Granular
    /// enough to show the user "lunch is your most expensive meal".
    static func weeklyCostBySlot(
        weekStart: Date,
        kidIds: [String],
        planEntries: [PlanEntry],
        foods: [Food]
    ) -> [(slot: MealSlot, total: Double, mealCount: Int)] {
        let weekDates = Set(weekStart.weekDates.map(DateFormatter.isoDate.string(from:)))

        var bySlot: [String: (total: Double, count: Int)] = [:]
        for entry in planEntries
            where weekDates.contains(entry.date)
            && (kidIds.isEmpty || kidIds.contains(entry.kidId))
        {
            // Skip recipe-only entries — recipes don't carry priced
            // ingredients in the model yet. This is a follow-up.
            guard entry.recipeId == nil else { continue }
            guard let food = foods.first(where: { $0.id == entry.foodId }) else { continue }
            // Per-meal portion is one unit by convention; if/when we model
            // serving sizes per plan entry, multiply here.
            guard let price = food.pricePerUnit else { continue }
            var bucket = bySlot[entry.mealSlot] ?? (total: 0, count: 0)
            bucket.total += price
            bucket.count += 1
            bySlot[entry.mealSlot] = bucket
        }

        return MealSlot.allCases.compactMap { slot in
            guard let value = bySlot[slot.rawValue] else { return nil }
            return (slot: slot, total: value.total, mealCount: value.count)
        }
    }

    // MARK: - Currency

    /// Format a value using the device locale's currency, OR an explicit
    /// ISO code when the data carried one. Mixed-currency totals fall back
    /// to "—" since auto-conversion is out of scope (per AC: "no manual
    /// currency conversion").
    static func format(_ amount: Double, currency: String? = nil) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency ?? defaultCurrencyCode
        return formatter.string(from: NSNumber(value: amount))
            ?? String(format: "%.2f", amount)
    }

    /// Detect whether a list has a single agreed-upon currency. Returns
    /// nil when the list is empty OR mixes currencies, in which case the
    /// caller should display "Mixed currencies" instead of a fake total.
    static func dominantCurrency(_ items: [GroceryItem]) -> String? {
        let currencies = Set(items.compactMap(\.currency))
        return currencies.count == 1 ? currencies.first : nil
    }

    static func dominantCurrency(_ foods: [Food]) -> String? {
        let currencies = Set(foods.compactMap(\.currency))
        return currencies.count == 1 ? currencies.first : nil
    }

    /// User's locale-derived default — used for new items and as the
    /// formatter currency when no per-item override exists.
    static var defaultCurrencyCode: String {
        Locale.current.currency?.identifier ?? "USD"
    }
}
