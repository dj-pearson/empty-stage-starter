import SwiftUI
import TipKit

struct RecipesView: View {
    @EnvironmentObject var appState: AppState
    @State private var searchText = ""
    @State private var selectedRecipe: Recipe?
    @State private var showingAddRecipe = false
    @State private var selectedDifficulty: String?

    // US-269: bulk-select mode for recipes.
    @State private var isSelecting = false
    @State private var selectedIds: Set<String> = []
    @State private var showingBulkDeleteConfirm = false

    // US-270: cookable-recipes sheet entry.
    @State private var showingCookable = false

    private var swipeTip = SwipeRecipeTip()

    private var filteredRecipes: [Recipe] {
        var recipes = appState.recipes

        if let difficulty = selectedDifficulty {
            recipes = recipes.filter { $0.difficultyLevel == difficulty }
        }

        if !searchText.isEmpty {
            recipes = recipes.filter {
                $0.name.localizedCaseInsensitiveContains(searchText) ||
                ($0.tags ?? []).contains { $0.localizedCaseInsensitiveContains(searchText) }
            }
        }

        return recipes
    }

    var body: some View {
        List {
            // Difficulty Filter
            Section {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        CategoryChip(title: "All", isSelected: selectedDifficulty == nil) {
                            selectedDifficulty = nil
                        }
                        ForEach(["easy", "medium", "hard"], id: \.self) { level in
                            CategoryChip(
                                title: "\(difficultyIcon(level)) \(level.capitalized)",
                                isSelected: selectedDifficulty == level
                            ) {
                                selectedDifficulty = selectedDifficulty == level ? nil : level
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }
                .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                .popoverTip(swipeTip)
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
                    ContentUnavailableView(
                        "No Recipes",
                        systemImage: "book.fill",
                        description: Text("Add recipes to start building your collection.")
                    )
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
                        RecipeRowView(recipe: recipe)
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
        .searchable(text: $searchText, prompt: "Search recipes...")
        .toolbar {
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
        .sheet(isPresented: $showingCookable) {
            CookableRecipesSheet()
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
    }

    // MARK: - US-269 bulk actions

    private func exitSelectMode() {
        selectedIds.removeAll()
        isSelecting = false
    }

    private func bulkAddIngredientsToGrocery() async {
        guard !selectedIds.isEmpty else { return }
        do {
            try await appState.bulkAddRecipesToGrocery(selectedIds)
            exitSelectMode()
        } catch { }
    }

    private func bulkDelete() async {
        guard !selectedIds.isEmpty else { return }
        do {
            try await appState.bulkDeleteRecipes(selectedIds)
            exitSelectMode()
        } catch { }
    }

    private func difficultyIcon(_ level: String) -> String {
        switch level {
        case "easy": return "1.circle.fill"
        case "medium": return "2.circle.fill"
        case "hard": return "3.circle.fill"
        default: return "circle"
        }
    }

    private func addRecipeIngredientsToGrocery(_ recipe: Recipe) async {
        var addedCount = 0
        for foodId in recipe.foodIds {
            guard let food = appState.foods.first(where: { $0.id == foodId }) else { continue }
            let item = GroceryItem(
                id: UUID().uuidString,
                userId: "",
                name: food.name,
                category: food.category,
                quantity: 1,
                unit: food.unit ?? "count",
                checked: false,
                addedVia: "recipe"
            )
            do {
                try await appState.addGroceryItem(item)
                addedCount += 1
            } catch {
                continue
            }
        }
        if addedCount > 0 {
            ToastManager.shared.success(
                "Added to grocery",
                message: "\(addedCount) ingredient\(addedCount == 1 ? "" : "s") from \(recipe.name)"
            )
        } else {
            ToastManager.shared.info(
                "No ingredients linked",
                message: "This recipe has no foods linked yet."
            )
        }
    }
}

// MARK: - Recipe Row

struct RecipeRowView: View {
    @EnvironmentObject var appState: AppState
    let recipe: Recipe

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                if recipe.imageUrl != nil {
                    RecipeThumbnail(imageUrl: recipe.imageUrl, size: 44)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(recipe.name)
                        .font(.body)
                        .fontWeight(.semibold)

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
                                Text("\(effectiveServings)")
                                    .font(.headline)
                                    .monospacedDigit()
                                if isScaled {
                                    Text("(from \(originalServings))")
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
                        Text("Ingredients")
                            .font(.headline)

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

                        Button {
                            Task { await addIngredientsToGrocery() }
                        } label: {
                            Label("Add Ingredients to Grocery List", systemImage: "cart.badge.plus")
                                .font(.subheadline)
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .tint(.green)
                        .padding(.top, 4)
                    }

                    // Instructions
                    if let instructions = currentRecipe.instructions, !instructions.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Instructions")
                                .font(.headline)

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

    private func addIngredientsToGrocery() async {
        let existingNames = Set(appState.groceryItems.map { $0.name.lowercased() })
        let scale = servingScale
        var added = 0

        for foodId in currentRecipe.foodIds {
            guard let food = appState.foods.first(where: { $0.id == foodId }) else { continue }
            if existingNames.contains(food.name.lowercased()) { continue }

            let item = GroceryItem(
                id: UUID().uuidString,
                userId: "",
                name: food.name,
                category: food.category,
                quantity: max(1.0, (1.0 * scale).rounded()),
                unit: food.unit ?? "count",
                checked: false,
                addedVia: "recipe"
            )
            try? await appState.addGroceryItem(item)
            added += 1
        }

        if let additional = currentRecipe.additionalIngredients, !additional.isEmpty {
            let ingredients = additional
                .split(separator: ",")
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }

            for ingredient in ingredients {
                let scaledLine = isScaled
                    ? RecipeScaling.scaleIngredientLine(ingredient, scale: scale)
                    : ingredient
                guard !existingNames.contains(scaledLine.lowercased()) else { continue }

                let item = GroceryItem(
                    id: UUID().uuidString,
                    userId: "",
                    name: scaledLine,
                    category: "other",
                    quantity: 1,
                    unit: "",
                    checked: false,
                    addedVia: "recipe"
                )
                try? await appState.addGroceryItem(item)
                added += 1
            }
        }

        let toast = ToastManager.shared
        let scaleNote = isScaled ? " (scaled for \(effectiveServings) servings)" : ""
        toast.success(
            "Added to grocery list",
            message: "\(added) ingredients added\(scaleNote)."
        )
        HapticManager.success()
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
    @State private var showPastePrompt = false
    @State private var pasteboardURL: URL?

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
                        Text(importError)
                            .font(.caption)
                            .foregroundStyle(.red)
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
            .onAppear(perform: detectPasteboardURL)
            .alert("Import from \(pasteboardURL?.host ?? "clipboard")?", isPresented: $showPastePrompt, presenting: pasteboardURL) { url in
                Button("Import") {
                    importURL = url.absoluteString
                    Task { await importFromURL() }
                }
                Button("Not now", role: .cancel) {}
            } message: { url in
                Text(url.absoluteString)
                    .font(.caption)
            }
        }
    }

    // MARK: - Recipe URL import (US-223)

    private func detectPasteboardURL() {
        guard let clipboard = UIPasteboard.general.string,
              let url = RecipeImportService.firstURL(in: clipboard) else {
            return
        }
        // Only prompt if fields are empty (first-open heuristic) so we don't
        // pester users who are in the middle of editing.
        guard name.isEmpty, importURL.isEmpty else { return }
        pasteboardURL = url
        showPastePrompt = true
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
        let tagList = tags.isEmpty ? nil :
            tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }

        let recipeId = UUID().uuidString
        var imageUrl: String? = remoteImageUrl
        if let image = recipeImage {
            imageUrl = try? await ImageUploadService.upload(
                image: image,
                folder: .recipes,
                id: recipeId
            )
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

        try? await appState.addRecipe(recipe)
        dismiss()
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
