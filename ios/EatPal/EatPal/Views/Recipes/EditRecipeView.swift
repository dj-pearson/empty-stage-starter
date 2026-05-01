import SwiftUI

struct EditRecipeView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.dismiss) var dismiss

    let recipe: Recipe

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
    @State private var tips = ""
    @State private var recipeImage: UIImage?
    @State private var isSubmitting = false

    /// US-265: structured ingredient rows. Loaded from recipe.ingredients
    /// on appear; if that's empty and the legacy `additional_ingredients`
    /// string has content, we lazy-parse it once on first save.
    @State private var structuredIngredients: [RecipeIngredient] = []

    private let ingredientUnits = ["", "count", "oz", "lb", "g", "kg", "cups", "tbsp", "tsp", "ml", "l", "pinch", "clove", "slice"]

    var body: some View {
        NavigationStack {
            Form {
                // Image Section
                Section("Recipe Photo") {
                    HStack {
                        Spacer()
                        ImagePicker(selectedImage: $recipeImage, label: "Change Photo")
                        Spacer()
                    }

                    if recipeImage == nil, let imageUrl = recipe.imageUrl, !imageUrl.isEmpty {
                        HStack {
                            Spacer()
                            CachedAsyncImage(
                                url: URL(string: imageUrl),
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

                // US-265: Structured ingredient editor. Replaces the
                // legacy comma-string field. Each row carries name + qty
                // + unit; the legacy field stays in place as a fallback
                // for unmigrated recipes and for free-text overflow.
                Section {
                    ForEach($structuredIngredients) { $ing in
                        VStack(alignment: .leading, spacing: 6) {
                            TextField("Ingredient", text: $ing.name)
                            HStack(spacing: 8) {
                                TextField(
                                    "Qty",
                                    value: $ing.quantity,
                                    format: .number.precision(.fractionLength(0...2))
                                )
                                .keyboardType(.decimalPad)
                                .frame(width: 70)
                                .multilineTextAlignment(.trailing)

                                Picker("Unit", selection: Binding(
                                    get: { ing.unit ?? "" },
                                    set: { ing.unit = $0.isEmpty ? nil : $0 }
                                )) {
                                    ForEach(ingredientUnits, id: \.self) { u in
                                        Text(u.isEmpty ? "—" : u).tag(u)
                                    }
                                }
                                .labelsHidden()
                                .pickerStyle(.menu)

                                Spacer()
                            }
                        }
                        .padding(.vertical, 2)
                    }
                    .onDelete { offsets in
                        structuredIngredients.remove(atOffsets: offsets)
                        renumberSortOrders()
                    }
                    .onMove { source, destination in
                        structuredIngredients.move(fromOffsets: source, toOffset: destination)
                        renumberSortOrders()
                    }

                    Button {
                        appendBlankIngredient()
                    } label: {
                        Label("Add Ingredient", systemImage: "plus.circle.fill")
                    }
                } header: {
                    Text("Ingredients (\(structuredIngredients.count))")
                } footer: {
                    if structuredIngredients.isEmpty, !additionalIngredients.isEmpty {
                        Text("Tap Save to convert your existing free-text ingredients into structured rows.")
                            .font(.caption2)
                    }
                }

                Section("Additional Notes") {
                    TextField("Extra ingredients or notes (free text)", text: $additionalIngredients, axis: .vertical)
                        .lineLimit(3)
                }

                Section("Instructions") {
                    TextField("Step by step instructions", text: $instructions, axis: .vertical)
                        .lineLimit(8)
                }

                Section("Tips") {
                    TextField("Cooking tips and notes", text: $tips, axis: .vertical)
                        .lineLimit(4)
                }

                Section("Tags") {
                    TextField("Tags (comma separated)", text: $tags)
                        .textInputAutocapitalization(.never)
                }
            }
            .navigationTitle("Edit Recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task { await saveRecipe() }
                    }
                    .disabled(name.isEmpty || isSubmitting)
                }
            }
            .onAppear {
                name = recipe.name
                description = recipe.description ?? ""
                instructions = recipe.instructions ?? ""
                prepTime = recipe.prepTime ?? ""
                cookTime = recipe.cookTime ?? ""
                servings = recipe.servings ?? ""
                difficulty = recipe.difficultyLevel ?? "easy"
                selectedFoodIds = Set(recipe.foodIds)
                tags = recipe.tags?.joined(separator: ", ") ?? ""
                additionalIngredients = recipe.additionalIngredients ?? ""
                tips = recipe.tips ?? ""

                // US-265: structured ingredients arrive on the recipe via
                // AppState.attachIngredients. If the recipe pre-dates
                // this feature and has only the legacy comma-string,
                // structuredIngredients stays empty and we'll lazy-migrate
                // on first save.
                structuredIngredients = recipe.ingredients.sorted(by: { $0.sortOrder < $1.sortOrder })
            }
        }
    }

    // MARK: - US-265 ingredient editor helpers

    private func appendBlankIngredient() {
        structuredIngredients.append(
            .new(recipeId: recipe.id, sortOrder: structuredIngredients.count)
        )
    }

    private func renumberSortOrders() {
        for i in structuredIngredients.indices {
            structuredIngredients[i].sortOrder = i
        }
    }

    /// Lazy-migrate the legacy comma string into structured rows. Runs
    /// on first save when the user has no structured rows yet but the
    /// legacy field has content. Returns the rows that should be saved.
    private func resolveIngredientsForSave() -> [RecipeIngredient] {
        if !structuredIngredients.isEmpty {
            return structuredIngredients
                .filter { !$0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                .enumerated()
                .map { offset, ing in
                    var copy = ing
                    copy.sortOrder = offset
                    return copy
                }
        }
        if !additionalIngredients.isEmpty {
            return RecipeIngredientLegacyParser.parse(
                additionalIngredients,
                recipeId: recipe.id
            )
        }
        return []
    }

    private func saveRecipe() async {
        isSubmitting = true

        var imageUrl: String?
        if let image = recipeImage {
            imageUrl = try? await ImageUploadService.upload(
                image: image,
                folder: .recipes,
                id: recipe.id
            )
        }

        let tagList = tags.isEmpty ? nil :
            tags.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }

        let resolvedIngredients = resolveIngredientsForSave()

        // Once the user has structured rows we no longer need to keep the
        // legacy comma string in lockstep — clear it so future loads
        // can't double-insert from both sources.
        let legacyToPersist: String? = {
            if !resolvedIngredients.isEmpty { return nil }
            return additionalIngredients.isEmpty ? nil : additionalIngredients
        }()

        let updates = RecipeUpdate(
            name: name,
            description: description.isEmpty ? nil : description,
            instructions: instructions.isEmpty ? nil : instructions,
            foodIds: Array(selectedFoodIds),
            prepTime: prepTime.isEmpty ? nil : prepTime,
            cookTime: cookTime.isEmpty ? nil : cookTime,
            servings: servings.isEmpty ? nil : servings,
            tags: tagList,
            difficultyLevel: difficulty,
            imageUrl: imageUrl ?? recipe.imageUrl,
            additionalIngredients: legacyToPersist,
            tips: tips.isEmpty ? nil : tips
        )

        try? await appState.updateRecipeWithIngredients(
            recipe.id,
            updates: updates,
            ingredients: resolvedIngredients
        )
        dismiss()
    }
}
