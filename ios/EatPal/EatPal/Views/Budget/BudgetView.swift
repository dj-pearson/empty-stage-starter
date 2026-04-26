import SwiftUI

/// US-243: Weekly spend forecast + per-meal breakdown + inventory value.
///
/// Lives under Settings → Preferences for now (no room on the bottom tab
/// bar). Soft-fails when too few items are priced — instead of showing
/// "$0.00" we point the user at the bulk-price flow.
struct BudgetView: View {
    @EnvironmentObject var appState: AppState

    /// US-243: Weekly target — UserDefaults so it survives app restarts
    /// and stays per-device for now (household-shared budget is a follow-up).
    @AppStorage("budget.weeklyTarget") private var weeklyTarget: Double = 0

    private var groceryTotal: Double {
        BudgetService.uncheckedGroceryTotal(appState.groceryItems)
    }

    private var pantryValue: Double {
        BudgetService.pantryInventoryValue(appState.foods)
    }

    private var pricedGroceryCount: Int {
        BudgetService.pricedGroceryCount(appState.groceryItems)
    }

    private var unpricedGroceryCount: Int {
        appState.groceryItems.lazy.filter { $0.pricePerUnit == nil }.count
    }

    private var groceryCurrency: String? {
        BudgetService.dominantCurrency(appState.groceryItems)
    }

    private var pantryCurrency: String? {
        BudgetService.dominantCurrency(appState.foods)
    }

    private var weekStart: Date {
        Date().weekDates.first ?? Date()
    }

    private var bySlot: [(slot: MealSlot, total: Double, mealCount: Int)] {
        let kidIds = appState.activeKidId.map { [$0] } ?? appState.kids.map(\.id)
        return BudgetService.weeklyCostBySlot(
            weekStart: weekStart,
            kidIds: kidIds,
            planEntries: appState.planEntries,
            foods: appState.foods
        )
    }

    var body: some View {
        Form {
            // Weekly forecast — primary number on the screen.
            forecastSection

            if weeklyTarget > 0 {
                targetProgressSection
            }

            targetSection

            if !bySlot.isEmpty {
                breakdownSection
            }

            inventorySection

            Section {
                Text("Prices stay on this device until you save them. EatPal never auto-converts currencies — mixed-currency lists are flagged so totals never lie.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Budget")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Sections

    @ViewBuilder
    private var forecastSection: some View {
        Section {
            if pricedGroceryCount < 3 {
                // Soft-fail empty state. 3 priced items is the threshold —
                // below that the forecast is too noisy to bother showing.
                emptyForecast
            } else {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("This week's grocery")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text(BudgetService.format(groceryTotal, currency: groceryCurrency))
                            .font(.title)
                            .fontWeight(.bold)
                            .monospacedDigit()
                    }
                    Spacer()
                    Image(systemName: "cart.fill")
                        .font(.title2)
                        .foregroundStyle(.green)
                }

                if unpricedGroceryCount > 0 {
                    Label(
                        "\(unpricedGroceryCount) item\(unpricedGroceryCount == 1 ? "" : "s") missing a price — total may be low.",
                        systemImage: "info.circle"
                    )
                    .font(.caption)
                    .foregroundStyle(.orange)
                }

                if groceryCurrency == nil && pricedGroceryCount > 0 {
                    Label("Mixed currencies — total uses your device's locale.", systemImage: "exclamationmark.triangle")
                        .font(.caption)
                        .foregroundStyle(.orange)
                }
            }
        } header: {
            Text("Weekly forecast")
        }
    }

    private var emptyForecast: some View {
        VStack(spacing: 10) {
            Image(systemName: "tag.slash")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text("Add prices to \(max(3 - pricedGroceryCount, 1)) more grocery item\(max(3 - pricedGroceryCount, 1) == 1 ? "" : "s") to see your weekly forecast.")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
    }

    private var targetProgressSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Target")
                    Spacer()
                    Text(BudgetService.format(weeklyTarget))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }

                ProgressView(
                    value: min(groceryTotal, weeklyTarget * 1.5),
                    total: weeklyTarget * 1.5
                )
                .tint(progressTint)

                Text(progressCopy)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text("Progress")
        }
    }

    private var targetSection: some View {
        Section {
            HStack {
                Text("Weekly target")
                Spacer()
                TextField("Optional", value: $weeklyTarget, format: .number.precision(.fractionLength(0...2)))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 100)
                    .monospacedDigit()
                Text(groceryCurrency ?? BudgetService.defaultCurrencyCode)
                    .foregroundStyle(.tertiary)
                    .font(.caption)
            }
            if weeklyTarget > 0 {
                Button("Clear target", role: .destructive) {
                    weeklyTarget = 0
                }
                .font(.callout)
            }
        } header: {
            Text("Set a weekly target")
        } footer: {
            Text("AIMealService will gently prefer cheaper meals when a target is set.")
                .font(.caption2)
        }
    }

    private var breakdownSection: some View {
        Section {
            ForEach(bySlot, id: \.slot) { row in
                HStack {
                    Image(systemName: row.slot.icon)
                        .foregroundStyle(.green)
                        .frame(width: 24)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.slot.displayName)
                            .font(.subheadline)
                        Text("\(row.mealCount) meal\(row.mealCount == 1 ? "" : "s") this week")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(BudgetService.format(row.total))
                        .monospacedDigit()
                        .font(.subheadline)
                        .fontWeight(.medium)
                }
            }
        } header: {
            Text("Per-meal breakdown")
        } footer: {
            Text("Meal-cost estimates use the food's per-unit price. Recipe-based meals don't yet contribute — coming soon.")
                .font(.caption2)
        }
    }

    private var inventorySection: some View {
        Section {
            HStack {
                Text("Pantry value")
                Spacer()
                if BudgetService.pricedFoodCount(appState.foods) > 0 {
                    Text(BudgetService.format(pantryValue, currency: pantryCurrency))
                        .monospacedDigit()
                        .fontWeight(.medium)
                } else {
                    Text("No prices set")
                        .foregroundStyle(.tertiary)
                        .font(.subheadline)
                }
            }

            if BudgetService.pricedFoodCount(appState.foods) > 0 {
                Text("Across \(BudgetService.pricedFoodCount(appState.foods)) priced food\(BudgetService.pricedFoodCount(appState.foods) == 1 ? "" : "s").")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text("Pantry inventory")
        }
    }

    // MARK: - Target progress copy

    private var progressTint: Color {
        if weeklyTarget == 0 { return .green }
        let ratio = groceryTotal / weeklyTarget
        if ratio >= 1.0 { return .red }
        if ratio >= 0.85 { return .orange }
        return .green
    }

    private var progressCopy: String {
        guard weeklyTarget > 0 else { return "" }
        let ratio = groceryTotal / weeklyTarget
        if ratio >= 1.0 {
            return "Over budget by " + BudgetService.format(groceryTotal - weeklyTarget, currency: groceryCurrency)
        }
        let remaining = weeklyTarget - groceryTotal
        return BudgetService.format(remaining, currency: groceryCurrency) + " remaining."
    }
}

#Preview {
    NavigationStack {
        BudgetView()
    }
    .environmentObject(AppState())
}
