import SwiftUI

/// US-143: SwiftUI surface of the share extension. Calls the public
/// `parse-recipe` edge function with the shared URL, shows a preview, and
/// enqueues the parsed recipe into the App Group for the main app to persist
/// on next launch.
struct ShareImportView: View {
    let sharedURL: URL?
    let onDone: () -> Void
    let onCancel: () -> Void

    @State private var isLoading = false
    @State private var error: String?
    @State private var parsed: ParsedRecipe?

    var body: some View {
        NavigationStack {
            Group {
                if let parsed {
                    previewFor(parsed)
                } else if isLoading {
                    loading
                } else if let error {
                    errorView(error)
                } else if sharedURL == nil {
                    errorView("No recipe URL found in the shared item.")
                } else {
                    loading
                }
            }
            .navigationTitle("Save to EatPal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { onCancel() }
                }
                if parsed != nil {
                    ToolbarItem(placement: .primaryAction) {
                        Button("Save") { save() }
                            .fontWeight(.semibold)
                    }
                }
            }
        }
        .task {
            guard let url = sharedURL else { return }
            await fetchParsedRecipe(from: url)
        }
    }

    // MARK: - State views

    private var loading: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.4)
            Text("Reading recipe…")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func errorView(_ message: String) -> some View {
        ContentUnavailableView {
            Label("Couldn't import", systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
        } description: {
            Text(message)
        } actions: {
            Button("Close") { onCancel() }
                .buttonStyle(.borderedProminent)
        }
    }

    private func previewFor(_ recipe: ParsedRecipe) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let imageUrl = recipe.imageUrl, let url = URL(string: imageUrl) {
                    AsyncImage(url: url) { phase in
                        switch phase {
                        case .success(let image):
                            image
                                .resizable()
                                .scaledToFill()
                        default:
                            Color.secondary.opacity(0.1)
                        }
                    }
                    .frame(height: 160)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text(recipe.name)
                        .font(.title3)
                        .fontWeight(.semibold)

                    if let description = recipe.description, !description.isEmpty {
                        Text(description)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                metadataRow(recipe)

                if !recipe.ingredients.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Ingredients")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                        ForEach(recipe.ingredients, id: \.self) { ingredient in
                            Text("• \(ingredient)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if let instructions = recipe.instructions, !instructions.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Instructions")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                        Text(instructions)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding()
        }
    }

    private func metadataRow(_ recipe: ParsedRecipe) -> some View {
        HStack(spacing: 12) {
            if let prep = recipe.prepTime { metaChip("Prep", prep, icon: "timer") }
            if let cook = recipe.cookTime { metaChip("Cook", cook, icon: "flame.fill") }
            if let servings = recipe.servings { metaChip("Serves", servings, icon: "person.2.fill") }
        }
    }

    private func metaChip(_ label: String, _ value: String, icon: String) -> some View {
        Label("\(label): \(value)", systemImage: icon)
            .font(.caption2)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.secondary.opacity(0.12), in: Capsule())
    }

    // MARK: - Pipeline

    private func fetchParsedRecipe(from url: URL) async {
        isLoading = true
        defer { isLoading = false }

        do {
            let result = try await ShareExtensionAPI.parseRecipe(url: url)
            self.parsed = result
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func save() {
        guard let parsed, let sharedURL else { return }

        let pending = PendingRecipeImport(
            sourceUrl: sharedURL.absoluteString,
            name: parsed.name,
            description: parsed.description,
            imageUrl: parsed.imageUrl,
            instructions: parsed.instructions,
            prepTime: parsed.prepTime,
            cookTime: parsed.cookTime,
            servings: parsed.servings,
            additionalIngredients: parsed.ingredients.isEmpty
                ? nil
                : parsed.ingredients.joined(separator: "\n")
        )

        PendingRecipeImportQueue.enqueue(pending)
        onDone()
    }
}
