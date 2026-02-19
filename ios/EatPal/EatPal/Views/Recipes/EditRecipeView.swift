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

                Section("Additional Ingredients") {
                    TextField("Extra ingredients (comma separated)", text: $additionalIngredients, axis: .vertical)
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
            }
        }
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
            additionalIngredients: additionalIngredients.isEmpty ? nil : additionalIngredients,
            tips: tips.isEmpty ? nil : tips
        )

        try? await appState.updateRecipe(recipe.id, updates: updates)
        dismiss()
    }
}
