import SwiftUI

/// US-285: iOS parity for the web "missing ingredients" dialog (US-284).
///
/// Surfaces a recipe's pantry shortfall after the user drops the recipe into
/// a plan slot, lets them tick which lines to add to grocery (default all
/// checked) and adjust each line's quantity, then bulk-inserts the chosen
/// items with `addedVia = "recipe"` + `sourceRecipeId` so future cross-module
/// flows (e.g. US-262 mark-meal-made auto-check) can find them.
struct MissingIngredientsSheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    let recipe: Recipe
    let shortfalls: [ShortfallCalculator.Shortfall]
    /// Called after a non-cancel exit so the parent can clear its
    /// `pendingShortfall` state. Receives the number of items added (0 if
    /// the user tapped Skip).
    let onFinish: (_ addedCount: Int) -> Void

    /// Mutable per-row state. Initialized once from `shortfalls` so SwiftUI
    /// doesn't reset edits when the parent re-renders.
    @State private var rows: [Row] = []
    @State private var isSubmitting = false

    private struct Row: Identifiable, Equatable {
        let id: String
        var include: Bool
        var quantity: Double
        let shortfall: ShortfallCalculator.Shortfall
    }

    private var selectedCount: Int {
        rows.lazy.filter(\.include).count
    }

    private var ctaLabel: String {
        if selectedCount == 0 { return "Skip" }
        return "Add \(selectedCount) to grocery"
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(recipe.name)
                        .font(.headline)
                    Text("You’re missing \(shortfalls.count) ingredient\(shortfalls.count == 1 ? "" : "s") for this recipe. Pick what to add to your grocery list.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Missing ingredients") {
                    ForEach($rows) { rowBinding in
                        rowView(rowBinding)
                    }
                }
            }
            .navigationTitle("Add to grocery?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Skip") {
                        onFinish(0)
                        dismiss()
                    }
                    .disabled(isSubmitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(ctaLabel) {
                        Task { await commit() }
                    }
                    .fontWeight(.semibold)
                    .disabled(isSubmitting || selectedCount == 0)
                }
            }
        }
        .onAppear {
            // Seed once. Re-renders shouldn't reset edits.
            if rows.isEmpty {
                rows = shortfalls.map { sf in
                    Row(
                        id: sf.id,
                        include: true,
                        quantity: sf.needed,
                        shortfall: sf
                    )
                }
                AnalyticsService.track(
                    .missingIngredientPromptShown(
                        missingCount: shortfalls.count,
                        totalCount: recipe.ingredients.count
                    )
                )
            }
        }
    }

    @ViewBuilder
    private func rowView(_ rowBinding: Binding<Row>) -> some View {
        let row = rowBinding.wrappedValue
        HStack(alignment: .top, spacing: 12) {
            Button {
                rowBinding.wrappedValue.include.toggle()
            } label: {
                Image(systemName: row.include ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(row.include ? Color.green : Color.secondary)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(row.include ? "Exclude \(row.shortfall.ingredient.name)" : "Include \(row.shortfall.ingredient.name)")

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(row.shortfall.ingredient.name)
                        .font(.subheadline)
                        .fontWeight(.medium)
                    if !row.shortfall.comparable {
                        Text("verify")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.orange.opacity(0.18), in: Capsule())
                            .foregroundStyle(.orange)
                            .accessibilityHint("Pantry stock uses a different unit — double-check before adding.")
                    }
                }
                Text(secondaryLine(row.shortfall))
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Stepper(
                    value: rowBinding.quantity,
                    in: 0.25...999,
                    step: stepSize(for: row.shortfall.neededUnit)
                ) {
                    Text(quantityLabel(qty: row.quantity, unit: row.shortfall.neededUnit))
                        .font(.caption.monospacedDigit())
                }
                .disabled(!row.include)
            }
        }
        .opacity(row.include ? 1 : 0.4)
        .padding(.vertical, 4)
    }

    private func secondaryLine(_ sf: ShortfallCalculator.Shortfall) -> String {
        if sf.matchedFood == nil {
            return "Not in your pantry"
        }
        let onHandStr = quantityLabel(qty: sf.onHand, unit: sf.onHandUnit)
        if !sf.comparable {
            return "Pantry has \(onHandStr) — unit mismatch"
        }
        return "Pantry has \(onHandStr); short by \(quantityLabel(qty: sf.needed, unit: sf.neededUnit))"
    }

    private func quantityLabel(qty: Double, unit: String?) -> String {
        let formatted: String
        if qty == qty.rounded() {
            formatted = String(Int(qty))
        } else {
            formatted = String(format: "%.2g", qty)
        }
        if let u = unit, !u.isEmpty { return "\(formatted) \(u)" }
        return formatted
    }

    /// Smaller step for fractional-unit ingredients (tsp/tbsp/cup) so the
    /// stepper isn't useless for spices and oils.
    private func stepSize(for unit: String?) -> Double {
        guard let u = unit?.lowercased() else { return 1 }
        switch u {
        case "tsp", "teaspoon", "teaspoons",
             "tbsp", "tablespoon", "tablespoons",
             "cup", "cups", "oz", "ounce", "ounces",
             "g", "gram", "grams", "ml":
            return 0.25
        default:
            return 1
        }
    }

    private func commit() async {
        guard !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }

        let chosen = rows.filter(\.include)
        guard !chosen.isEmpty else {
            onFinish(0)
            dismiss()
            return
        }

        var added = 0
        for row in chosen {
            let item = GroceryItem.fromShortfall(
                row.shortfall,
                quantity: row.quantity,
                sourceRecipeId: recipe.id
            )
            do {
                try await appState.addGroceryItem(item)
                added += 1
            } catch {
                // AppState already surfaces a toast — keep walking so the
                // user doesn't lose the rest of their selection to one
                // transient failure.
                continue
            }
        }

        AnalyticsService.track(.missingIngredientsAddedToGrocery(addedCount: added))

        if added > 0 {
            ToastManager.shared.success("Added \(added) to grocery")
        }
        onFinish(added)
        dismiss()
    }
}

// MARK: - GroceryItem factory

extension GroceryItem {
    /// US-285: Build a grocery row from a recipe shortfall. Stamps
    /// `addedVia: "recipe"` and `sourceRecipeId` so US-262 mark-made and
    /// other cross-module flows can find the link.
    static func fromShortfall(
        _ sf: ShortfallCalculator.Shortfall,
        quantity: Double,
        sourceRecipeId: String
    ) -> GroceryItem {
        let name = sf.ingredient.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let unit = sf.neededUnit ?? ""
        // Match pantry food's category when we have one — otherwise default
        // to "snack" (same fallback Tonight Mode uses) so the row still
        // satisfies the NOT NULL check on `category`.
        let category = sf.matchedFood?.category ?? "snack"
        let aisle = GroceryAisle.classify(name).rawValue

        return GroceryItem(
            id: UUID().uuidString,
            userId: "",
            householdId: nil,
            groceryListId: nil,
            name: name,
            category: category,
            quantity: quantity,
            unit: unit,
            checked: false,
            notes: nil,
            aisle: nil,
            photoUrl: nil,
            barcode: nil,
            brandPreference: nil,
            priority: nil,
            addedVia: "recipe",
            autoGenerated: false,
            pricePerUnit: nil,
            currency: nil,
            aisleSection: aisle,
            sourceRecipeId: sourceRecipeId,
            createdAt: nil,
            updatedAt: nil
        )
    }
}
