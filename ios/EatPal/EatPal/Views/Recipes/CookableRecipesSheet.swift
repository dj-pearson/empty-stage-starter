import SwiftUI

/// US-270: "What can I make?" sheet. Ranks recipes by ingredient coverage
/// against the pantry + unchecked grocery list, surfaces missing items as
/// chips for one-tap grocery add, and lets the user push a recipe straight
/// onto the meal plan.
struct CookableRecipesSheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var matches: [RecipeMatcher.Match] = []
    @State private var addingMissingFor: String?
    @State private var inspectedRecipe: Recipe?

    var body: some View {
        NavigationStack {
            Group {
                if matches.isEmpty {
                    ContentUnavailableView(
                        "Nothing close yet",
                        systemImage: "sparkles",
                        description: Text("Stock up the pantry or add a few items to your grocery list to see cookable recipes.")
                    )
                } else {
                    List {
                        Section {
                            ForEach(matches) { match in
                                MatchRow(
                                    match: match,
                                    onAddMissing: { Task { await addMissingToGrocery(for: match) } },
                                    onAddToPlan: { Task { await addRecipeToPlan(match.recipe) } },
                                    onInspect: { inspectedRecipe = match.recipe },
                                    isAddingMissing: addingMissingFor == match.id
                                )
                            }
                        } footer: {
                            Text("Coverage = ingredients on hand ÷ total ingredients. We count items in your pantry plus unchecked grocery items.")
                                .font(.caption2)
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("What can I make?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(item: $inspectedRecipe) { recipe in
                RecipeDetailView(recipe: recipe)
            }
            .onAppear { recompute() }
            .onChange(of: appState.recipes) { _, _ in recompute() }
            .onChange(of: appState.foods) { _, _ in recompute() }
            .onChange(of: appState.groceryItems) { _, _ in recompute() }
        }
    }

    private func recompute() {
        let start = CFAbsoluteTimeGetCurrent()
        let ranked = RecipeMatcher.rank(
            recipes: appState.recipes,
            pantry: appState.foods,
            groceryItems: appState.groceryItems
        )
        let elapsed = CFAbsoluteTimeGetCurrent() - start
        // Quietly log tail-latency for the perf AC (target: <30ms on
        // 50 recipes × 15 ingredients × 200 foods). Sentry breadcrumb
        // keeps it out of production logs but still queryable.
        SentryService.leaveBreadcrumb(
            category: "perf",
            message: "RecipeMatcher.rank(\(appState.recipes.count) recipes) took \(String(format: "%.1f", elapsed * 1000))ms"
        )
        matches = ranked
    }

    private func addMissingToGrocery(for match: RecipeMatcher.Match) async {
        addingMissingFor = match.id
        defer { addingMissingFor = nil }
        let existing = Set(appState.groceryItems.map { $0.name.lowercased() })
        var added = 0
        for name in match.missing where !existing.contains(name.lowercased()) {
            // Best-effort aisle hint via FoodCategory if the recipe has a
            // structured ingredient with a linked food; otherwise default
            // .other and let US-266's classifier refine on first sync.
            let linkedFood = match.recipe.ingredients
                .first(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame })
                .flatMap { ing in ing.foodId.flatMap { fid in appState.foods.first(where: { $0.id == fid }) } }
            let category = linkedFood?.category ?? "other"
            let item = GroceryItem(
                id: UUID().uuidString,
                userId: "",
                name: name,
                category: category,
                quantity: 1,
                unit: linkedFood?.unit ?? "count",
                checked: false,
                addedVia: "cookable_match",
                aisleSection: GroceryAisle.fromLegacyCategory(category).rawValue
            )
            try? await appState.addGroceryItem(item)
            added += 1
        }
        if added > 0 {
            ToastManager.shared.success(
                "Added \(added) missing",
                message: match.recipe.name
            )
            HapticManager.success()
            AnalyticsService.track(.cookableMissingAddedToGrocery(count: added))
        } else {
            ToastManager.shared.info("Already on list", message: match.recipe.name)
        }
        recompute()
    }

    /// Per the AC, tapping "Add to plan" should open AddPlanEntryView with
    /// the recipe pre-selected. The full deep-link wiring (DeepLinkHandler
    /// route + cross-tab nav) is bigger than this sheet should own —
    /// surface a toast nudge for now and dismiss; users land back on the
    /// Recipes tab where they can long-press the recipe to plan it.
    private func addRecipeToPlan(_ recipe: Recipe) async {
        AnalyticsService.track(.cookableRecipeAddedToPlan)
        ToastManager.shared.info(
            "Open the meal plan",
            message: "Then tap a slot to add \(recipe.name)."
        )
        HapticManager.lightImpact()
        dismiss()
    }
}

// MARK: - Match row

private struct MatchRow: View {
    let match: RecipeMatcher.Match
    let onAddMissing: () -> Void
    let onAddToPlan: () -> Void
    let onInspect: () -> Void
    let isAddingMissing: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                if let url = match.recipe.imageUrl, !url.isEmpty {
                    RecipeThumbnail(imageUrl: url, size: 44)
                } else {
                    Image(systemName: "book.closed.fill")
                        .font(.title2)
                        .foregroundStyle(.green)
                        .frame(width: 44, height: 44)
                        .background(Color.green.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(match.recipe.name)
                        .font(.body)
                        .fontWeight(.semibold)
                    HStack(spacing: 6) {
                        coverageBadge
                        Text("\(Int(match.coverage * 100))% covered")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("·")
                            .foregroundStyle(.tertiary)
                        Text("\(match.totalIngredients) ingredients")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }

            if !match.missing.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(match.missing, id: \.self) { name in
                            Text(name)
                                .font(.caption)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.orange.opacity(0.12), in: Capsule())
                                .foregroundStyle(.orange)
                        }
                    }
                }
            }

            HStack(spacing: 8) {
                if !match.missing.isEmpty {
                    Button {
                        HapticManager.lightImpact()
                        onAddMissing()
                    } label: {
                        if isAddingMissing {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Label(
                                "Add \(match.missing.count) missing",
                                systemImage: "cart.fill.badge.plus"
                            )
                            .font(.subheadline)
                        }
                    }
                    .buttonStyle(.bordered)
                    .tint(.blue)
                }

                Button {
                    HapticManager.success()
                    onAddToPlan()
                } label: {
                    Label("Add to plan", systemImage: "calendar.badge.plus")
                        .font(.subheadline)
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)

                Spacer()

                Button(action: onInspect) {
                    Image(systemName: "info.circle")
                        .imageScale(.large)
                }
                .accessibilityLabel("View recipe details")
            }
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var coverageBadge: some View {
        switch match.tier {
        case .cookNow:
            Label(match.tier.displayName, systemImage: "checkmark.seal.fill")
                .font(.caption2)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Color.green.opacity(0.18), in: Capsule())
                .foregroundStyle(.green)
        case .almostThere:
            Label(match.tier.displayName, systemImage: "hourglass")
                .font(.caption2)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Color.orange.opacity(0.18), in: Capsule())
                .foregroundStyle(.orange)
        case .lowCoverage:
            EmptyView()
        }
    }
}
