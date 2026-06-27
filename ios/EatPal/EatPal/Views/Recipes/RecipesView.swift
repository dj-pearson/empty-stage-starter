import SwiftUI
import TipKit

struct RecipesView: View {
    @EnvironmentObject var appState: AppState
    @State private var searchText = ""
    @State private var selectedRecipe: Recipe?
    @State private var showingAddRecipe = false

    // US-272: full filter state. Replaces the single-difficulty pill;
    // search bar binds to `filters.ingredientQuery` so the chip strip
    // can show + clear it like any other filter.
    // US-463: persisted so the applied filter set survives navigating away
    // from Recipes (e.g. add-to-plan round-trips) and app relaunch.
    @AppStorage("recipes.filters") private var filters = RecipeFilters()
    @State private var showingFiltersSheet = false

    // US-269: bulk-select mode for recipes.
    @State private var isSelecting = false
    @State private var selectedIds: Set<String> = []
    @State private var showingBulkDeleteConfirm = false

    // US-270: cookable-recipes sheet entry.
    @State private var showingCookable = false

    // US-469: recipe whose missing-ingredients sheet is open (from a tapped
    // coverage badge).
    @State private var coverageSheetRecipe: Recipe?

    private var swipeTip = SwipeRecipeTip()

    /// US-469: per-recipe pantry coverage, computed once per render via the
    /// same RecipeMatcher used by the Cookable filter. Recipes below the
    /// matcher's display threshold (or with no ingredients) are absent — they
    /// simply show no badge. Reactive to foods/grocery changes.
    private var coverageByRecipe: [String: RecipeMatcher.Match] {
        Dictionary(
            RecipeMatcher.rank(
                recipes: appState.recipes,
                pantry: appState.foods,
                groceryItems: appState.groceryItems
            ).map { ($0.recipe.id, $0) },
            uniquingKeysWith: { first, _ in first }
        )
    }

    /// Cuisines surfaced inline in the chip row. The full list lives in
    /// the filter sheet; this is just the top-of-mind set so people can
    /// one-tap into "Italian" without opening a sheet.
    private let inlineCuisines: [Cuisine] = [
        .italian, .mexican, .asian, .american, .mediterranean, .indian
    ]

    private var filteredRecipes: [Recipe] {
        // Fold the search bar text into the filter's ingredient query
        // before applying — keeps a single code path for "what counts
        // as a match" so chip-strip removals + searchable both work the
        // same way.
        var working = filters
        let trimmed = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty, working.ingredientQuery.isEmpty {
            working.ingredientQuery = trimmed
        }
        return working.apply(
            to: appState.recipes,
            pantry: appState.foods,
            grocery: appState.groceryItems
        )
    }

    var body: some View {
        List {
            // US-272: filter chip rail — quick-access filters on the
            // left, "Filters…" button to expose the full sheet.
            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        CategoryChip(title: "All", isSelected: !filters.isAnyActive && searchText.isEmpty) {
                            HapticManager.lightImpact()
                            filters = RecipeFilters()
                            searchText = ""
                        }
                        CategoryChip(
                            title: "✨ Cookable",
                            isSelected: filters.cookableOnly
                        ) {
                            HapticManager.selection()
                            filters.cookableOnly.toggle()
                        }
                        // US-468: quick filter to starred recipes.
                        CategoryChip(
                            title: "⭐️ Favorites",
                            isSelected: filters.favoritesOnly
                        ) {
                            HapticManager.selection()
                            filters.favoritesOnly.toggle()
                        }
                        ForEach(["easy", "medium", "hard"], id: \.self) { level in
                            CategoryChip(
                                title: "\(difficultyIcon(level)) \(level.capitalized)",
                                isSelected: filters.difficulty == level
                            ) {
                                HapticManager.selection()
                                filters.difficulty = filters.difficulty == level ? nil : level
                            }
                        }
                        ForEach(inlineCuisines) { cuisine in
                            CategoryChip(
                                title: "\(cuisine.emoji) \(cuisine.displayName)",
                                isSelected: filters.cuisines.contains(cuisine)
                            ) {
                                HapticManager.selection()
                                if filters.cuisines.contains(cuisine) {
                                    filters.cuisines.remove(cuisine)
                                } else {
                                    filters.cuisines.insert(cuisine)
                                }
                            }
                        }
                        CategoryChip(
                            title: filters.activeCount > 0
                                ? "⚙︎ Filters (\(filters.activeCount))"
                                : "⚙︎ Filters",
                            isSelected: filters.activeCount > 0
                        ) {
                            HapticManager.lightImpact()
                            showingFiltersSheet = true
                        }
                    }
                    .padding(.vertical, 4)
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                .popoverTip(swipeTip)
            }

            // Active-filter chip strip — only shows the dimensions
            // that aren't already obvious from the rail above (so we
            // don't double-render Cookable / Difficulty / Cuisine).
            if let activeChips = activeFilterChips, !activeChips.isEmpty {
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(activeChips, id: \.id) { chip in
                                Button {
                                    HapticManager.selection()
                                    chip.remove()
                                } label: {
                                    HStack(spacing: 4) {
                                        Text(chip.label).font(.caption.weight(.semibold))
                                        Image(systemName: "xmark")
                                            .font(.caption2.weight(.semibold))
                                    }
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(Color.accentColor.opacity(0.15), in: Capsule())
                                    .foregroundStyle(Color.accentColor)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                }
            }

            // Recipes
            if appState.isLoading && appState.recipes.isEmpty {
                Section {
                    ForEach(0..<3, id: \.self) { _ in
                        SkeletonView(shape: .recipeRow)
                    }
                }
            } else if filteredRecipes.isEmpty {
                Section {
                    if filters.isAnyActive || !searchText.isEmpty {
                        ContentUnavailableView(
                            "No matches",
                            systemImage: "line.3.horizontal.decrease.circle",
                            description: Text("Try clearing some filters to see more recipes.")
                        )
                    } else {
                        ContentUnavailableView(
                            "No Recipes",
                            systemImage: "book.fill",
                            description: Text("Add recipes to start building your collection.")
                        )
                    }
                }
            } else {
                ForEach(filteredRecipes) { recipe in
                    HStack(spacing: 8) {
                        if isSelecting {
                            Image(systemName: selectedIds.contains(recipe.id) ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(selectedIds.contains(recipe.id) ? .green : .secondary)
                                .font(.title3)
                                .accessibilityLabel(selectedIds.contains(recipe.id) ? "Selected" : "Not selected")
                        }
                        RecipeRowView(
                            recipe: recipe,
                            coverage: coverageByRecipe[recipe.id]?.coverage,
                            coverageTier: coverageByRecipe[recipe.id]?.tier,
                            onCoverageTap: { coverageSheetRecipe = recipe }
                        )
                    }
                        .contentShape(Rectangle())
                        .onTapGesture {
                            if isSelecting {
                                HapticManager.selection()
                                if selectedIds.contains(recipe.id) {
                                    selectedIds.remove(recipe.id)
                                } else {
                                    selectedIds.insert(recipe.id)
                                }
                            } else {
                                selectedRecipe = recipe
                            }
                        }
                        .swipeActions(edge: .leading, allowsFullSwipe: !isSelecting) {
                            if !isSelecting {
                                Button {
                                    HapticManager.success()
                                    Task {
                                        await addRecipeIngredientsToGrocery(recipe)
                                        await TipEvents.didSwipeRecipe.donate()
                                    }
                                } label: {
                                    Label("Grocery", systemImage: "cart.fill.badge.plus")
                                }
                                .tint(.blue)
                                .accessibilityLabel("Add \(recipe.name) ingredients to grocery list")

                                // US-468: star / unstar via swipe.
                                Button {
                                    Task { await appState.setRecipeFavorite(recipe.id, !(recipe.isFavorite ?? false)) }
                                } label: {
                                    Label(
                                        (recipe.isFavorite ?? false) ? "Unfavorite" : "Favorite",
                                        systemImage: (recipe.isFavorite ?? false) ? "star.slash" : "star.fill"
                                    )
                                }
                                .tint(.yellow)
                                .accessibilityLabel((recipe.isFavorite ?? false)
                                    ? "Remove \(recipe.name) from favorites"
                                    : "Add \(recipe.name) to favorites")
                            }
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: !isSelecting) {
                            if !isSelecting {
                                Button(role: .destructive) {
                                    HapticManager.error()
                                    Task { try? await appState.deleteRecipe(recipe.id) }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                        .contextMenu {
                            // US-468: star / unstar.
                            Button {
                                HapticManager.selection()
                                Task { await appState.setRecipeFavorite(recipe.id, !(recipe.isFavorite ?? false)) }
                            } label: {
                                Label(
                                    (recipe.isFavorite ?? false) ? "Remove Favorite" : "Add to Favorites",
                                    systemImage: (recipe.isFavorite ?? false) ? "star.slash" : "star"
                                )
                            }

                            Button {
                                HapticManager.success()
                                Task { await addRecipeIngredientsToGrocery(recipe) }
                            } label: {
                                Label("Add Ingredients to Grocery", systemImage: "cart.fill.badge.plus")
                            }

                            Button {
                                selectedRecipe = recipe
                            } label: {
                                Label("View Details", systemImage: "doc.text.magnifyingglass")
                            }

                            Divider()

                            Button(role: .destructive) {
                                HapticManager.error()
                                Task { try? await appState.deleteRecipe(recipe.id) }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        } preview: {
                            RecipePreviewCard(recipe: recipe)
                        }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(isSelecting ? "\(selectedIds.count) selected" : "Recipes")
        .searchable(text: $searchText, prompt: "Search by name or ingredient…")
        .toolbar {
            // US-467: sort control (parity with Pantry). Composes with the
            // active filters so "easy Italian, fastest first" is possible.
            ToolbarItem(placement: .topBarLeading) {
                if !isSelecting {
                    Menu {
                        Picker("Sort", selection: $filters.sort) {
                            ForEach(RecipeSortOption.allCases, id: \.self) { option in
                                Text(option.rawValue).tag(option)
                            }
                        }
                    } label: {
                        Label("Sort: \(filters.sort.rawValue)", systemImage: "arrow.up.arrow.down")
                    }
                    .accessibilityLabel("Sort recipes")
                }
            }

            // US-269: select-mode entry + Done.
            ToolbarItem(placement: .primaryAction) {
                if isSelecting {
                    Button("Done") {
                        HapticManager.lightImpact()
                        exitSelectMode()
                    }
                } else {
                    Menu {
                        Button {
                            showingAddRecipe = true
                        } label: {
                            Label("Add Recipe", systemImage: "plus")
                        }
                        // US-270: open the "What can I make?" sheet.
                        Button {
                            HapticManager.lightImpact()
                            AnalyticsService.track(.cookableMatchOpened)
                            showingCookable = true
                        } label: {
                            Label("What can I make?", systemImage: "sparkles")
                        }
                        .disabled(appState.recipes.isEmpty)
                        Divider()
                        Button {
                            HapticManager.lightImpact()
                            isSelecting = true
                            selectedIds.removeAll()
                        } label: {
                            Label("Select multiple", systemImage: "checkmark.circle")
                        }
                        .disabled(appState.recipes.isEmpty)
                    } label: {
                        Image(systemName: "plus")
                    }
                    .accessibilityLabel("Add or select recipes")
                }
            }

            // US-269: bottom action bar in select mode.
            ToolbarItemGroup(placement: .bottomBar) {
                if isSelecting {
                    Button {
                        Task { await bulkAddIngredientsToGrocery() }
                    } label: {
                        Label("To Grocery", systemImage: "cart.fill.badge.plus")
                    }
                    .disabled(selectedIds.isEmpty)

                    Spacer()

                    Button {
                        if selectedIds.count == filteredRecipes.count {
                            selectedIds.removeAll()
                        } else {
                            selectedIds = Set(filteredRecipes.map(\.id))
                        }
                        HapticManager.selection()
                    } label: {
                        Label(
                            selectedIds.count == filteredRecipes.count ? "None" : "All",
                            systemImage: "checkmark.rectangle.stack"
                        )
                    }
                    .disabled(filteredRecipes.isEmpty)

                    Spacer()

                    Button(role: .destructive) {
                        showingBulkDeleteConfirm = true
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                    .disabled(selectedIds.isEmpty)
                }
            }
        }
        .sheet(isPresented: $showingAddRecipe) {
            AddRecipeView()
        }
        .sheet(item: $selectedRecipe) { recipe in
            RecipeDetailView(recipe: recipe)
        }
        // US-469: missing-ingredients sheet from a tapped coverage badge.
        .sheet(item: $coverageSheetRecipe) { recipe in
            MissingIngredientsSheet(
                recipe: recipe,
                shortfalls: ShortfallCalculator.compute(recipe: recipe, pantry: appState.foods),
                onFinish: { _ in }
            )
            .environmentObject(appState)
        }
        .sheet(isPresented: $showingCookable) {
            CookableRecipesSheet()
                .environmentObject(appState)
        }
        .sheet(isPresented: $showingFiltersSheet) {
            RecipeFiltersSheet(filters: $filters)
                .environmentObject(appState)
        }
        .alert(
            "Delete \(selectedIds.count) recipe\(selectedIds.count == 1 ? "" : "s")?",
            isPresented: $showingBulkDeleteConfirm
        ) {
            Button("Delete", role: .destructive) {
                Task { await bulkDelete() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This can't be undone.")
        }
        .refreshable {
            await appState.loadAllData()
        }
        // US-441: when the search/filter changes, drop any selection that's no
        // longer visible so bulk actions can never touch filter-hidden recipes
        // and the None/All toggle label stays truthful.
        .onChange(of: filteredRecipes.map(\.id)) { _, visibleIds in
            guard isSelecting else { return }
            selectedIds.formIntersection(visibleIds)
        }
    }

    // MARK: - US-269 bulk actions

    private func exitSelectMode() {
        selectedIds.removeAll()
        isSelecting = false
    }

    /// US-441: selection scoped to what's currently visible. Bulk ops act on
    /// this, never on the raw `selectedIds`, so hidden recipes are never hit.
    private var visibleSelectedIds: Set<String> {
        selectedIds.intersection(filteredRecipes.map(\.id))
    }

    private func bulkAddIngredientsToGrocery() async {
        let ids = visibleSelectedIds
        guard !ids.isEmpty else { return }
        do {
            try await appState.bulkAddRecipesToGrocery(ids)
            exitSelectMode()
        } catch { }
    }

    private func bulkDelete() async {
        let ids = visibleSelectedIds
        guard !ids.isEmpty else { return }
        do {
            try await appState.bulkDeleteRecipes(ids)
            exitSelectMode()
        } catch { }
    }

    // MARK: - US-272 active-filter chips

    /// Removable chips representing filters that aren't already shown
    /// in the inline rail (so we don't double-render Cookable /
    /// Difficulty / Cuisine which the rail handles directly). Returns
    /// nil when nothing's worth showing — caller skips the section.
    private var activeFilterChips: [ActiveFilterChip]? {
        var chips: [ActiveFilterChip] = []

        // Selected pantry foods → one chip each so the user can remove
        // them individually without going back into the sheet.
        for id in filters.requiredFoodIds {
            let name = appState.foods.first(where: { $0.id == id })?.name ?? "food"
            chips.append(ActiveFilterChip(
                id: "food-\(id)",
                label: "🥕 \(name)"
            ) { filters.requiredFoodIds.remove(id) })
        }

        let q = filters.ingredientQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        if !q.isEmpty {
            chips.append(ActiveFilterChip(
                id: "ingredient-query",
                label: "🔍 \(q)"
            ) { filters.ingredientQuery = "" })
        }

        if let max = filters.maxTotalMinutes {
            chips.append(ActiveFilterChip(
                id: "max-time",
                label: "⏱ ≤\(max) min"
            ) { filters.maxTotalMinutes = nil })
        }

        return chips.isEmpty ? nil : chips
    }

    private struct ActiveFilterChip {
        let id: String
        let label: String
        let remove: () -> Void
    }

    private func difficultyIcon(_ level: String) -> String {
        switch level {
        case "easy": return "1.circle.fill"
        case "medium": return "2.circle.fill"
        case "hard": return "3.circle.fill"
        default: return "circle"
        }
    }

    /// US-358: unified through GroceryGeneratorService (same path as the detail
    /// view) — structured-first, pantry+list deduped, recipe-source tagged.
    private func addRecipeIngredientsToGrocery(_ recipe: Recipe) async {
        let result = GroceryGeneratorService.generateFromRecipes(
            [recipe], appState: appState, skipPantryStocked: true
        )
        let n = result.items.count
        try? await GroceryGeneratorService.addGeneratedItemsBatched(
            result,
            appState: appState,
            successMessage: "Added \(n) missing ingredient\(n == 1 ? "" : "s") from \(recipe.name).",
            emptyMessage: "You already have everything for \(recipe.name)."
        )
    }
}

// MARK: - Recipe Row

struct RecipeRowView: View {
    @EnvironmentObject var appState: AppState
    let recipe: Recipe
    // US-469: optional pantry-coverage badge. nil = no badge (low coverage
    // or no ingredients). Defaults keep other call sites unchanged.
    var coverage: Double? = nil
    var coverageTier: RecipeMatcher.Tier? = nil
    var onCoverageTap: (() -> Void)? = nil

    private var coverageColor: Color {
        switch coverageTier {
        case .cookNow: return .green
        case .almostThere: return .orange
        default: return .secondary
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                if recipe.imageUrl != nil {
                    RecipeThumbnail(imageUrl: recipe.imageUrl, size: 44)
                }

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 4) {
                        // US-468: favorite indicator.
                        if recipe.isFavorite == true {
                            Image(systemName: "star.fill")
                                .font(.caption)
                                .foregroundStyle(.yellow)
                                .accessibilityLabel("Favorite")
                        }
                        Text(recipe.name)
                            .font(.body)
                            .fontWeight(.semibold)
                    }

                    if let description = recipe.description, !description.isEmpty {
                        Text(description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                }

                Spacer()

                if let rating = recipe.rating, rating > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "star.fill")
                            .font(.caption)
                            .foregroundStyle(.yellow)
                        Text(String(format: "%.1f", rating))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            HStack(spacing: 12) {
                // US-469: at-a-glance "can I make this now?" badge. Tapping it
                // opens the missing-ingredients sheet for one-tap restock.
                if let coverage, let coverageTier {
                    Button {
                        onCoverageTap?()
                    } label: {
                        Label("\(Int((coverage * 100).rounded()))%", systemImage: "basket.fill")
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(coverageColor.opacity(0.15), in: Capsule())
                            .foregroundStyle(coverageColor)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(coverageTier.displayName), you have \(Int((coverage * 100).rounded())) percent of ingredients")
                    .accessibilityHint("Opens missing ingredients")
                }

                if let prepTime = recipe.prepTime {
                    Label(prepTime, systemImage: "timer")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                if let difficulty = recipe.difficultyLevel {
                    Text(difficulty.capitalized)
                        .font(.caption2)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(difficultyColor(difficulty).opacity(0.15), in: Capsule())
                        .foregroundStyle(difficultyColor(difficulty))
                }

                let foodCount = recipe.foodIds.count
                Label("\(foodCount) ingredients", systemImage: "leaf")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                if let tags = recipe.tags, !tags.isEmpty {
                    Text(tags.prefix(2).joined(separator: ", "))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func difficultyColor(_ level: String) -> Color {
        switch level {
        case "easy": return .green
        case "medium": return .orange
        case "hard": return .red
        default: return .secondary
        }
    }
}

// MARK: - Recipe Detail View

struct RecipeDetailView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss
    let recipe: Recipe
    @State private var showingEditRecipe = false
    // US-359: step-by-step cooking mode.
    @State private var showingCookMode = false

    // US-357: add-to-meal-plan flow. `pendingShortfallRecipe` carries the
    // just-planned recipe across the picker's dismissal so we can compute the
    // pantry shortfall and present the missing-ingredient sheet — mirroring the
    // MealPlanView add flow.
    @State private var showingAddToPlan = false
    @State private var pendingShortfallRecipe: Recipe?
    @State private var detailShortfall: DetailShortfallContext?

    // US-358: guard the grocery-add button against double-taps.
    @State private var isAddingToGrocery = false

    // US-224: live serving scaler. 0 == "show original".
    @State private var displayServings: Int = 0

    private var scaleStorageKey: String { "recipe.servings.\(recipe.id)" }

    private var currentRecipe: Recipe {
        appState.recipes.first { $0.id == recipe.id } ?? recipe
    }

    private var originalServings: Int {
        RecipeScaling.parseOriginalServings(currentRecipe.servings)
    }

    private var effectiveServings: Int {
        displayServings > 0 ? displayServings : originalServings
    }

    private var servingScale: Double {
        guard originalServings > 0 else { return 1.0 }
        return Double(effectiveServings) / Double(originalServings)
    }

    private var isScaled: Bool {
        abs(servingScale - 1.0) > 0.001
    }

    /// Always render the count with the word, pluralized: "1 serving" /
    /// "4 servings". Used so the number never reads as a bare, unlabeled value.
    private func servingsLabel(_ count: Int) -> String {
        "\(count) serving\(count == 1 ? "" : "s")"
    }

    /// US-356: one structured ingredient row, with quantity scaled live by the
    /// servings stepper. Quantity is optional (some imported rows are name-only),
    /// in which case we just show the name.
    @ViewBuilder
    private func structuredIngredientRow(_ ingredient: RecipeIngredient) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            if let qty = ingredient.quantity, qty > 0 {
                let scaled = qty * servingScale
                let unitSuffix = ingredient.unit.map { " \($0)" } ?? ""
                Text("\(RecipeScaling.formatQuantity(scaled))\(unitSuffix)")
                    .font(.subheadline.weight(.medium))
                    .monospacedDigit()
                    .foregroundStyle(.primary)
            } else {
                Text("•")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Text(ingredient.name)
                .font(.subheadline)
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Recipe Image
                    if let imageUrl = currentRecipe.imageUrl, !imageUrl.isEmpty {
                        CachedAsyncImage(
                            url: URL(string: imageUrl),
                            size: CGSize(width: UIScreen.main.bounds.width, height: 200)
                        ) {
                            Rectangle()
                                .fill(Color(.systemGray5))
                        }
                        .clipped()
                    }

                    // Header
                    VStack(alignment: .leading, spacing: 8) {
                        Text(currentRecipe.name)
                            .font(.title2)
                            .fontWeight(.bold)

                        if let description = currentRecipe.description {
                            Text(description)
                                .font(.body)
                                .foregroundStyle(.secondary)
                        }
                    }

                    // Meta Info
                    HStack(spacing: 16) {
                        if let prepTime = currentRecipe.prepTime {
                            MetaBadge(icon: "timer", text: prepTime)
                        }
                        if let cookTime = currentRecipe.cookTime {
                            MetaBadge(icon: "flame.fill", text: cookTime)
                        }
                        if let difficulty = currentRecipe.difficultyLevel {
                            MetaBadge(icon: "chart.bar.fill", text: difficulty.capitalized)
                        }
                    }

                    // US-357: add this recipe straight to the planner without
                    // leaving the detail view and re-searching for it.
                    Button {
                        showingAddToPlan = true
                    } label: {
                        Label("Add to Meal Plan", systemImage: "calendar.badge.plus")
                            .font(.subheadline.weight(.semibold))
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .accessibilityHint("Pick a day and meal, then optionally add missing ingredients to your grocery list")

                    // US-224: Servings scaler
                    HStack(spacing: 12) {
                        Image(systemName: "person.2.fill")
                            .foregroundStyle(.green)
                        Text("Servings")
                            .font(.subheadline)
                            .fontWeight(.medium)
                        Spacer()
                        Stepper(
                            value: Binding(
                                get: { effectiveServings },
                                set: { newValue in
                                    let clamped = max(1, min(20, newValue))
                                    displayServings = clamped
                                    let persisted = (clamped == originalServings) ? 0 : clamped
                                    UserDefaults.standard.set(persisted, forKey: scaleStorageKey)
                                }
                            ),
                            in: 1...20
                        ) {
                            HStack(spacing: 6) {
                                Text(servingsLabel(effectiveServings))
                                    .font(.headline)
                                    .monospacedDigit()
                                if isScaled {
                                    Text("(from \(servingsLabel(originalServings)))")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        .labelsHidden()

                        if isScaled {
                            Button {
                                displayServings = originalServings
                                UserDefaults.standard.set(0, forKey: scaleStorageKey)
                                HapticManager.lightImpact()
                            } label: {
                                Image(systemName: "arrow.uturn.backward.circle")
                                    .foregroundStyle(.secondary)
                            }
                            .accessibilityLabel("Reset to original servings")
                        }
                    }
                    .padding(12)
                    .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))

                    // Ingredients
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text("Ingredients")
                                .font(.headline)
                            Text("· makes \(servingsLabel(effectiveServings))")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }

                        if !currentRecipe.ingredients.isEmpty {
                            // US-356: structured rows are the source of truth —
                            // render name + quantity/unit scaled by the servings
                            // stepper. The legacy foodIds + additional-text path
                            // below is only a fallback for recipes created
                            // before US-265 / US-354 produced structured rows.
                            ForEach(currentRecipe.ingredients.sorted { $0.sortOrder < $1.sortOrder }) { ingredient in
                                structuredIngredientRow(ingredient)
                            }
                        } else {
                            ForEach(currentRecipe.foodIds, id: \.self) { foodId in
                                if let food = appState.foods.first(where: { $0.id == foodId }) {
                                    HStack(spacing: 8) {
                                        let cat = FoodCategory(rawValue: food.category)
                                        Text(cat?.icon ?? "🍽")
                                        Text(food.name)
                                            .font(.subheadline)
                                    }
                                }
                            }

                            if let additional = currentRecipe.additionalIngredients, !additional.isEmpty {
                                let rendered = isScaled
                                    ? RecipeScaling.scaleIngredientsText(additional, scale: servingScale)
                                    : additional
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Additional: \(rendered)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    if isScaled {
                                        Text("Original: \(additional)")
                                            .font(.caption2)
                                            .foregroundStyle(.tertiary)
                                    }
                                }
                            }
                        }

                        Button {
                            Task { await addIngredientsToGrocery() }
                        } label: {
                            HStack {
                                if isAddingToGrocery {
                                    ProgressView().controlSize(.small)
                                }
                                Label("Add Missing to Grocery List", systemImage: "cart.badge.plus")
                                    .font(.subheadline)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(.green)
                        .disabled(isAddingToGrocery)
                        .padding(.top, 4)
                    }

                    // Instructions
                    if let instructions = currentRecipe.instructions, !instructions.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text("Instructions")
                                    .font(.headline)
                                Spacer()
                                // US-359: launch step-by-step cook mode.
                                Button {
                                    showingCookMode = true
                                } label: {
                                    Label("Cook", systemImage: "flame.fill")
                                        .font(.subheadline)
                                }
                                .buttonStyle(.borderedProminent)
                                .tint(.green)
                                .controlSize(.small)
                            }

                            Text(instructions)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }

                    // Nutrition
                    if let nutrition = currentRecipe.nutritionInfo {
                        RecipeNutritionCard(nutrition: nutrition)
                    }

                    // Tips
                    if let tips = currentRecipe.tips, !tips.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Tips")
                                .font(.headline)

                            Text(tips)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .padding()
                                .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 8))
                        }
                    }

                    // Tags
                    if let tags = currentRecipe.tags, !tags.isEmpty {
                        FlowLayout(spacing: 6) {
                            ForEach(tags, id: \.self) { tag in
                                Text(tag)
                                    .font(.caption)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 4)
                                    .background(Color.green.opacity(0.1), in: Capsule())
                                    .foregroundStyle(.green)
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                // US-468: favorite toggle.
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        let isFav = currentRecipe.isFavorite ?? false
                        Task { await appState.setRecipeFavorite(currentRecipe.id, !isFav) }
                    } label: {
                        Image(systemName: (currentRecipe.isFavorite ?? false) ? "star.fill" : "star")
                            .foregroundStyle((currentRecipe.isFavorite ?? false) ? .yellow : .secondary)
                    }
                    .accessibilityLabel((currentRecipe.isFavorite ?? false) ? "Remove from favorites" : "Add to favorites")
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showingEditRecipe = true
                    } label: {
                        Image(systemName: "pencil")
                    }
                }
            }
            .sheet(isPresented: $showingEditRecipe) {
                EditRecipeView(recipe: currentRecipe)
            }
            // US-359: step-by-step cooking mode.
            .fullScreenCover(isPresented: $showingCookMode) {
                CookModeView(
                    recipeName: currentRecipe.name,
                    instructions: currentRecipe.instructions
                )
            }
            // US-357: add-to-plan picker; on dismiss compute the shortfall.
            .sheet(isPresented: $showingAddToPlan, onDismiss: handleAddToPlanDismiss) {
                AddRecipeToPlanSheet(recipe: currentRecipe) { added in
                    pendingShortfallRecipe = added
                }
                .environmentObject(appState)
            }
            .sheet(item: $detailShortfall) { ctx in
                MissingIngredientsSheet(
                    recipe: ctx.recipe,
                    shortfalls: ctx.shortfalls,
                    onFinish: { _ in detailShortfall = nil }
                )
                .environmentObject(appState)
            }
            .onAppear {
                // Restore the persisted per-recipe servings scale if any.
                let stored = UserDefaults.standard.integer(forKey: scaleStorageKey)
                if stored > 0 {
                    displayServings = stored
                } else if displayServings == 0 {
                    displayServings = originalServings
                }
            }
        }
    }

    /// US-357/US-353: after the add-to-plan picker closes, compute the pantry
    /// shortfall for the just-planned recipe via the shared ShortfallChecker
    /// (so legacy `food_ids` recipes prompt too) and present the
    /// missing-ingredient sheet. Silent no-op when nothing is short.
    private func handleAddToPlanDismiss() {
        guard let planned = pendingShortfallRecipe else { return }
        pendingShortfallRecipe = nil
        let shortfalls = ShortfallChecker.shortfalls(for: planned, pantry: appState.foods)
        guard !shortfalls.isEmpty else { return }
        detailShortfall = DetailShortfallContext(recipe: planned, shortfalls: shortfalls)
    }

    /// US-358: unified through GroceryGeneratorService — prefers structured
    /// ingredients, falls back to foodIds/legacy text, dedupes against BOTH the
    /// pantry and the existing grocery list (so only the *missing* items are
    /// added), and stamps recipe source rows so the items appear under this
    /// recipe in the grocery "By Recipe" view.
    private func addIngredientsToGrocery() async {
        guard !isAddingToGrocery else { return }
        isAddingToGrocery = true
        defer { isAddingToGrocery = false }

        let result = GroceryGeneratorService.generateFromRecipes(
            [currentRecipe], appState: appState, skipPantryStocked: true
        )
        let n = result.items.count
        do {
            try await GroceryGeneratorService.addGeneratedItemsBatched(
                result,
                appState: appState,
                successMessage: "Added \(n) missing ingredient\(n == 1 ? "" : "s") from \(currentRecipe.name).",
                emptyMessage: "You already have everything for \(currentRecipe.name)."
            )
        } catch {
            // addGeneratedItemsBatched surfaces its own error toast.
        }
    }
}

// MARK: - US-357 Add-to-Plan

/// Identifiable wrapper so the missing-ingredient sheet can present via
/// `.sheet(item:)` after the add-to-plan picker dismisses.
private struct DetailShortfallContext: Identifiable {
    let id = UUID()
    let recipe: Recipe
    let shortfalls: [ShortfallCalculator.Shortfall]
}

/// US-357: compact picker to drop a recipe onto the planner (date + meal slot
/// + child). Inserts the plan entry and reports back via `onAdded` so the
/// detail view can run the missing-ingredient shortfall check.
// US-418: made non-private so the "What can I make?" sheet can reuse the
// real add-to-plan flow instead of a toast stub.
struct AddRecipeToPlanSheet: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) private var dismiss

    let recipe: Recipe
    var onAdded: (Recipe) -> Void = { _ in }

    @State private var date = Date()
    @State private var mealSlot: MealSlot = .dinner
    @State private var kidId: String = ""
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("Date", selection: $date, displayedComponents: .date)

                Picker("Meal", selection: $mealSlot) {
                    ForEach(MealSlot.allCases, id: \.self) { slot in
                        Label(slot.displayName, systemImage: slot.icon).tag(slot)
                    }
                }

                // Only ask which child when there's more than one profile.
                if appState.kids.count > 1 {
                    Picker("Child", selection: $kidId) {
                        ForEach(appState.kids) { kid in
                            Text(kid.name).tag(kid.id)
                        }
                    }
                }
            }
            .navigationTitle("Add to Meal Plan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") { Task { await add() } }
                        .disabled(isSubmitting || kidId.isEmpty)
                }
            }
            .onAppear {
                if kidId.isEmpty {
                    kidId = appState.activeKidId ?? appState.kids.first?.id ?? ""
                }
            }
        }
    }

    /// `plan_entries.food_id` is NOT NULL, so resolve a concrete food UUID.
    /// US-357: in addition to legacy `foodIds`, consider structured ingredient
    /// links (US-354) so imported recipes whose ingredients live only in
    /// `recipe_ingredients` aren't trapped as "unplannable".
    private func resolveFoodId() -> String? {
        if let first = recipe.foodIds.first { return first }
        if let linked = recipe.ingredients.compactMap(\.foodId).first { return linked }
        return nil
    }

    private func add() async {
        guard !kidId.isEmpty else {
            ToastManager.shared.error("Select a child profile first")
            return
        }
        guard let foodId = resolveFoodId() else {
            ToastManager.shared.error(
                "Link an ingredient to your pantry first",
                message: "Open this recipe's ingredients so we can plan it."
            )
            return
        }

        isSubmitting = true
        let entry = PlanEntry(
            id: UUID().uuidString,
            userId: "",
            kidId: kidId,
            date: DateFormatter.isoDate.string(from: date),
            mealSlot: mealSlot.rawValue,
            foodId: foodId,
            recipeId: recipe.id
        )

        do {
            try await appState.addPlanEntry(entry)
            onAdded(recipe)
            let dateLabel = date.formatted(date: .abbreviated, time: .omitted)
            ToastManager.shared.success(
                "Added to \(mealSlot.displayName)",
                message: dateLabel
            )
            dismiss()
        } catch {
            // addPlanEntry already surfaces an error toast; stay open to retry.
            isSubmitting = false
        }
    }
}

struct MetaBadge: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption)
            Text(text)
                .font(.caption)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color(.systemGray6), in: Capsule())
        .foregroundStyle(.secondary)
    }
}

struct RecipeNutritionCard: View {
    let nutrition: NutritionInfo

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Nutrition")
                .font(.headline)

            LazyVGrid(columns: [
                GridItem(.flexible()),
                GridItem(.flexible()),
                GridItem(.flexible()),
            ], spacing: 12) {
                if let cal = nutrition.calories {
                    NutritionItem(label: "Calories", value: "\(Int(cal))", unit: "kcal")
                }
                if let protein = nutrition.proteinG {
                    NutritionItem(label: "Protein", value: String(format: "%.1f", protein), unit: "g")
                }
                if let carbs = nutrition.carbsG {
                    NutritionItem(label: "Carbs", value: String(format: "%.1f", carbs), unit: "g")
                }
                if let fat = nutrition.fatG {
                    NutritionItem(label: "Fat", value: String(format: "%.1f", fat), unit: "g")
                }
                if let fiber = nutrition.fiberG {
                    NutritionItem(label: "Fiber", value: String(format: "%.1f", fiber), unit: "g")
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

struct NutritionItem: View {
    let label: String
    let value: String
    let unit: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.title3)
                .fontWeight(.bold)
            Text("\(unit)")
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(label)
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
    }
}

// MARK: - Flow Layout

struct FlowLayout: Layout {
    var spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = layout(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(proposal: proposal, subviews: subviews)
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(
                x: bounds.minX + result.positions[index].x,
                y: bounds.minY + result.positions[index].y
            ), proposal: .unspecified)
        }
    }

    private func layout(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var maxHeight: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            maxHeight = max(maxHeight, y + rowHeight)
        }

        return (CGSize(width: maxWidth, height: maxHeight), positions)
    }
}

// MARK: - Add Recipe View

struct AddRecipeView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    @State private var name = ""
    @State private var description = ""
    @State private var instructions = ""
    @State private var prepTime = ""
    @State private var cookTime = ""
    @State private var servings = ""
    @State private var difficulty = "easy"
    @State private var selectedFoodIds: Set<String> = []
    @State private var tags = ""
    @State private var additionalIngredients = ""
    @State private var recipeImage: UIImage?
    @State private var remoteImageUrl: String?
    @State private var isSubmitting = false

    // US-223: paste-URL import state
    @State private var importURL = ""
    @State private var isImporting = false
    @State private var importError: String?
    @State private var importedFrom: String?

    var body: some View {
        NavigationStack {
            Form {
                // US-223: Import from URL
                Section {
                    HStack {
                        Image(systemName: "link")
                            .foregroundStyle(.secondary)
                        TextField("Paste a recipe URL", text: $importURL)
                            .keyboardType(.URL)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled(true)
                            .disabled(isImporting)
                            .submitLabel(.go)
                            .onSubmit { Task { await importFromURL() } }
                        if !importURL.isEmpty {
                            Button {
                                importURL = ""
                                importError = nil
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.tertiary)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Clear URL")
                        }
                    }

                    // US-360: explicit clipboard read on tap — we no longer
                    // sniff the pasteboard on appear (privacy/UX smell that
                    // trips the iOS 16+ paste banner).
                    Button {
                        pasteLinkFromClipboard()
                    } label: {
                        Label("Paste link", systemImage: "doc.on.clipboard")
                    }
                    .disabled(isImporting)

                    Button {
                        Task { await importFromURL() }
                    } label: {
                        HStack {
                            if isImporting {
                                ProgressView()
                                    .controlSize(.small)
                            }
                            Text(isImporting ? "Fetching recipe…" : "Fetch recipe")
                        }
                    }
                    .disabled(importURL.trimmingCharacters(in: .whitespaces).isEmpty || isImporting)

                    if let importError {
                        // US-367: ErrorBanner with retry.
                        ErrorBanner(message: importError, retryAction: {
                            Task { await importFromURL() }
                        })
                    } else if let importedFrom {
                        Label("Imported from \(importedFrom)", systemImage: "checkmark.circle.fill")
                            .font(.caption)
                            .foregroundStyle(.green)
                    }
                } header: {
                    Text("Import from URL")
                } footer: {
                    Text("Paste a recipe link from a website or blog and we'll fill in the details.")
                        .font(.caption2)
                }

                Section("Recipe Photo") {
                    HStack {
                        Spacer()
                        ImagePicker(selectedImage: $recipeImage)
                        Spacer()
                    }

                    if recipeImage == nil, let remoteImageUrl, let url = URL(string: remoteImageUrl) {
                        HStack {
                            Spacer()
                            CachedAsyncImage(
                                url: url,
                                size: CGSize(width: 120, height: 120)
                            ) {
                                RoundedRectangle(cornerRadius: 8)
                                    .fill(Color(.systemGray5))
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            Spacer()
                        }
                    }
                }

                Section("Recipe Details") {
                    TextField("Recipe name", text: $name)
                    TextField("Description", text: $description, axis: .vertical)
                        .lineLimit(3)
                }

                Section("Timing & Servings") {
                    TextField("Prep time (e.g., 15 mins)", text: $prepTime)
                    TextField("Cook time (e.g., 30 mins)", text: $cookTime)
                    TextField("Servings", text: $servings)
                        .keyboardType(.numberPad)

                    Picker("Difficulty", selection: $difficulty) {
                        Text("Easy").tag("easy")
                        Text("Medium").tag("medium")
                        Text("Hard").tag("hard")
                    }
                }

                Section("Ingredients (\(selectedFoodIds.count) selected)") {
                    ForEach(appState.foods) { food in
                        Button {
                            if selectedFoodIds.contains(food.id) {
                                selectedFoodIds.remove(food.id)
                            } else {
                                selectedFoodIds.insert(food.id)
                            }
                        } label: {
                            HStack {
                                let cat = FoodCategory(rawValue: food.category)
                                Text(cat?.icon ?? "🍽")
                                Text(food.name)
                                    .foregroundStyle(.primary)
                                Spacer()
                                if selectedFoodIds.contains(food.id) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(.green)
                                }
                            }
                        }
                    }
                }

                Section("Instructions") {
                    TextField("Step by step instructions", text: $instructions, axis: .vertical)
                        .lineLimit(8)
                }

                Section {
                    TextField("Extra ingredients (comma separated)", text: $additionalIngredients, axis: .vertical)
                        .lineLimit(3)
                } header: {
                    Text("Additional Ingredients")
                } footer: {
                    Text("Ingredients imported from a URL that couldn't be matched to your pantry live here.")
                        .font(.caption2)
                }

                Section("Tags") {
                    TextField("Tags (comma separated)", text: $tags)
                        .textInputAutocapitalization(.never)
                }
            }
            .navigationTitle("New Recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        Task { await createRecipe() }
                    }
                    .disabled(name.isEmpty || isSubmitting)
                }
            }
        }
    }

    // MARK: - Recipe URL import (US-223)

    /// US-360: read the clipboard only when the user taps "Paste link" — an
    /// explicit, intentional action rather than an on-appear pasteboard sniff.
    private func pasteLinkFromClipboard() {
        guard let clipboard = UIPasteboard.general.string,
              let url = RecipeImportService.firstURL(in: clipboard) else {
            importError = "No recipe link found on the clipboard."
            return
        }
        importURL = url.absoluteString
        importError = nil
    }

    private func importFromURL() async {
        let trimmed = importURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        isImporting = true
        importError = nil
        importedFrom = nil
        defer { isImporting = false }

        do {
            let parsed = try await RecipeImportService.parse(trimmed)
            applyParsed(parsed, sourceURL: trimmed)
            HapticManager.success()
            AnalyticsService.track(.recipeImported(source: .url, success: true))
        } catch let error as RecipeImportService.ImportError {
            // ImportError already has friendly localized descriptions; surface
            // them as-is. AppError.wrap would lose that domain-specific copy.
            importError = error.errorDescription
            HapticManager.error()
            AnalyticsService.track(.recipeImported(source: .url, success: false))
        } catch {
            // Anything else (transient network, decode hiccup) gets the
            // standard import-failure message + offline detection.
            importError = AppError.wrap(error, as: { .importFailed(source: "URL", underlying: $0) })
                .errorDescription
            HapticManager.error()
            AnalyticsService.track(.recipeImported(source: .url, success: false))
        }
    }

    private func applyParsed(_ parsed: RecipeImportService.ParsedRecipe, sourceURL: String) {
        if name.isEmpty { name = parsed.name }
        if description.isEmpty, let d = parsed.description { description = d }
        if instructions.isEmpty, let i = parsed.instructions { instructions = i }
        if prepTime.isEmpty, let p = parsed.prepTime { prepTime = p }
        if cookTime.isEmpty, let c = parsed.cookTime { cookTime = c }
        if servings.isEmpty, let s = parsed.servings { servings = s }
        if remoteImageUrl == nil { remoteImageUrl = parsed.imageUrl }

        // Link any parsed ingredient that fuzzy-matches an existing pantry
        // food; everything else goes into additionalIngredients so the user
        // still has the text even if we couldn't auto-link it.
        var unmatched: [String] = []
        for ingredient in parsed.ingredients {
            if let match = fuzzyMatchFood(ingredient) {
                selectedFoodIds.insert(match.id)
            } else {
                unmatched.append(ingredient)
            }
        }
        if !unmatched.isEmpty {
            let existing = additionalIngredients.trimmingCharacters(in: .whitespaces)
            additionalIngredients = existing.isEmpty
                ? unmatched.joined(separator: ", ")
                : existing + ", " + unmatched.joined(separator: ", ")
        }

        importedFrom = URL(string: sourceURL)?.host ?? sourceURL

        let totalIngredients = parsed.ingredients.count
        let matched = totalIngredients - unmatched.count
        ToastManager.shared.success(
            "Imported recipe",
            message: "\(parsed.name) · \(matched)/\(totalIngredients) ingredients linked"
        )
    }

    private func fuzzyMatchFood(_ ingredient: String) -> Food? {
        let normalizedIngredient = ingredient
            .lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedIngredient.isEmpty else { return nil }

        // Exact or substring match on food name.
        for food in appState.foods {
            let normalizedFood = food.name.lowercased()
            if normalizedIngredient == normalizedFood {
                return food
            }
            if normalizedIngredient.contains(normalizedFood),
               normalizedFood.count >= 3 {
                return food
            }
        }
        return nil
    }

    private func createRecipe() async {
        isSubmitting = true
        // US-413: always reset the submitting flag so a failed create doesn't
        // leave the Create button stuck disabled.
        defer { isSubmitting = false }

        let tagList = tags.isEmpty ? nil :
            tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }

        let recipeId = UUID().uuidString
        var imageUrl: String? = remoteImageUrl
        if let image = recipeImage {
            // US-413: surface upload failure instead of silently dropping the
            // photo; fall back to any imported remote image and warn.
            do {
                imageUrl = try await ImageUploadService.upload(
                    image: image,
                    folder: .recipes,
                    id: recipeId
                )
            } catch {
                ToastManager.shared.warning(
                    "Couldn't upload photo",
                    message: "Saved the recipe without the new image."
                )
            }
        }

        let trimmedAdditional = additionalIngredients.trimmingCharacters(in: .whitespacesAndNewlines)

        let trimmedImportURL = importURL.trimmingCharacters(in: .whitespacesAndNewlines)

        let recipe = Recipe(
            id: recipeId,
            userId: "",
            name: name,
            description: description.isEmpty ? nil : description,
            instructions: instructions.isEmpty ? nil : instructions,
            foodIds: Array(selectedFoodIds),
            prepTime: prepTime.isEmpty ? nil : prepTime,
            cookTime: cookTime.isEmpty ? nil : cookTime,
            servings: servings.isEmpty ? nil : servings,
            additionalIngredients: trimmedAdditional.isEmpty ? nil : trimmedAdditional,
            imageUrl: imageUrl,
            sourceUrl: trimmedImportURL.isEmpty ? nil : trimmedImportURL,
            sourceType: trimmedImportURL.isEmpty ? nil : "url",
            tags: tagList,
            difficultyLevel: difficulty
        )

        // US-413: only dismiss on confirmed success; on failure surface a toast
        // and keep the form open so the user doesn't lose their input.
        do {
            try await appState.addRecipe(recipe)
            HapticManager.success()
            dismiss()
        } catch {
            HapticManager.error()
            ToastManager.shared.error(
                "Couldn't create recipe",
                message: "Please try again."
            )
        }
    }
}

// MARK: - Recipe Preview Card (context menu preview)

struct RecipePreviewCard: View {
    let recipe: Recipe

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if recipe.imageUrl != nil {
                RecipeThumbnail(imageUrl: recipe.imageUrl, size: 280)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            Text(recipe.name)
                .font(.title3)
                .fontWeight(.semibold)

            if let description = recipe.description, !description.isEmpty {
                Text(description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }

            HStack(spacing: 12) {
                if let prepTime = recipe.prepTime {
                    Label(prepTime, systemImage: "timer")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let difficulty = recipe.difficultyLevel {
                    Text(difficulty.capitalized)
                        .font(.caption)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.green.opacity(0.15), in: Capsule())
                        .foregroundStyle(.green)
                }

                let foodCount = recipe.foodIds.count
                if foodCount > 0 {
                    Label("\(foodCount)", systemImage: "leaf.fill")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let rating = recipe.rating, rating > 0 {
                    HStack(spacing: 2) {
                        Image(systemName: "star.fill")
                            .font(.caption)
                            .foregroundStyle(.yellow)
                        Text(String(format: "%.1f", rating))
                            .font(.caption)
                    }
                }
            }
        }
        .padding()
        .frame(width: 320)
    }
}

#Preview {
    NavigationStack {
        RecipesView()
    }
    .environmentObject(AppState())
}
