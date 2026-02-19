import SwiftUI

struct RecipesView: View {
    @EnvironmentObject var appState: AppState
    @State private var searchText = ""
    @State private var selectedRecipe: Recipe?
    @State private var showingAddRecipe = false
    @State private var selectedDifficulty: String?

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
                    RecipeRowView(recipe: recipe)
                        .contentShape(Rectangle())
                        .onTapGesture { selectedRecipe = recipe }
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                Task { try? await appState.deleteRecipe(recipe.id) }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Recipes")
        .searchable(text: $searchText, prompt: "Search recipes...")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingAddRecipe = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingAddRecipe) {
            AddRecipeView()
        }
        .sheet(item: $selectedRecipe) { recipe in
            RecipeDetailView(recipe: recipe)
        }
        .refreshable {
            await appState.loadAllData()
        }
    }

    private func difficultyIcon(_ level: String) -> String {
        switch level {
        case "easy": return "1.circle.fill"
        case "medium": return "2.circle.fill"
        case "hard": return "3.circle.fill"
        default: return "circle"
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

    private var currentRecipe: Recipe {
        appState.recipes.first { $0.id == recipe.id } ?? recipe
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
                        if let servings = currentRecipe.servings {
                            MetaBadge(icon: "person.2.fill", text: "\(servings) servings")
                        }
                        if let difficulty = currentRecipe.difficultyLevel {
                            MetaBadge(icon: "chart.bar.fill", text: difficulty.capitalized)
                        }
                    }

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
                            Text("Additional: \(additional)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
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
                        NutritionCard(nutrition: nutrition)
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
        }
    }

    private func addIngredientsToGrocery() async {
        let existingNames = Set(appState.groceryItems.map { $0.name.lowercased() })
        var added = 0

        for foodId in currentRecipe.foodIds {
            guard let food = appState.foods.first(where: { $0.id == foodId }) else { continue }
            if existingNames.contains(food.name.lowercased()) { continue }

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
            try? await appState.addGroceryItem(item)
            added += 1
        }

        if let additional = currentRecipe.additionalIngredients, !additional.isEmpty {
            let ingredients = additional.split(separator: ",").map {
                $0.trimmingCharacters(in: .whitespaces)
            }
            for ingredient in ingredients where !existingNames.contains(ingredient.lowercased()) {
                let item = GroceryItem(
                    id: UUID().uuidString,
                    userId: "",
                    name: ingredient,
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
        toast.success("Added to grocery list", message: "\(added) ingredients added.")
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

struct NutritionCard: View {
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
    @State private var recipeImage: UIImage?
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Recipe Photo") {
                    HStack {
                        Spacer()
                        ImagePicker(selectedImage: $recipeImage)
                        Spacer()
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

    private func createRecipe() async {
        isSubmitting = true
        let tagList = tags.isEmpty ? nil :
            tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }

        let recipeId = UUID().uuidString
        var imageUrl: String?
        if let image = recipeImage {
            imageUrl = try? await ImageUploadService.upload(
                image: image,
                folder: .recipes,
                id: recipeId
            )
        }

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
            imageUrl: imageUrl,
            tags: tagList,
            difficultyLevel: difficulty
        )

        try? await appState.addRecipe(recipe)
        dismiss()
    }
}

#Preview {
    NavigationStack {
        RecipesView()
    }
    .environmentObject(AppState())
}
