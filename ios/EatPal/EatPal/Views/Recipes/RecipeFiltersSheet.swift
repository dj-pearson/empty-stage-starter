import SwiftUI

/// Modal that owns the full set of recipe filters. Reads/writes to a
/// `RecipeFilters` binding so the parent (`RecipesView`) keeps the
/// chip row in sync with whatever the user toggles here.
struct RecipeFiltersSheet: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject var appState: AppState

    @Binding var filters: RecipeFilters
    @State private var pantryFoodSearch: String = ""

    var body: some View {
        NavigationStack {
            Form {
                cookableSection
                cuisineSection
                difficultySection
                pantryFoodSection
                ingredientSection
                timeSection
            }
            .navigationTitle("Filter Recipes")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if filters.isAnyActive {
                        Button("Clear") {
                            HapticManager.lightImpact()
                            filters = RecipeFilters()
                        }
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    // MARK: - Sections

    private var cookableSection: some View {
        Section {
            Toggle(isOn: $filters.cookableOnly) {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Cookable now")
                        Text("Only show recipes you can mostly make from your pantry + grocery list.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "sparkles")
                }
            }
        }
    }

    private var cuisineSection: some View {
        Section("Cuisine") {
            FlowChips(
                items: Cuisine.allCases,
                isSelected: { filters.cuisines.contains($0) },
                title: { "\($0.emoji) \($0.displayName)" },
                onTap: { c in
                    HapticManager.selection()
                    if filters.cuisines.contains(c) { filters.cuisines.remove(c) }
                    else { filters.cuisines.insert(c) }
                }
            )
        }
    }

    private var difficultySection: some View {
        Section("Difficulty") {
            HStack(spacing: 8) {
                ForEach(["easy", "medium", "hard"], id: \.self) { level in
                    let icon: String = {
                        switch level {
                        case "easy": return "1.circle.fill"
                        case "medium": return "2.circle.fill"
                        default: return "3.circle.fill"
                        }
                    }()
                    CategoryChip(
                        title: "\(icon) \(level.capitalized)",
                        isSelected: filters.difficulty == level
                    ) {
                        HapticManager.selection()
                        filters.difficulty = filters.difficulty == level ? nil : level
                    }
                }
            }
        }
    }

    /// Multi-select pantry foods. The user picks every food they want
    /// the recipe to feature; the filter is OR within the picks (any
    /// match passes). Search box helps when the pantry gets long.
    private var pantryFoodSection: some View {
        Section {
            TextField("Search foods…", text: $pantryFoodSearch)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

            let visibleFoods = matchingFoods()
            if visibleFoods.isEmpty {
                Text(pantryFoodSearch.isEmpty
                    ? "Your pantry is empty."
                    : "No foods match \"\(pantryFoodSearch)\".")
                    .foregroundStyle(.secondary)
                    .font(.callout)
            } else {
                ForEach(visibleFoods) { food in
                    let isSel = filters.requiredFoodIds.contains(food.id)
                    Button {
                        HapticManager.selection()
                        if isSel { filters.requiredFoodIds.remove(food.id) }
                        else { filters.requiredFoodIds.insert(food.id) }
                    } label: {
                        HStack {
                            Image(systemName: isSel ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(isSel ? .green : .secondary)
                            Text(food.name)
                                .foregroundStyle(.primary)
                            Spacer()
                            Text(food.category.capitalized)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        } header: {
            HStack {
                Text("Must include food")
                Spacer()
                if !filters.requiredFoodIds.isEmpty {
                    Text("\(filters.requiredFoodIds.count) selected")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textCase(nil)
                }
            }
        } footer: {
            Text("Recipes that reference any of the selected foods — by linked food, structured ingredient, or ingredient text.")
        }
    }

    private var ingredientSection: some View {
        Section {
            TextField("e.g. pasta, chicken, basil", text: $filters.ingredientQuery)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
        } header: {
            Text("Ingredient text")
        } footer: {
            Text("Free-text match across the recipe name and every ingredient row.")
        }
    }

    private var timeSection: some View {
        Section {
            let bound: Int = filters.maxTotalMinutes ?? 60
            Toggle("Limit total time", isOn: Binding(
                get: { filters.maxTotalMinutes != nil },
                set: { on in
                    HapticManager.selection()
                    filters.maxTotalMinutes = on ? bound : nil
                }
            ))
            if let max = filters.maxTotalMinutes {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Up to \(max) min")
                        .font(.callout)
                    Slider(
                        value: Binding(
                            get: { Double(max) },
                            set: { filters.maxTotalMinutes = Int($0) }
                        ),
                        in: 10...180,
                        step: 5
                    )
                }
            }
        } header: {
            Text("Total time")
        } footer: {
            Text("Recipes without a recorded prep + cook time are hidden when this filter is on.")
        }
    }

    // MARK: - Helpers

    private func matchingFoods() -> [Food] {
        let q = pantryFoodSearch
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let foods = appState.foods.sorted { a, b in
            // Selected items float to the top so the user never loses
            // sight of what they already picked when typing in search.
            let aSel = filters.requiredFoodIds.contains(a.id)
            let bSel = filters.requiredFoodIds.contains(b.id)
            if aSel != bSel { return aSel }
            return a.name.localizedCaseInsensitiveCompare(b.name) == .orderedAscending
        }
        guard !q.isEmpty else { return foods }
        return foods.filter { $0.name.lowercased().contains(q) }
    }
}

// MARK: - FlowChips

/// Wrap-as-needed chip layout used by the cuisine grid. Vanilla
/// `HStack` would clip; using `LazyVGrid` columns get awkward when
/// chips are wildly different widths — so we hand-roll a flow with
/// `Layout`.
private struct FlowChips<Item: Identifiable & Hashable>: View {
    let items: [Item]
    let isSelected: (Item) -> Bool
    let title: (Item) -> String
    let onTap: (Item) -> Void

    var body: some View {
        WrappingFlowLayout(spacing: 8, lineSpacing: 8) {
            ForEach(items) { item in
                CategoryChip(
                    title: title(item),
                    isSelected: isSelected(item)
                ) {
                    onTap(item)
                }
            }
        }
    }
}

private struct WrappingFlowLayout: Layout {
    var spacing: CGFloat = 8
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var lineHeight: CGFloat = 0
        var totalWidth: CGFloat = 0

        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                y += lineHeight + lineSpacing
                x = 0
                lineHeight = 0
            }
            x += size.width + spacing
            totalWidth = max(totalWidth, x)
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: totalWidth, height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxWidth = bounds.width
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var lineHeight: CGFloat = 0

        for sub in subviews {
            let size = sub.sizeThatFits(.unspecified)
            if x + size.width > bounds.minX + maxWidth, x > bounds.minX {
                y += lineHeight + lineSpacing
                x = bounds.minX
                lineHeight = 0
            }
            sub.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: size.width, height: size.height))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
